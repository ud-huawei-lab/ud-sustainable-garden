import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpRight } from "lucide-react";
import { metrics } from "../shared/catalog.js";
import { format, time } from "./data.js";
import { Panel } from "./Weather.jsx";
import Skeleton from "./Skeleton.jsx";

const colors = ["var(--chart-primary)", "var(--chart-secondary)"];
const localInput = (value) =>
  new Date(value + 4 * 3600000).toISOString().slice(0, 16);

function Chart({ data, metric }) {
  const [hover, setHover] = useState(null);
  const [pointer, setPointer] = useState(null);
  const container = useRef(null);
  const [width, setWidth] = useState(1120);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, entry.contentRect.width)),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const points = data.series
    .flatMap((s) => s.points)
    .filter((p) => p.value != null);
  if (!points.length)
    return (
      <div ref={container} className="chart-empty">
        No readings were recorded for this period. Try another date range.
      </div>
    );
  const values = points.map((p) => p.value);
  const low = metric.scatter ? 0 : Math.min(...values);
  const high = metric.scatter ? 360 : Math.max(...values);
  const pad = Math.max(
    (high - low) * 0.15,
    high === low ? Math.max(Math.abs(high) * 0.03, 1) : 0.05,
  );
  const min = metric.bars ? 0 : metric.scatter ? 0 : low - pad;
  const max = metric.scatter ? 360 : high + pad;
  const chartWidth = width - 68;
  const x = (t) =>
    48 + (chartWidth * (t - data.start)) / (data.end - data.start);
  const y = (value) => 238 - ((value - min) / (max - min)) * 210;
  const paths = data.series.map((s) => {
    let move = true;
    return s.points
      .map((p) => {
        if (p.value == null) {
          move = true;
          return "";
        }
        const result = `${move ? "M" : "L"}${x(p.time).toFixed(2)},${y(p.value).toFixed(2)}`;
        move = false;
        return result;
      })
      .join(" ");
  });
  const hoverTime =
    hover == null ? null : data.start + hover * (data.end - data.start);
  const sample =
    hoverTime == null
      ? []
      : data.series.map((s) => ({
          name: s.name,
          point: s.points.reduce(
            (nearest, p) =>
              !nearest ||
              Math.abs(p.time - hoverTime) < Math.abs(nearest.time - hoverTime)
                ? p
                : nearest,
            null,
          ),
        }));
  const ticks = width < 500 ? 3 : 6;
  return (
    <div ref={container} className="chart-wrap">
      <svg
        viewBox={`0 0 ${width} 286`}
        role="img"
        tabIndex={0}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          setPointer(null);
          setHover((value) =>
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? 1
                : Math.max(
                    0,
                    Math.min(
                      1,
                      (value ?? 0) +
                        (event.key === "ArrowRight" ? 0.01 : -0.01),
                    ),
                  ),
          );
        }}
        aria-label={`${metric.label} history from ${time(data.start, { day: "numeric", month: "short" })} to ${time(data.end, { day: "numeric", month: "short" })}`}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const chartBox = container.current.getBoundingClientRect();
          setPointer({
            x: event.clientX - chartBox.left,
            y: event.clientY - chartBox.top,
          });
          setHover(
            Math.max(
              0,
              Math.min(
                1,
                (((event.clientX - box.left) / box.width) * width - 48) /
                  chartWidth,
              ),
            ),
          );
        }}
        onPointerLeave={() => {
          setHover(null);
          setPointer(null);
        }}
      >
        {Array.from({ length: 5 }, (_, i) => {
          const value = min + ((max - min) * i) / 4;
          return (
            <g key={i}>
              <line
                className="chart-grid"
                x1="48"
                y1={y(value)}
                x2={width - 20}
                y2={y(value)}
              />
              <text
                className="chart-label"
                x="38"
                y={y(value) + 4}
                textAnchor="end"
              >
                {format(value, metric.scatter ? 0 : 1)}
              </text>
            </g>
          );
        })}
        {Array.from({ length: ticks }, (_, i) => {
          const t = data.start + ((data.end - data.start) * i) / (ticks - 1);
          return (
            <text
              key={i}
              className="chart-label"
              x={x(t)}
              y="272"
              textAnchor={
                i === 0 ? "start" : i === ticks - 1 ? "end" : "middle"
              }
            >
              {time(
                t,
                data.end - data.start > 2 * 86400000
                  ? { day: "numeric", month: "short" }
                  : {},
              )}
            </text>
          );
        })}
        {data.series.map((s, index) => (
          <g key={s.name}>
            {metric.bars ? (
              s.points
                .filter((p) => p.value != null)
                .map((p, i) => (
                  <rect
                    key={i}
                    x={x(p.time) - 2}
                    y={y(p.value)}
                    width="4"
                    height={Math.max(0, y(0) - y(p.value))}
                    fill={colors[index]}
                  />
                ))
            ) : metric.scatter ? (
              s.points
                .filter((p) => p.value != null)
                .map((p, i) => (
                  <circle
                    key={i}
                    cx={x(p.time)}
                    cy={y(p.value)}
                    r="2"
                    fill={colors[index]}
                  />
                ))
            ) : (
              <path
                d={paths[index]}
                stroke={colors[index]}
                strokeWidth="2"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        ))}
        {hoverTime != null && (
          <line
            x1={x(hoverTime)}
            x2={x(hoverTime)}
            y1="20"
            y2="240"
            stroke="var(--muted)"
            strokeDasharray="3 4"
          />
        )}
      </svg>
      {pointer && hoverTime != null && (
        <div
          className="chart-tooltip"
          aria-hidden="true"
          style={{
            left: Math.max(
              8,
              Math.min(pointer.x + 14, width - Math.min(260, width - 16) - 8),
            ),
            top: pointer.y > 130 ? pointer.y - 14 : pointer.y + 18,
            transform: pointer.y > 130 ? "translateY(-100%)" : undefined,
          }}
        >
          <span>{time(hoverTime, { day: "numeric", month: "short" })}</span>
          {sample.map((s) => (
            <div key={s.name}>
              <span>{s.name}</span>
              <strong>
                {format(s.point?.value)} {metric.unit}
              </strong>
            </div>
          ))}
        </div>
      )}
      <div className="chart-detail" aria-live="polite">
        {hoverTime == null ? (
          <span>
            Hover over the chart to explore readings, or focus it and use the
            arrow keys.
          </span>
        ) : (
          <>
            <span>{time(hoverTime, { day: "numeric", month: "short" })}</span>
            {sample.map((s, i) => (
              <span key={s.name} style={{ color: colors[i] }}>
                {s.name} {format(s.point?.value)} {metric.unit}
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default function History({ metricKey, setMetricKey, grafanaUrl }) {
  const [range, setRange] = useState("24h");
  const [draft, setDraft] = useState({
    start: localInput(Date.now() - 86400000),
    end: localInput(Date.now()),
  });
  const [custom, setCustom] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const metric = metrics[metricKey];
  useEffect(() => {
    const ctrl = new AbortController();
    if (range === "custom" && !custom) {
      setLoading(false);
      setData(null);
      return () => ctrl.abort();
    }
    setLoading(true);
    setError("");
    setData(null);
    const params = new URLSearchParams({
      metric: metricKey,
      ...(range === "custom" ? custom : { range }),
    });
    fetch(`/api/history?${params}`, { signal: ctrl.signal })
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok) throw new Error(result.error);
        return result;
      })
      .then(setData)
      .catch((e) => {
        if (!ctrl.signal.aborted)
          setError(e.message || "History could not be loaded.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [metricKey, range, custom, retry]);
  const exportCsv = () => {
    if (!data) return;
    const rows = [
      "Series,Time (Asia/Dubai),Value,Unit",
      ...data.series.flatMap((s) =>
        s.points.map(
          (p) =>
            `${s.name},${new Date(p.time + 4 * 3600000).toISOString().replace("Z", "+04:00")},${p.value ?? ""},${metric.unit}`,
        ),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + rows.join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `ud-garden-${metricKey}-${range}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Panel
      className="history-panel"
      id="history"
      aria-labelledby="history-heading"
    >
      <div className="section-top">
        <div>
          <h2 id="history-heading">History</h2>
          <p className="secondary">
            A closer look at your garden’s environment.
          </p>
        </div>
        <div className="history-actions">
          {grafanaUrl && (
            <a href={grafanaUrl} target="_blank" rel="noreferrer">
              Open Grafana
              <ArrowUpRight size={14} />
            </a>
          )}
          <button
            className="quiet-button"
            disabled={!data?.series.some((s) => s.points.length)}
            onClick={exportCsv}
          >
            <ArrowDownToLine size={15} />
            Export CSV
          </button>
        </div>
      </div>
      <div className="history-controls">
        <label className="select-label">
          Reading
          <select
            value={metricKey}
            onChange={(e) => setMetricKey(e.target.value)}
          >
            {Object.entries(metrics).map(([key, m]) => (
              <option key={key} value={key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <div className="range-control" aria-label="History time range">
          {[
            ["24h", "24 hours"],
            ["7d", "7 days"],
            ["30d", "30 days"],
            ["custom", "Custom"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={range === key ? "selected" : ""}
              aria-pressed={range === key}
              onClick={() => setRange(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {range === "custom" && (
        <form
          className="custom-range"
          onSubmit={(e) => {
            e.preventDefault();
            setCustom({
              start: `${draft.start}:00+04:00`,
              end: `${draft.end}:00+04:00`,
            });
          }}
        >
          <label>
            From
            <input
              type="datetime-local"
              required
              value={draft.start}
              onChange={(e) => setDraft({ ...draft, start: e.target.value })}
            />
          </label>
          <label>
            To
            <input
              type="datetime-local"
              required
              value={draft.end}
              onChange={(e) => setDraft({ ...draft, end: e.target.value })}
            />
          </label>
          <button className="quiet-button" type="submit">
            Apply range
          </button>
          <span>Dubai time · up to 31 days</span>
        </form>
      )}
      <div className="chart-meta">
        <span>
          {metric.label} <small>{metric.unit}</small>
        </span>
        <div className="chart-legend">
          {metric.series.map(([name], i) => (
            <span key={name}>
              <i style={{ background: colors[i] }} />
              {name}
            </span>
          ))}
        </div>
      </div>
      {loading ? (
        <Skeleton kind="chart" label="Loading recorded readings" />
      ) : error ? (
        <div className="chart-empty">
          <p>{error}</p>
          <button
            className="quiet-button"
            onClick={() => setRetry((v) => v + 1)}
          >
            Try again
          </button>
        </div>
      ) : data ? (
        metric.categorical ? (
          <div className="categorical-history">
            <table>
              <thead>
                <tr>
                  <th>Recorded at · Dubai time</th>
                  <th>{metric.label}</th>
                </tr>
              </thead>
              <tbody>
                {data.series
                  .flatMap((series) => series.points)
                  .slice()
                  .reverse()
                  .map((point, index) => (
                    <tr key={index}>
                      <td>
                        {time(point.time, { day: "numeric", month: "short" })}
                      </td>
                      <td>{point.value ?? "Unavailable"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!data.series.some((series) => series.points.length) && (
              <p className="chart-empty">
                No recorded changes for this period.
              </p>
            )}
          </div>
        ) : (
          <Chart data={data} metric={metric} />
        )
      ) : (
        <div className="chart-empty">
          Choose a date range to explore history.
        </div>
      )}
      {data && !metric.categorical && (
        <>
          <div className="history-stats">
            {data.series.map((s) => (
              <div key={s.name}>
                <span>{s.name}</span>
                <dl>
                  <div>
                    <dt>Minimum</dt>
                    <dd>
                      {format(s.stats.min)}
                      <small> {metric.unit}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Average</dt>
                    <dd>
                      {format(s.stats.average)}
                      <small> {metric.unit}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Maximum</dt>
                    <dd>
                      {format(s.stats.max)}
                      <small> {metric.unit}</small>
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
          <p className="chart-footnote">
            {time(data.start, { day: "numeric", month: "short" })} –{" "}
            {time(data.end, { day: "numeric", month: "short" })} · Dubai time ·{" "}
            {data.source}. Gaps represent unavailable readings. Available dates
            depend on recorder retention.
          </p>
        </>
      )}
    </Panel>
  );
}
