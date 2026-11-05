import { useEffect, useRef, useState } from "react";
import {
  Cctv,
  RotateCcw,
  Move3D,
  Thermometer,
  Wind,
  Sun,
  Droplets,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  ChevronDown,
} from "lucide-react";
import { createGardenScene } from "./gardenScene.js";
import { read } from "./data.js";
export default function Home({ entities, dark, onHistory, onCameras }) {
  const host = useRef(null),
    markers = useRef([]),
    scene = useRef(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    try {
      scene.current = createGardenScene(host.current, dark, markers.current);
    } catch {
      setError(true);
    }
    return () => scene.current?.dispose();
  }, [dark]);
  const labels = [
    ["Weather station", "Outdoor sensors", () => onHistory("temperature")],
    ["Humidity extractors", "Two units", () => onHistory("humidity")],
    ["Plant pots", "Two pots · right of extractors", () => onCameras()],
    ["Water collection tank", "Extractor → tank → plants", () => onCameras()],
    ["Camera 1", "Extractor mount", onCameras],
    ["Camera 2", "Centre of parking canopy", onCameras],
  ];
  return (
    <section className="twin-page">
      <div className="twin-stage">
        <div ref={host} className="twin-canvas" />
        {error && (
          <div className="scene-fallback">
            This browser could not open the 3D view. Use Overview for sensor
            readings and Cameras for the live feeds.
          </div>
        )}
        <div className="scene-labels">
          {labels.map(([title, value, action], index) => (
            <button
              key={title}
              ref={(element) => (markers.current[index] = element)}
              className={`scene-label ${index >= 4 ? "camera-label" : ""}`}
              onClick={action}
            >
              {index >= 4 && <Cctv size={14} />}
              <strong>{title}</strong>
              <span>{value}</span>
            </button>
          ))}
        </div>
        <details className="scene-summary">
          <summary>
            <strong>Environment</strong>
            <span>
              {read(entities, "sensor.ambient_weather_temperature")} °C
            </span>
            <ChevronDown size={16} />
          </summary>
          <dl>
            {[
              [
                Thermometer,
                "Outdoor",
                read(entities, "sensor.ambient_weather_temperature"),
                "°C",
                "temperature",
              ],
              [
                Droplets,
                "Humidity",
                read(entities, "sensor.ambient_weather_humidity"),
                "%",
                "humidity",
              ],
              [
                Wind,
                "Wind",
                read(entities, "sensor.ambient_weather_wind_speed"),
                "km/h",
                "wind",
              ],
              [
                Sun,
                "Solar",
                read(entities, "sensor.ambient_weather_irradiance", 0),
                "W/m²",
                "solar",
              ],
            ].map(([Icon, label, value, unit, key]) => (
              <div key={key}>
                <dt>
                  <Icon size={15} />
                  {label}
                </dt>
                <dd>
                  <button onClick={() => onHistory(key)}>
                    {value}
                    <small> {unit}</small>
                  </button>
                </dd>
              </div>
            ))}
          </dl>
        </details>
        <div className="scene-controls">
          <span>
            <Move3D size={15} />
            Drag to orbit · scroll to zoom
          </span>
          <button
            className="icon-button"
            aria-label="Rotate garden left"
            onClick={() => scene.current?.orbit(-0.25)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Rotate garden right"
            onClick={() => scene.current?.orbit(0.25)}
          >
            <ChevronRight size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Zoom into garden"
            onClick={() => scene.current?.zoom(0.85)}
          >
            <Plus size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Zoom out of garden"
            onClick={() => scene.current?.zoom(1.15)}
          >
            <Minus size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Reset 3D view"
            onClick={() => scene.current?.reset()}
          >
            <RotateCcw size={17} />
          </button>
        </div>
      </div>
      <p className="reconstruction-note">
        Camera-informed 3D reconstruction. Plant shapes and positions are
        approximate; additional photographs and dimensions will improve the
        match. Flow animation illustrates the tubing route; it is not a measured
        flow rate.
      </p>
    </section>
  );
}
