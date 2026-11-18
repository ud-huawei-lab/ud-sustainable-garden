import { useEffect, useState } from "react";
import { format, time } from "./data.js";
import GrowthMarks from "./GrowthMarks.jsx";
import { sampleNights, SHOW_SAMPLE_GROWTH } from "./growthSample.js";
import { Chart } from "./History.jsx";
import InfoTip from "./InfoTip.jsx";
import Skeleton from "./Skeleton.jsx";
import { Panel, Stat } from "./Weather.jsx";

const POTS_VIEW = "1780 1170 1060 890";
const SLOPE_VIEW = "1450 650 1100 924";
const FRAME = { width: 3840, height: 2160 };
const views = {
  pots: { path: "", frame: "/api/growth/frame", box: POTS_VIEW },
  slope: { path: "/slope", frame: "/api/growth/slope/frame", box: SLOPE_VIEW },
};
const measures = [
  ["heightCm", "Height", "cm"],
  ["widthCm", "Width", "cm"],
  ["coverage", "Leaf cover", "%"],
];
const dayLabel = {
  day: "numeric",
  month: "short",
  hour: undefined,
  minute: undefined,
};

export function useGrowth(enabled = true, path = "") {
  // Data stays tied to its path, so a new view never renders the old result.
  const [loaded, setLoaded] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(enabled);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/growth${path}`, { signal: ctrl.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result;
      })
      .then((result) => setLoaded({ path, result }))
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setLoaded(null);
        setError(e.message || "Plant measurements could not be loaded.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [enabled, path, retry]);
  const data = loaded?.path === path ? loaded.result : null;
  return { data, error, loading, retry: () => setRetry((n) => n + 1) };
}

const percent = (value) => (value == null ? null : value * 100);

function trend(data, nights, key) {
  const value = (night, id) => {
    const reading = night.plants[id]?.[key];
    return key === "coverage" ? percent(reading) : (reading ?? null);
  };
  const series = data.plants.map(({ id, name }) => ({
    name,
    points: nights.map((night) => ({
      time: Date.parse(`${night.date}T00:00:00+04:00`),
      value: value(night, id),
    })),
  }));
  return {
    start: series[0].points[0].time,
    end: series[0].points.at(-1).time,
    series,
  };
}

function Growth({ data, sample, measure, setMeasure }) {
  const nights = sample ? sampleNights(data) : data.nights;
  if (nights.filter((night) => night.status === "ok").length < 2)
    return (
      <>
        <h2 className="panel-title">Growth</h2>
        <p className="secondary">
          The growth chart starts after the second measurement. Each job runs
          once a day.
        </p>
      </>
    );
  const [key, label, unit] = measures.find(([id]) => id === measure);
  return (
    <>
      <div className="plants-growth-head">
        <h2 className="panel-title">Growth</h2>
        <div
          className="range-control water-switch"
          role="group"
          aria-label="Growth measure"
        >
          {measures.map(([id, text]) => (
            <button
              key={id}
              className={measure === id ? "selected" : ""}
              aria-pressed={measure === id}
              onClick={() => setMeasure(id)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
      <div className="plants-chart">
        <Chart
          data={trend(data, nights, key)}
          metric={{ label, unit, daily: true, quiet: true }}
        />
        <ul className="plants-legend">
          {data.plants.map(({ id, name }) => (
            <li key={id} data-plant={id}>
              {name}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function Tile({ view, selected, onSelect, title, note }) {
  return (
    <button
      className="plants-camera"
      aria-pressed={selected === view}
      onClick={() => onSelect(view)}
    >
      <svg
        viewBox={views[view].box}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <image href={views[view].frame} {...FRAME} />
      </svg>
      <span>
        <strong>{title}</strong>
        <small>{note}</small>
      </span>
    </button>
  );
}

export default function PlantsPage() {
  const [view, setView] = useState("pots");
  const { data, error, loading, retry } = useGrowth(true, views[view].path);
  const [measure, setMeasure] = useState("heightCm");
  const pots = view === "pots";
  const stamp =
    data &&
    time(data.capturedAt, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <section className="plants-page" aria-label="Plant size">
      <div className="plants-view">
        <figure className="plants-figure">
          {data ? (
            <svg
              className="plants-frame"
              viewBox={views[view].box}
              role="img"
              aria-label={`${pots ? "Night view of both pots" : "Daylight view of Ghaf and Sidr"}, measured ${time(data.capturedAt, dayLabel)}`}
            >
              <image href={views[view].frame} {...FRAME} />
              <GrowthMarks plants={data.plants} labelSize={pots ? 30 : 26} />
            </svg>
          ) : (
            <div className="plants-frame plants-frame-empty">
              {loading ? (
                <Skeleton kind="scene" label="Loading plant measurements" />
              ) : (
                <div className="chart-empty">
                  <p>{error}</p>
                  <button className="quiet-button" onClick={retry}>
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}
          {data && (
            <figcaption className="plants-caption">
              Measured from the{" "}
              {pots ? "Camera 1 4K night" : "Camera 2 4K daylight"} frame,{" "}
              {stamp}.
              <InfoTip label="How these values are measured">
                {pots ? (
                  <>
                    Camera estimate, measured from the pot rim. Scale assumes
                    pots {format(data.potWidths.left, 0)} cm and{" "}
                    {format(data.potWidths.right, 0)} cm wide.
                  </>
                ) : (
                  <>
                    Camera estimate from SAM 2.1, measured from the trunk base.
                    Scale assumes Ghaf started at{" "}
                    {format(data.referenceHeights.left, 0)} cm and Sidr at{" "}
                    {format(data.referenceHeights.right, 0)} cm.
                  </>
                )}{" "}
                Leaf cover shows fullness, not a leaf count.
              </InfoTip>
            </figcaption>
          )}
        </figure>
        <div
          className="plants-cameras"
          role="group"
          aria-label="Measured camera"
        >
          <Tile
            view="pots"
            selected={view}
            onSelect={setView}
            title="Mango & Lime"
            note="Camera 1"
          />
          <Tile
            view="slope"
            selected={view}
            onSelect={setView}
            title="Ghaf & Sidr"
            note="Camera 2"
          />
        </div>
      </div>
      {data && (
        <div className="plants-side">
          {data.plants.map((plant) => (
            <Panel key={plant.id} title={plant.name} className="plants-card">
              <p className="medium-reading">
                {format(plant.heightCm, 0)}
                <span> cm tall</span>
              </p>
              <dl className="stat-row">
                <Stat label="Width">{format(plant.widthCm, 0)} cm</Stat>
                <Stat label="Canopy">
                  {format(
                    plant.canopyCm2 == null ? null : plant.canopyCm2 / 10000,
                    2,
                  )}{" "}
                  m²
                </Stat>
                <Stat label="Leaf cover">
                  {format(percent(plant.coverage), 0)}%
                </Stat>
              </dl>
            </Panel>
          ))}
          <Panel className="plants-growth">
            <Growth
              data={data}
              sample={pots && SHOW_SAMPLE_GROWTH}
              measure={measure}
              setMeasure={setMeasure}
            />
          </Panel>
        </div>
      )}
    </section>
  );
}
