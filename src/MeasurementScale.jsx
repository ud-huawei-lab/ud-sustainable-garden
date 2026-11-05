import { number } from "./data.js";
const scales = {
  uv: {
    label: "UV index",
    max: 12,
    unit: "",
    bands: [
      [3, "#00c853"],
      [3, "#ffcc00"],
      [2, "#ff8800"],
      [3, "#ff1744"],
      [1, "#a943ff"],
    ],
    ticks: ["0", "6", "12+"],
  },
  aqi: {
    label: "US AQI",
    max: 500,
    unit: "",
    bands: [
      [50, "#00c853"],
      [50, "#ffcc00"],
      [50, "#ff8800"],
      [50, "#ff1744"],
      [100, "#a943ff"],
      [200, "#b90054"],
    ],
    ticks: ["0", "150", "500"],
  },
  solar: {
    label: "Irradiance",
    max: 1200,
    unit: "W/m²",
    bands: [
      [400, "#00c853"],
      [400, "#ffcc00"],
      [400, "#ff1744"],
    ],
    ticks: ["0", "600", "1,200 W/m²"],
  },
};
export default function MeasurementScale({ type, value, compact = false }) {
  const scale = scales[type];
  const measured = number(value);
  if (!scale) return null;
  const position =
    measured == null
      ? null
      : Math.max(0, Math.min(100, (measured / scale.max) * 100));
  return (
    <div
      className={`measurement-scale ${compact ? "compact" : ""}`}
      role="img"
      aria-label={`${scale.label} scale${measured == null ? ", reading unavailable" : `, current reading ${measured} ${scale.unit}`}${type === "solar" ? ". Solar intensity; not a safety classification." : ""}`}
    >
      <div className="scale-track">
        {scale.bands.map(([width, color], index) => (
          <span key={index} style={{ flex: width, background: color }} />
        ))}
        {position !== null && (
          <i className="scale-marker" style={{ left: `${position}%` }} />
        )}
      </div>
      {!compact && (
        <div className="scale-ticks">
          {scale.ticks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
      )}
    </div>
  );
}
