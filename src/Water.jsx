import { useEffect, useState } from "react";
import { absoluteHumidity, vapourPressureDeficit } from "../shared/water.js";
import { format, getNumber, time } from "./data.js";
import { Chart } from "./History.jsx";
import Skeleton from "./Skeleton.jsx";
import { Panel, Stat } from "./Weather.jsx";

const ranges = [
  ["7d", "7 days"],
  ["30d", "30 days"],
];
const dayLabel = {
  day: "numeric",
  month: "short",
  hour: undefined,
  minute: undefined,
};
const span = (low, high, decimals = 0) =>
  low == null || high == null
    ? "—"
    : `${format(low, decimals)} to ${format(high, decimals)}`;

function Switch({ label, options, value, onChange }) {
  return (
    <div className="range-control water-switch" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button
          key={key}
          className={value === key ? "selected" : ""}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function HistoryChart({ data, loading, error, onRetry, build }) {
  if (loading)
    return <Skeleton kind="chart" label="Loading recorded readings" />;
  if (error)
    return (
      <div className="chart-empty">
        <p>{error}</p>
        <button className="quiet-button" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  if (!data) return null;
  const { chart, metric } = build(data);
  return (
    <>
      <div className="chart-meta">
        <span>
          {metric.label} <small>{metric.unit}</small>
        </span>
      </div>
      <Chart data={chart} metric={metric} />
    </>
  );
}

function DailyValues({ days }) {
  const past = days.filter((day) => !day.partial).reverse();
  return (
    <details className="panel water-days">
      <summary>Daily values</summary>
      <div className="categorical-history">
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>ET₀ · mm</th>
              <th>VPD peak · kPa</th>
              <th>Temperature · °C</th>
              <th>Humidity · %</th>
              <th>Wind at 2 m · m/s</th>
              <th>Solar · MJ/m²</th>
            </tr>
          </thead>
          <tbody>
            {past.map((day) => (
              <tr key={day.date}>
                <td>{time(day.time, dayLabel)}</td>
                {day.et0 == null ? (
                  <td colSpan={6}>
                    Not calculated, the station reported too little of this day
                  </td>
                ) : (
                  <>
                    <td>{format(day.et0)}</td>
                    <td>{format(day.vpdPeak)}</td>
                    <td>{span(day.tMin, day.tMax)}</td>
                    <td>{span(day.rhMin, day.rhMax)}</td>
                    <td>{format(day.wind2m)}</td>
                    <td>{format(day.solar)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function WaterPage({ entities, onHistory }) {
  const [range, setRange] = useState("7d");
  const [moisture, setMoisture] = useState("absolute");
  const [demand, setDemand] = useState("et0");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/water?range=${range}`, { signal: ctrl.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result;
      })
      .then(setData)
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setData(null);
        setError(e.message || "Water insights could not be loaded.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [range, retry]);

  const temperature = getNumber(entities, "sensor.ambient_weather_temperature");
  const humidity = getNumber(entities, "sensor.ambient_weather_humidity");
  const dewPoint = getNumber(entities, "sensor.ambient_weather_dew_point");
  const rangeName = ranges.find(([key]) => key === range)[1];
  const latest = data?.days.filter((day) => day.et0 != null).at(-1);
  const today = data?.days.find((day) => day.partial);
  const moistureSeries =
    moisture === "absolute" ? data?.absoluteHumidity : data?.dewPoint;

  return (
    <section className="water-page" aria-label="Air moisture and plant demand">
      <div className="water-toolbar">
        <Switch
          label="Water history range"
          options={ranges}
          value={range}
          onChange={setRange}
        />
      </div>
      <div className="water-grid">
        <Panel title="Air moisture" className="water-panel">
          <p className="medium-reading">
            {format(absoluteHumidity(temperature, humidity))}
            <span> g/m³</span>
          </p>
          <p className="secondary">
            Water vapour in each cubic metre of outdoor air now. This is the
            water available to the extractors. Calculated from temperature and
            humidity.
          </p>
          <dl className="stat-row">
            <Stat
              label="Dew point"
              onClick={() => onHistory("ambient_weather_dew_point")}
            >
              {format(dewPoint)}
              <small> °C</small>
            </Stat>
            <Stat label="Humidity" onClick={() => onHistory("humidity")}>
              {format(humidity, 0)}
              <small> %</small>
            </Stat>
            <Stat
              label={
                data?.limitedBy
                  ? `Average since ${time(data.start, dayLabel)}`
                  : `Average, ${rangeName}`
              }
            >
              {format(moistureSeries?.stats.mean)}
              <small> {moistureSeries?.unit}</small>
            </Stat>
          </dl>
          <Switch
            label="Air moisture measure"
            options={[
              ["absolute", "Absolute humidity"],
              ["dew", "Dew point"],
            ]}
            value={moisture}
            onChange={setMoisture}
          />
          <HistoryChart
            data={data}
            loading={loading}
            error={error}
            onRetry={() => setRetry((v) => v + 1)}
            build={(result) => {
              const series =
                moisture === "absolute"
                  ? result.absoluteHumidity
                  : result.dewPoint;
              return {
                chart: {
                  start: result.start,
                  end: result.end,
                  series: [series],
                },
                metric: {
                  label:
                    moisture === "absolute"
                      ? "Absolute humidity, calculated"
                      : "Dew point",
                  unit: series.unit,
                  nonNegative: moisture === "absolute",
                },
              };
            }}
          />
        </Panel>
        <Panel title="Plant demand" className="water-panel">
          <p className="medium-reading">
            {format(latest?.et0)}
            <span> mm/day</span>
          </p>
          <p className="secondary">
            Reference evapotranspiration (ET₀)
            {latest ? ` for ${time(latest.time, dayLabel)}` : ""}. A calculated
            estimate for short grass, not measured water use of these trees.
          </p>
          <dl className="stat-row">
            <Stat label="VPD now">
              {format(vapourPressureDeficit(temperature, humidity))}
              <small> kPa</small>
            </Stat>
            <Stat label="VPD peak today">
              {format(today?.vpdPeak)}
              <small> kPa</small>
            </Stat>
            <Stat label={`ET₀ average, ${data?.et0.stats.days ?? 0} days`}>
              {format(data?.et0.stats.mean)}
              <small> mm/day</small>
            </Stat>
          </dl>
          <Switch
            label="Plant demand measure"
            options={[
              ["et0", "Daily ET₀"],
              ["vpd", "Vapour pressure deficit"],
            ]}
            value={demand}
            onChange={setDemand}
          />
          <HistoryChart
            data={data}
            loading={loading}
            error={error}
            onRetry={() => setRetry((v) => v + 1)}
            build={(result) =>
              demand === "et0"
                ? {
                    chart: {
                      start: result.et0.start,
                      end: result.et0.end,
                      series: [result.et0],
                    },
                    metric: {
                      label: "Daily ET₀, calculated",
                      unit: "mm/day",
                      bars: true,
                      daily: true,
                    },
                  }
                : {
                    chart: {
                      start: result.start,
                      end: result.end,
                      series: [result.vpd],
                    },
                    metric: {
                      label: "VPD, calculated",
                      unit: "kPa",
                      nonNegative: true,
                    },
                  }
            }
          />
        </Panel>
      </div>
      {data && <DailyValues days={data.days} />}
      {data && (
        <p className="chart-footnote water-note">
          ET₀ is calculated with FAO-56 Penman-Monteith from station
          temperature, humidity, wind and irradiance. Vapour pressure deficit
          (VPD) is calculated from temperature and humidity. 1 mm of ET₀ is 1 L
          per m² of canopy. Assumed: wind sensor at{" "}
          {data.assumptions.windHeight} m, which can shift ET₀ by up to about
          6%, and site elevation {data.assumptions.elevation} m. Neither is
          surveyed. A day is calculated only when the station covers at least
          90% of it, so today and days with outages stay blank.
          {data.limitedBy
            ? ` Recorded history starts on ${time(data.start, dayLabel)}.`
            : ""}
        </p>
      )}
    </section>
  );
}
