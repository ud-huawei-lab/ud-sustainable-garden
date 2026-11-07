import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "./data.js";
import { Chart } from "./History.jsx";
import InfoTip from "./InfoTip.jsx";
import { createGardenScene } from "./gardenScene.js";
import { sampleSoil, soilBands } from "./soilSample.js";
import { Switch } from "./Water.jsx";
import { Panel, Stat } from "./Weather.jsx";

const ranges = [
  ["7d", "7 days", 7],
  ["30d", "30 days", 30],
];
const DAY = 86400000;
const FIRST_TREE_LABEL = 5;
const TREE_VIEW = { position: [15, 11, 2.5], target: [1.6, -0.6, -9] };

function SoilScene({ trees, dark }) {
  const host = useRef(null);
  const scene = useRef(null);
  const markers = useRef([]);
  const [failed, setFailed] = useState(false);
  const rings = trees.map((tree) => soilBands[tree.band].color).join();
  useEffect(() => {
    try {
      setFailed(false);
      scene.current = createGardenScene(host.current, dark, markers.current, {
        focus: TREE_VIEW,
      });
      scene.current.setLabelsVisible(true);
    } catch {
      setFailed(true);
    }
    return () => scene.current?.dispose();
  }, [dark]);
  useEffect(() => {
    scene.current?.setSoilRings(rings.split(","));
  }, [rings, dark]);
  return (
    <div className="soil-scene">
      <div ref={host} className="twin-canvas" />
      {failed && (
        <div className="scene-fallback">
          This browser could not open the garden view.
        </div>
      )}
      <div className="scene-labels">
        {trees.map((tree, index) => (
          <div
            key={tree.id}
            ref={(element) =>
              (markers.current[FIRST_TREE_LABEL + index] = element)
            }
            className="scene-label"
          >
            <strong>{tree.name}</strong>
            <span>{format(tree.moisture, 0)} %</span>
          </div>
        ))}
      </div>
      <ul className="soil-legend" aria-label="Soil moisture bands">
        {Object.values(soilBands).map(({ label, color }) => (
          <li key={label} style={{ "--band": color }}>
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SoilPage({ sample, dark }) {
  const soil = useMemo(() => sampleSoil(sample), [sample]);
  const [treeId, setTreeId] = useState("mango");
  const [range, setRange] = useState("7d");
  if (!soil)
    return (
      <section className="soil-page" aria-label="Soil moisture">
        <Panel className="soil-empty">
          <p className="medium-reading">No soil sensors yet</p>
          <p className="secondary">
            Soil moisture appears here once a sensor is installed at each tree.
          </p>
        </Panel>
      </section>
    );
  const tree = soil.trees.find(({ id }) => id === treeId);
  const days = ranges.find(([key]) => key === range)[2];
  const start = soil.end - days * DAY;
  return (
    <section className="soil-page" aria-label="Soil moisture">
      <div className="soil-cards">
        {soil.trees.map((item) => (
          <Panel key={item.id} title={item.name} className="soil-card">
            <p className="medium-reading">
              {format(item.moisture, 0)}
              <span> %</span>
            </p>
            <dl className="stat-row">
              <Stat label="24 hours">
                {item.change > 0 ? "+" : ""}
                {format(item.change)}
                <small> %</small>
              </Stat>
              <Stat label="Status">{soilBands[item.band].label}</Stat>
              <Stat label="Last watered">
                {item.daysSinceWater === 0
                  ? "Today"
                  : `${item.daysSinceWater} d ago`}
              </Stat>
            </dl>
          </Panel>
        ))}
      </div>
      <div className="soil-lower">
        <SoilScene trees={soil.trees} dark={dark} />
        <Panel className="water-panel soil-history">
          <div className="water-head">
            <h2 className="panel-title">History</h2>
            <InfoTip label="About soil moisture">
              Soil moisture at each tree, from one WH51 sensor per tree.
              Readings depend on calibration for each pot.
            </InfoTip>
            <Switch
              label="Soil history range"
              options={ranges.map(([key, text]) => [key, text])}
              value={range}
              onChange={setRange}
            />
          </div>
          <div className="chart-meta water-chart-head">
            <span>
              {tree.name} soil moisture <small>(%)</small>
            </span>
            <Switch
              label="Tree"
              options={soil.trees.map(({ id, name }) => [id, name])}
              value={treeId}
              onChange={setTreeId}
            />
          </div>
          <Chart
            data={{
              start,
              end: soil.end,
              series: [
                {
                  name: tree.name,
                  points: tree.points.filter((point) => point.time >= start),
                },
              ],
            }}
            metric={{
              label: "Soil moisture",
              unit: "%",
              nonNegative: true,
              quiet: true,
            }}
          />
        </Panel>
      </div>
    </section>
  );
}
