import { useEffect, useState } from "react";
import { format, time } from "./data.js";
import GrowthMarks from "./GrowthMarks.jsx";
import { sampleNights, SHOW_SAMPLE_GROWTH } from "./growthSample.js";
import { Chart } from "./History.jsx";
import InfoTip from "./InfoTip.jsx";
import Skeleton from "./Skeleton.jsx";
import { Panel, Stat } from "./Weather.jsx";

const POTS_VIEW = "1780 1170 1060 890";
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

export function useGrowth(enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(enabled);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/growth", { signal: ctrl.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result;
      })
      .then(setData)
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setData(null);
        setError(e.message || "Plant measurements could not be loaded.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [enabled, retry]);
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

function Growth({ data, measure, setMeasure }) {
  const nights = SHOW_SAMPLE_GROWTH ? sampleNights(data) : data.nights;
  if (nights.filter((night) => night.status === "ok").length < 2)
    return (
      <>
        <h2 className="panel-title">Growth</h2>
        <p className="secondary">
          The growth chart starts after the second night. The job measures both
          plants at 02:00 Dubai time.
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

export default function PlantsPage() {
  const { data, error, loading, retry } = useGrowth();
  const [measure, setMeasure] = useState("heightCm");
  if (loading && !data)
    return <Skeleton kind="chart" label="Loading plant measurements" />;
  if (!data)
    return (
      <div className="chart-empty">
        <p>{error}</p>
        <button className="quiet-button" onClick={retry}>
          Try again
        </button>
      </div>
    );
  return (
    <section className="plants-page" aria-label="Plant size">
      <div className="plants-view">
        <figure className="plants-figure">
          <svg
            className="plants-frame"
            viewBox={POTS_VIEW}
            role="img"
            aria-label={`Night view of both pots, measured ${time(data.capturedAt, dayLabel)}`}
          >
            <image
              href="/api/growth/frame"
              width={data.frame.width}
              height={data.frame.height}
            />
            <GrowthMarks plants={data.plants} labelSize={30} />
          </svg>
          <figcaption className="plants-caption">
            Measured from the Camera 1 4K night frame,{" "}
            {time(data.capturedAt, {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
            .
            <InfoTip label="How these values are measured">
              Camera estimate, measured from the pot rim. Scale assumes pots{" "}
              {format(data.potWidths.left, 0)} cm and{" "}
              {format(data.potWidths.right, 0)} cm wide. Leaf cover shows
              fullness, not a leaf count.
            </InfoTip>
          </figcaption>
        </figure>
        <div
          className="plants-cameras"
          role="group"
          aria-label="Measured camera"
        >
          <button className="plants-camera" aria-pressed="true">
            <svg
              viewBox={POTS_VIEW}
              preserveAspectRatio="xMidYMid slice"
              aria-hidden="true"
            >
              <image
                href="/api/growth/frame"
                width={data.frame.width}
                height={data.frame.height}
              />
            </svg>
            <span>
              <strong>Mango & Lime</strong>
              <small>Camera 1</small>
            </span>
          </button>
          <button className="plants-camera" disabled>
            <img src="/api/cameras/garden/snapshot" alt="" loading="lazy" />
            <span>
              <strong>Ghaf & Sidr</strong>
              <small>Not measured yet</small>
            </span>
          </button>
        </div>
      </div>
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
          <Growth data={data} measure={measure} setMeasure={setMeasure} />
        </Panel>
      </div>
    </section>
  );
}
