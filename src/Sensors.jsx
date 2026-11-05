import {
  ArrowUpRight,
  Thermometer,
  Droplets,
  Wind,
  Gauge,
  Sun,
  CloudRain,
  Waves,
} from "lucide-react";
import { sensorReadings } from "../shared/catalog.js";
import { format, getNumber, bearing } from "./data.js";
import MeasurementScale from "./MeasurementScale.jsx";

const icons = {
  temperature: Thermometer,
  humidity: Droplets,
  wind: Wind,
  direction: Wind,
  pressure: Gauge,
  uv: Sun,
  solar: Sun,
  rain: CloudRain,
  aqi: Waves,
};
const groups = [
  {
    key: "temperature",
    label: "Temperature",
    types: ["temperature"],
    lead: "ambient_weather_temperature",
  },
  { key: "humidity", label: "Humidity", types: ["humidity"] },
  {
    key: "wind",
    label: "Wind",
    types: ["wind", "direction"],
    lead: "ambient_weather_wind_speed",
  },
  {
    key: "pressure",
    label: "Pressure",
    types: ["pressure"],
    lead: "ambient_weather_relative_pressure",
  },
  {
    key: "solar",
    label: "Solar & UV",
    types: ["solar", "uv"],
    lead: "ambient_weather_irradiance",
  },
  {
    key: "rain",
    label: "Rainfall",
    types: ["rain"],
    lead: "ambient_weather_precipitation_intensity",
  },
  {
    key: "air",
    label: "Air quality",
    types: ["aqi"],
    lead: "u_s_air_quality_index",
  },
];
const scaleTypes = {
  ambient_weather_uv_index: "uv",
  ambient_weather_irradiance: "solar",
  u_s_air_quality_index: "aqi",
};
const pollutantLabels = {
  p2: "PM2.5",
  p1: "PM10",
  o3: "O₃",
  n2: "NO₂",
  s2: "SO₂",
  co: "CO",
};

function WindDial({ entities }) {
  const direction =
    getNumber(
      entities,
      "sensor.ambient_weather_wind_direction_average_10_minutes",
    ) ?? getNumber(entities, "sensor.ambient_weather_wind_direction");
  return (
    <div className="tile-wind-dial" aria-hidden="true">
      <svg viewBox="0 0 160 160">
        <circle cx="80" cy="80" r="66" />
        {Array.from({ length: 24 }, (_, i) => (
          <line
            key={i}
            x1="80"
            y1="14"
            x2="80"
            y2={i % 6 === 0 ? 25 : 19}
            transform={`rotate(${i * 15} 80 80)`}
          />
        ))}
        <text x="80" y="39">
          N
        </text>
        <text x="123" y="84">
          E
        </text>
        <text x="80" y="128">
          S
        </text>
        <text x="37" y="84">
          W
        </text>
        {direction !== null && (
          <path
            d="M80 17 L74 37 L86 37 Z"
            transform={`rotate(${direction} 80 80)`}
          />
        )}
      </svg>
      <span>{bearing(direction)}</span>
    </div>
  );
}
function SensorTile({ sensor, entities, onSelect, featured }) {
  const Icon = icons[sensor.group];
  const raw = entities[sensor.entity]?.state;
  let value = sensor.categorical
    ? !raw || ["unknown", "unavailable"].includes(raw)
      ? "—"
      : raw
    : format(raw, ["lx", "US AQI", "°"].includes(sensor.unit) ? 0 : 1);
  if (sensor.key === "u_s_main_pollutant")
    value = pollutantLabels[raw] || value;
  const scale = scaleTypes[sensor.key];
  return (
    <button
      className={`sensor-tile ${featured ? "sensor-featured" : ""} tile-${sensor.key}`}
      onClick={() => onSelect(sensor.key)}
      aria-label={`Open ${sensor.label} history`}
    >
      <span className="sensor-tile-top">
        <Icon size={19} strokeWidth={1.5} />
        <ArrowUpRight size={15} />
      </span>
      <span className="sensor-label">{sensor.label}</span>
      <span
        className={`sensor-value ${sensor.categorical ? "text-value" : ""}`}
      >
        {value}
        <small>{sensor.unit}</small>
      </span>
      {sensor.key === "ambient_weather_wind_speed" && (
        <WindDial entities={entities} />
      )}
      {scale && (
        <MeasurementScale type={scale} value={raw} compact={!featured} />
      )}
      <span className="sensor-history-link">
        View history
        <ArrowUpRight size={11} />
      </span>
    </button>
  );
}
export default function ReadingPage({ entities, onSelect }) {
  const renderGroup = (group) => {
    const sensors = sensorReadings.filter((sensor) =>
      group.types.includes(sensor.group),
    );
    if (group.key === "solar")
      sensors.sort(
        (a, b) => Number(b.key === group.lead) - Number(a.key === group.lead),
      );
    return (
      <section
        key={group.key}
        className={`reading-group reading-group-${group.key}`}
        aria-labelledby={`reading-${group.key}`}
      >
        <h3 id={`reading-${group.key}`}>{group.label}</h3>
        <div className="reading-group-tiles">
          {sensors.map((sensor) => (
            <SensorTile
              key={sensor.key}
              sensor={sensor}
              entities={entities}
              onSelect={onSelect}
              featured={sensor.key === group.lead}
            />
          ))}
        </div>
      </section>
    );
  };
  return (
    <section
      className="reading-page reading-columnar"
      aria-labelledby="reading-heading"
    >
      <div className="reading-intro">
        <div>
          <h2 id="reading-heading">The garden, in detail.</h2>
          <p>
            Current measurements and their recorded history. Select any reading
            to explore.
          </p>
        </div>
        <span>23 sensors · 7 categories</span>
      </div>
      <div className="reading-mosaic">
        {[
          ["temperature", "solar"],
          ["wind", "humidity", "pressure"],
          ["air", "rain"],
        ].map((keys, index) => (
          <div className="reading-column" key={index}>
            {keys.map((key) =>
              renderGroup(groups.find((group) => group.key === key)),
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
