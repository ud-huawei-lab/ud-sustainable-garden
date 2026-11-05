import { useState } from "react";
import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  Moon,
  Sunrise,
  Sunset,
  ArrowUpRight,
  House,
} from "lucide-react";
import { read, getNumber, format, bearing, time } from "./data.js";
import MeasurementScale from "./MeasurementScale.jsx";

export function Panel({ title, children, className = "", ...props }) {
  return (
    <section className={`panel ${className}`} {...props}>
      {title && <h2 className="panel-title">{title}</h2>}
      {children}
    </section>
  );
}
export function Stat({ label, children, onClick }) {
  return (
    <div className="stat">
      <dt>
        {onClick ? (
          <button onClick={onClick}>
            {label}
            <ArrowUpRight size={11} />
          </button>
        ) : (
          label
        )}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
export function Headline({ entities, onHistory }) {
  const [mode, setMode] = useState("outdoor");
  const cabinet = mode === "cabinet";
  const id = cabinet
    ? "sensor.ambient_weather_inside_temperature"
    : "sensor.ambient_weather_temperature";
  const condition = entities["weather.forecast_home"]?.state;
  const known = {
    sunny: ["Sunny", Sun],
    "clear-night": ["Clear night", Moon],
    partlycloudy: ["Partly cloudy", CloudSun],
    cloudy: ["Cloudy", Cloud],
    rainy: ["Rain", CloudRain],
  };
  const [label, Icon] = cabinet
    ? ["Weather station cabinet", House]
    : known[condition] || ["Outdoor conditions", CloudSun];
  return (
    <Panel className="headline">
      <div className="segmented" aria-label="Temperature location">
        {["outdoor", "cabinet"].map((value) => (
          <button
            key={value}
            aria-pressed={mode === value}
            className={mode === value ? "selected" : ""}
            onClick={() => setMode(value)}
          >
            {value === "outdoor" ? "Outdoor" : "Cabinet"}
          </button>
        ))}
      </div>
      <div className="headline-reading">
        <p className="condition">
          <Icon size={18} strokeWidth={1.5} />
          {label}
        </p>
        <button
          className="big-reading"
          onClick={() => onHistory("temperature")}
          aria-label="Open temperature history"
        >
          {read(entities, id)}
          <span>°C</span>
        </button>
      </div>
      <dl className="stat-row">
        {cabinet ? (
          <>
            <Stat label="Humidity" onClick={() => onHistory("humidity")}>
              {read(entities, "sensor.ambient_weather_humidity_indoor")}
              <small>%</small>
            </Stat>
            <Stat label="Outdoor">
              {read(entities, "sensor.ambient_weather_temperature")}
              <small>°C</small>
            </Stat>
            <Stat label="Pressure" onClick={() => onHistory("pressure")}>
              {read(entities, "sensor.ambient_weather_relative_pressure")}
              <small> hPa</small>
            </Stat>
          </>
        ) : (
          <>
            <Stat label="Feels like">
              {read(entities, "sensor.ambient_weather_feels_like")}
              <small>°C</small>
            </Stat>
            <Stat label="Humidity" onClick={() => onHistory("humidity")}>
              {read(entities, "sensor.ambient_weather_humidity")}
              <small>%</small>
            </Stat>
            <Stat label="Dew point">
              {read(entities, "sensor.ambient_weather_dew_point")}
              <small>°C</small>
            </Stat>
          </>
        )}
      </dl>
    </Panel>
  );
}
export function Solar({ entities, onHistory }) {
  const nextRise = Date.parse(
    entities["sensor.sun_next_rising"]?.state ||
      entities["sun.sun"]?.attributes?.next_rising,
  );
  const nextSet = Date.parse(
    entities["sensor.sun_next_setting"]?.state ||
      entities["sun.sun"]?.attributes?.next_setting,
  );
  const up = entities["sun.sun"]?.state === "above_horizon";
  const rise = nextRise > nextSet && up ? nextRise - 86400000 : nextRise;
  const set = nextSet < rise ? nextSet + 86400000 : nextSet;
  const valid = Number.isFinite(rise) && Number.isFinite(set) && set > rise;
  const progress = valid
    ? Math.max(0, Math.min(1, (Date.now() - rise) / (set - rise)))
    : null;
  const uv = getNumber(entities, "sensor.ambient_weather_uv_index");
  const uvLabel =
    uv == null
      ? ""
      : uv < 3
        ? "Low"
        : uv < 6
          ? "Moderate"
          : uv < 8
            ? "High"
            : uv < 11
              ? "Very high"
              : "Extreme";
  const duration = valid
    ? `${Math.floor((set - rise) / 3600000)}h ${Math.floor((set - rise) / 60000) % 60}m of daylight`
    : "Sun times unavailable";
  return (
    <Panel className="solar">
      <div className="sun-summary">
        <div>
          <p>{valid ? `Sunset ${time(set)}` : "Sun path"}</p>
          <span>
            {valid
              ? `Next sunrise ${time(nextRise)}`
              : "Waiting for sun readings"}
          </span>
        </div>
        <span>{duration}</span>
      </div>
      <svg
        className="sun-path"
        viewBox="0 0 720 130"
        role="img"
        aria-label={
          valid
            ? `Sunrise ${time(rise)}, sunset ${time(set)}`
            : "Sun times unavailable"
        }
      >
        <path d="M 30 112 Q 360 -25 690 112" className="sun-guide" />
        <path d="M 30 112 Q 360 150 690 112" className="sun-guide lower" />
        <line x1="24" y1="112" x2="696" y2="112" className="sun-baseline" />
        {progress != null && (
          <>
            <path
              d="M 30 112 Q 360 -25 690 112"
              className="sun-arc"
              pathLength="100"
              strokeDasharray={`${progress * 100} 100`}
            />
            <circle
              cx={30 + 660 * progress}
              cy={112 - 274 * progress * (1 - progress)}
              r="5"
              className="sun-position"
            />
          </>
        )}
      </svg>
      <div className="sun-times">
        <div>
          <Sunrise size={15} />
          <span>Sunrise</span>
          <strong>{valid ? time(rise) : "—"}</strong>
        </div>
        <div>
          <Sunset size={15} />
          <span>Sunset</span>
          <strong>{valid ? time(set) : "—"}</strong>
        </div>
      </div>
      <dl className="stat-row solar-stats">
        <Stat label="UV index" onClick={() => onHistory("uv")}>
          {format(uv)} <em>{uvLabel}</em>
          <MeasurementScale type="uv" value={uv} compact />
        </Stat>
        <Stat label="Irradiance" onClick={() => onHistory("solar")}>
          {read(entities, "sensor.ambient_weather_irradiance", 0)}
          <small> W/m²</small>
          <MeasurementScale
            type="solar"
            value={getNumber(entities, "sensor.ambient_weather_irradiance")}
            compact
          />
        </Stat>
        <Stat label="Illuminance">
          {read(entities, "sensor.ambient_weather_illuminance", 0)}
          <small> lx</small>
        </Stat>
      </dl>
    </Panel>
  );
}
export function WindPanel({ entities, onHistory }) {
  const [gust, setGust] = useState(false);
  const direction =
    getNumber(
      entities,
      "sensor.ambient_weather_wind_direction_average_10_minutes",
    ) ?? getNumber(entities, "sensor.ambient_weather_wind_direction");
  return (
    <Panel title="Wind" className="wind-panel">
      <div className="wind-content">
        <button
          className="compass"
          onClick={() => setGust((v) => !v)}
          aria-label={`Show ${gust ? "wind speed" : "wind gust"}`}
        >
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r="85" />
            {Array.from({ length: 24 }, (_, i) => (
              <line
                key={i}
                x1="100"
                y1="15"
                x2="100"
                y2={i % 6 === 0 ? "27" : "20"}
                transform={`rotate(${i * 15} 100 100)`}
              />
            ))}
            {direction != null && (
              <path
                d="M 100 15 L 94 34 L 106 34 Z"
                transform={`rotate(${direction} 100 100)`}
                className="wind-pointer"
              />
            )}
            <text x="100" y="40">
              N
            </text>
            <text x="163" y="104">
              E
            </text>
            <text x="100" y="167">
              S
            </text>
            <text x="37" y="104">
              W
            </text>
          </svg>
          <span className="compass-reading">
            {read(
              entities,
              gust
                ? "sensor.ambient_weather_wind_gust"
                : "sensor.ambient_weather_wind_speed",
            )}
            <small>km/h{gust ? " · gust" : ""}</small>
          </span>
        </button>
        <dl className="wind-stats">
          <Stat label="From" onClick={() => onHistory("direction")}>
            {bearing(direction)} {format(direction, 0)}°
          </Stat>
          <Stat label="Gust" onClick={() => onHistory("wind")}>
            {read(entities, "sensor.ambient_weather_wind_gust")}
            <small> km/h</small>
          </Stat>
          <Stat label="Max gust today">
            {read(entities, "sensor.ambient_weather_max_gust")}
            <small> km/h</small>
          </Stat>
        </dl>
      </div>
    </Panel>
  );
}
export function RainPanel({ entities, onHistory }) {
  const rate = getNumber(
    entities,
    "sensor.ambient_weather_precipitation_intensity",
  );
  return (
    <Panel title="Rain" className="rain-panel">
      <button className="medium-reading" onClick={() => onHistory("rain")}>
        {format(rate)}
        <span> mm/h</span>
      </button>
      <p className="secondary">
        {rate == null
          ? "Rain reading unavailable"
          : rate === 0
            ? "Dry right now"
            : "Rainfall measured at the station"}
      </p>
      <dl className="stat-row">
        {[
          ["Today", "daily"],
          ["This week", "weekly"],
          ["This month", "monthly"],
        ].map(([label, key]) => (
          <Stat key={key} label={label}>
            {read(entities, `sensor.ambient_weather_${key}_rain`)}
            <small> mm</small>
          </Stat>
        ))}
      </dl>
    </Panel>
  );
}
export function AirPanel({ entities, onHistory }) {
  const aqi = getNumber(entities, "sensor.u_s_air_quality_index");
  const category = entities["sensor.u_s_air_pollution_level"]?.state;
  const text =
    category && !["unknown", "unavailable"].includes(category)
      ? category
      : aqi == null
        ? ""
        : aqi <= 50
          ? "Good"
          : aqi <= 100
            ? "Moderate"
            : aqi <= 150
              ? "Unhealthy for sensitive groups"
              : aqi <= 200
                ? "Unhealthy"
                : "Very unhealthy";
  const rawPollutant = entities["sensor.u_s_main_pollutant"]?.state;
  const pollutant =
    { p2: "PM2.5", p1: "PM10", o3: "O₃", n2: "NO₂", s2: "SO₂", co: "CO" }[
      rawPollutant
    ] || rawPollutant;
  return (
    <Panel title="Air quality" className="air-panel">
      <button className="medium-reading" onClick={() => onHistory("aqi")}>
        {format(aqi, 0)}
        <em>{text}</em>
      </button>
      <p className="secondary">
        US AQI
        {pollutant && !["unknown", "unavailable"].includes(pollutant)
          ? `, mainly ${pollutant.toUpperCase().replace("PM2_5", "PM2.5")}`
          : ""}
      </p>
      <MeasurementScale type="aqi" value={aqi} />
      <dl className="stat-row air-footer">
        <Stat label="Pressure" onClick={() => onHistory("pressure")}>
          {read(entities, "sensor.ambient_weather_relative_pressure")}
          <small> hPa</small>
        </Stat>
        <Stat label="IQAir updated">
          {time(entities["sensor.u_s_air_quality_index"]?.updated)}
        </Stat>
      </dl>
    </Panel>
  );
}
