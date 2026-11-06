import { useEffect, useRef, useState } from "react";
import {
  Cctv,
  RotateCcw,
  Thermometer,
  Wind,
  Sun,
  Droplets,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  ChevronDown,
  Settings2,
  Play,
  Pause,
} from "lucide-react";
import { createGardenScene } from "./gardenScene.js";
import { read } from "./data.js";
import { gardenTrees } from "../shared/garden-layout.js";
import { sceneWind, sceneBrightness } from "../shared/scene-weather.js";
export default function Home({ entities, dark, onHistory, onCameras }) {
  const host = useRef(null),
    markers = useRef([]),
    scene = useRef(null);
  const [error, setError] = useState(false);
  const [view, setView] = useState("3d");
  const [revolving, setRevolving] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [sunMode, setSunMode] = useState("live");
  const [sunEnabled, setSunEnabled] = useState(false);
  const [sunHour, setSunHour] = useState(6);
  useEffect(() => {
    try {
      setError(false);
      scene.current = createGardenScene(host.current, dark, markers.current, {
        view,
        sunHour,
        onSunTime: setSunHour,
      });
    } catch {
      setError(true);
    }
    return () => scene.current?.dispose();
  }, [dark, view]);
  useEffect(() => {
    scene.current?.setRevolving(revolving);
    scene.current?.setLabelsVisible(showLabels);
  }, [revolving, showLabels, dark, view]);
  useEffect(() => {
    scene.current?.setSunEnabled(sunEnabled);
    scene.current?.setSunMode(sunMode);
    scene.current?.setWeather(
      sceneWind(
        entities["sensor.ambient_weather_wind_speed"],
        entities["sensor.ambient_weather_wind_direction"],
      ),
      entities["sun.sun"],
      sceneBrightness(
        entities["sensor.ambient_weather_illuminance"],
        entities["sensor.ambient_weather_irradiance"],
      ),
    );
  }, [entities, sunMode, sunEnabled, dark, view]);
  const cycleTime = `${String(Math.floor(sunHour)).padStart(2, "0")}:${String(Math.floor((sunHour % 1) * 60)).padStart(2, "0")}`;
  const labels = [
    ["Weather station", "Outdoor sensors", () => onHistory("temperature")],
    ["Humidity extractors", "Two units", () => onHistory("humidity")],
    ["Water collection tank", "Extractor → tank → plants", () => onCameras()],
    ["Camera 1", "Extractor mount", onCameras],
    ["Camera 2", "Centre of parking canopy", onCameras],
    ...gardenTrees.map((tree) => [tree.name, tree.level, onCameras]),
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
        <div className="scene-labels" hidden={!showLabels}>
          {labels.map(([title, value, action], index) => (
            <button
              key={title}
              ref={(element) => (markers.current[index] = element)}
              className={`scene-label ${title.startsWith("Camera ") ? "camera-label" : ""}`}
              onClick={action}
            >
              {title.startsWith("Camera ") && <Cctv size={14} />}
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
        <div
          className="scene-controls"
          role="group"
          aria-label="Garden view controls"
        >
          <button
            className="icon-button"
            aria-label="Rotate garden left"
            disabled={view === "2d"}
            onClick={() => scene.current?.orbit(-0.25)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Rotate garden right"
            disabled={view === "2d"}
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
            aria-label="Reset garden view"
            onClick={() => scene.current?.reset()}
          >
            <RotateCcw size={17} />
          </button>
          <details className="scene-settings">
            <summary aria-label="Garden view settings" title="View settings">
              <Settings2 size={18} />
            </summary>
            <div className="scene-settings-panel">
              <div
                className="view-switch"
                role="group"
                aria-label="Garden view"
              >
                <button
                  aria-pressed={view === "3d"}
                  onClick={() => setView("3d")}
                >
                  3D
                </button>
                <button
                  aria-pressed={view === "2d"}
                  onClick={() => setView("2d")}
                >
                  2D
                </button>
              </div>
              <label>
                <span>Revolve</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={revolving}
                  disabled={view === "2d"}
                  onChange={(event) => setRevolving(event.target.checked)}
                />
              </label>
              <label>
                <span>Labels</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={showLabels}
                  onChange={(event) => setShowLabels(event.target.checked)}
                />
              </label>
              <label>
                <span>Sun lighting</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={sunEnabled}
                  onChange={(event) => {
                    setSunEnabled(event.target.checked);
                    setSunMode("live");
                  }}
                />
              </label>
              {sunEnabled && (
                <div className="scene-sun-controls">
                  <div>
                    <Sun size={14} />
                    <span>Sun time-lapse</span>
                    <button
                      className="icon-button"
                      aria-label={
                        sunMode === "running"
                          ? "Pause sun time-lapse"
                          : "Play sun time-lapse"
                      }
                      onClick={() =>
                        setSunMode(sunMode === "running" ? "paused" : "running")
                      }
                    >
                      {sunMode === "running" ? (
                        <Pause size={14} />
                      ) : (
                        <Play size={14} />
                      )}
                    </button>
                  </div>
                  <div className="scene-sun-detail">
                    <span>
                      {sunMode === "live"
                        ? "Live sun"
                        : `${cycleTime} · Day cycle`}
                    </span>
                    {sunMode !== "live" && (
                      <button onClick={() => setSunMode("live")}>
                        Return to live
                      </button>
                    )}
                  </div>
                  <small>Illustrative cycle · 90 seconds per day</small>
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
