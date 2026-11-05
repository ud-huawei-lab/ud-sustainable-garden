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
import { format } from "./data.js";
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
  ["Temperature", ["temperature"]],
  ["Humidity", ["humidity"]],
  ["Wind", ["wind", "direction"]],
  ["Pressure", ["pressure"]],
  ["Solar & UV", ["solar", "uv"]],
  ["Rainfall", ["rain"]],
  ["Air Quality", ["aqi"]],
];
export function SensorTiles({ entities, onSelect, history = false }) {
  return (
    <div className="sensor-groups">
      {groups.map(([label, types], index) => (
        <section
          className="sensor-group"
          key={label}
          aria-labelledby={`sensor-group-${history ? "history" : "overview"}-${index}`}
        >
          <h3 id={`sensor-group-${history ? "history" : "overview"}-${index}`}>
            {label}
          </h3>
          <div className="sensor-tiles">
            {sensorReadings
              .filter((sensor) => types.includes(sensor.group))
              .map((sensor) => {
                const Icon = icons[sensor.group];
                const raw = entities[sensor.entity]?.state;
                let value = sensor.categorical
                  ? !raw || ["unknown", "unavailable"].includes(raw)
                    ? "—"
                    : raw
                  : format(raw, sensor.unit === "lx" ? 0 : 1);
                if (sensor.key === "u_s_main_pollutant")
                  value =
                    {
                      p2: "PM2.5",
                      p1: "PM10",
                      o3: "O₃",
                      n2: "NO₂",
                      s2: "SO₂",
                      co: "CO",
                    }[raw] || value;
                return (
                  <button
                    className={`sensor-tile tone-${sensor.tone}`}
                    key={sensor.key}
                    onClick={() => onSelect(sensor.key)}
                    aria-label={`Open ${sensor.label} history`}
                  >
                    <span className="sensor-tile-top">
                      <Icon size={19} strokeWidth={1.6} />
                      <ArrowUpRight size={15} />
                    </span>
                    <span className="sensor-label">{sensor.label}</span>
                    <span
                      className={`sensor-value ${sensor.categorical ? "text-value" : ""}`}
                    >
                      {value}
                      <small>{sensor.unit}</small>
                    </span>
                    {[
                      "ambient_weather_uv_index",
                      "ambient_weather_irradiance",
                      "u_s_air_quality_index",
                    ].includes(sensor.key) && (
                      <MeasurementScale
                        type={
                          sensor.key === "ambient_weather_uv_index"
                            ? "uv"
                            : sensor.key === "ambient_weather_irradiance"
                              ? "solar"
                              : "aqi"
                        }
                        value={raw}
                        compact
                      />
                    )}
                    {history && (
                      <span className="sensor-history-link">
                        Explore history
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
export default function HistoryPage({ entities, onSelect }) {
  return (
    <section className="sensor-directory">
      <div className="directory-heading">
        <h2>Every sensor. Its own story.</h2>
        <p>
          Select a reading to explore its recorded history, compare dates, and
          export data.
        </p>
      </div>
      <SensorTiles entities={entities} onSelect={onSelect} history />
    </section>
  );
}
