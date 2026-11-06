import { ArrowUpRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { absoluteHumidity, vapourPressureDeficit } from "../shared/water.js";
import { format, getNumber, time } from "./data.js";
import { Chart } from "./History.jsx";
import InfoTip from "./InfoTip.jsx";
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

function useWater(range) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
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
  }, [range, attempt]);
  return { data, error, loading, retry: () => setAttempt((n) => n + 1) };
}

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

function CardHead({ title, info, range, setRange }) {
  return (
    <div className="water-head">
      <h2 className="panel-title">{title}</h2>
      <InfoTip label={`About ${title}`}>{info}</InfoTip>
      <Switch
        label={`${title} history range`}
        options={ranges}
        value={range}
        onChange={setRange}
      />
    </div>
  );
}

function HistoryChart({ result, build, switcher, skeleton }) {
  const { data, loading, error, retry } = result;
  const view = data && !loading && !error ? build(data) : null;
  return (
    <>
      <div className="chart-meta water-chart-head">
        <span>
          {view && (
            <>
              {view.metric.label} <small>({view.metric.unit})</small>
            </>
          )}
        </span>
        {switcher}
      </div>
      {loading && (
        <Skeleton
          kind="chart"
          shape={skeleton}
          label="Loading recorded readings"
        />
      )}
      {!loading && error && (
        <div className="chart-empty">
          <p>{error}</p>
          <button className="quiet-button" onClick={retry}>
            Try again
          </button>
        </div>
      )}
      {view && (
        <Chart data={view.chart} metric={{ ...view.metric, quiet: true }} />
      )}
    </>
  );
}

function DailyDrawer({ days, width, setWidth, onClose }) {
  const dialog = useRef(null);
  const resize = (next) =>
    setWidth(Math.round(Math.min(innerWidth * 0.92, Math.max(420, next))));
  useEffect(() => {
    dialog.current.showModal();
    dialog.current.focus();
  }, []);
  const past = days.filter((day) => !day.partial).reverse();
  return (
    <dialog
      ref={dialog}
      className="water-drawer water-days"
      tabIndex={-1}
      aria-label="Daily values"
      style={width ? { width } : undefined}
      onClose={onClose}
      onClick={(event) => {
        const { left } = dialog.current.getBoundingClientRect();
        if (event.target === dialog.current && event.clientX < left)
          dialog.current.close();
      }}
    >
      <div
        className="water-drawer-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize daily values"
        aria-valuenow={width ?? 760}
        tabIndex={0}
        onPointerDown={(event) =>
          event.currentTarget.setPointerCapture(event.pointerId)
        }
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            resize(innerWidth - event.clientX);
        }}
        onKeyDown={(event) => {
          const step = { ArrowLeft: 32, ArrowRight: -32 }[event.key];
          if (!step) return;
          event.preventDefault();
          resize(dialog.current.offsetWidth + step);
        }}
      />
      <header>
        <h2>Daily values</h2>
        <button
          className="icon-button"
          aria-label="Close daily values"
          onClick={() => dialog.current.close()}
        >
          <X size={20} />
        </button>
      </header>
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
                  <td colSpan={6}>Too little station data</td>
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
    </dialog>
  );
}

function AirMoisture({ entities, onHistory }) {
  const [range, setRange] = useState("7d");
  const [moisture, setMoisture] = useState("absolute");
  const result = useWater(range);
  const { data } = result;
  const temperature = getNumber(entities, "sensor.ambient_weather_temperature");
  const humidity = getNumber(entities, "sensor.ambient_weather_humidity");
  const dewPoint = getNumber(entities, "sensor.ambient_weather_dew_point");
  const rangeName = ranges.find(([key]) => key === range)[1];
  const series =
    moisture === "absolute" ? data?.absoluteHumidity : data?.dewPoint;
  return (
    <Panel className="water-panel">
      <CardHead
        title="Air moisture"
        range={range}
        setRange={setRange}
        info="Water vapour in each cubic metre of outdoor air, calculated from temperature and humidity. This is the water available to the extractors."
      />
      <p className="medium-reading">
        {format(absoluteHumidity(temperature, humidity))}
        <span> g/m³</span>
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
          {format(series?.stats.mean)}
          <small> {series?.unit}</small>
        </Stat>
      </dl>
      <HistoryChart
        result={result}
        switcher={
          <Switch
            label="Air moisture measure"
            options={[
              ["absolute", "Absolute humidity"],
              ["dew", "Dew point"],
            ]}
            value={moisture}
            onChange={setMoisture}
          />
        }
        build={(loaded) => {
          const shown =
            moisture === "absolute" ? loaded.absoluteHumidity : loaded.dewPoint;
          return {
            chart: {
              start: loaded.start,
              end: loaded.end,
              series: [shown],
            },
            metric: {
              label:
                moisture === "absolute"
                  ? "Absolute humidity, calculated"
                  : "Dew point",
              unit: shown.unit,
              nonNegative: moisture === "absolute",
            },
          };
        }}
      />
    </Panel>
  );
}

function PlantDemand({ entities }) {
  const [range, setRange] = useState("7d");
  const [demand, setDemand] = useState("et0");
  const [drawer, setDrawer] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(null);
  const result = useWater(range);
  const { data } = result;
  const temperature = getNumber(entities, "sensor.ambient_weather_temperature");
  const humidity = getNumber(entities, "sensor.ambient_weather_humidity");
  const latest = data?.days.filter((day) => day.et0 != null).at(-1);
  const today = data?.days.find((day) => day.partial);
  return (
    <Panel className="water-panel">
      <CardHead
        title="Plant demand"
        range={range}
        setRange={setRange}
        info={`FAO-56 ET₀ and VPD, calculated from station data. ET₀ is a reference for short grass, not these trees. Assumes a ${data?.assumptions.windHeight ?? 3} m wind sensor and ${data?.assumptions.elevation ?? 30} m elevation. Days with too little data stay blank.`}
      />
      <div className="water-reading">
        <p className="medium-reading">
          {format(latest?.et0)}
          <span>
            {" "}
            mm/day{latest ? ` on ${time(latest.time, dayLabel)}` : ""}
          </span>
        </p>
        {data && (
          <button
            className="water-drawer-button"
            onClick={() => setDrawer(true)}
          >
            Daily values
            <ArrowUpRight size={14} />
          </button>
        )}
      </div>
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
      <HistoryChart
        result={result}
        skeleton={demand === "et0" ? "bars" : "line"}
        switcher={
          <Switch
            label="Plant demand measure"
            options={[
              ["et0", "Daily ET₀"],
              ["vpd", "Vapour pressure deficit"],
            ]}
            value={demand}
            onChange={setDemand}
          />
        }
        build={(loaded) =>
          demand === "et0"
            ? {
                chart: {
                  start: loaded.et0.start,
                  end: loaded.et0.end,
                  series: [loaded.et0],
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
                  start: loaded.start,
                  end: loaded.end,
                  series: [loaded.vpd],
                },
                metric: {
                  label: "VPD, calculated",
                  unit: "kPa",
                  nonNegative: true,
                },
              }
        }
      />
      {drawer && data && (
        <DailyDrawer
          days={data.days}
          width={drawerWidth}
          setWidth={setDrawerWidth}
          onClose={() => setDrawer(false)}
        />
      )}
    </Panel>
  );
}

export default function WaterPage({ entities, onHistory }) {
  return (
    <section className="water-page" aria-label="Air moisture and plant demand">
      <div className="water-grid">
        <AirMoisture entities={entities} onHistory={onHistory} />
        <PlantDemand entities={entities} />
      </div>
    </section>
  );
}
