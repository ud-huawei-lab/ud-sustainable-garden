const bars = [62, 78, 54, 88, 70, 46, 82];

function ChartSkeleton({ shape }) {
  return (
    <div className="skeleton-plot" aria-hidden="true">
      <div className="skeleton-y">
        {[0, 1, 2, 3, 4].map((i) => (
          <span className="skeleton-block" key={i} />
        ))}
      </div>
      <div className="skeleton-area">
        <div className="skeleton-grid">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} />
          ))}
        </div>
        {shape === "bars" ? (
          <div className="skeleton-bars">
            {bars.map((height, i) => (
              <span
                className="skeleton-block"
                key={i}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        ) : (
          <svg
            className="skeleton-line"
            viewBox="0 0 1000 200"
            preserveAspectRatio="none"
          >
            <path d="M0 110C70 60 130 150 210 100S340 30 450 96 610 170 720 92 900 50 1000 96" />
          </svg>
        )}
      </div>
      <div className="skeleton-x">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span className="skeleton-block" key={i} />
        ))}
      </div>
    </div>
  );
}

export default function Skeleton({
  kind = "readings",
  label = "Loading readings",
  shape = "line",
}) {
  return (
    <div
      className={`loading-skeleton skeleton-${kind}`}
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>
      {kind === "readings" || kind === "overview" ? (
        Array.from({ length: kind === "overview" ? 5 : 6 }, (_, i) => (
          <div className="skeleton-tile" key={i} aria-hidden="true">
            <span className="skeleton-block skeleton-label" />
            <span className="skeleton-block skeleton-value" />
            <span className="skeleton-block skeleton-label" />
          </div>
        ))
      ) : kind === "chart" ? (
        <ChartSkeleton shape={shape} />
      ) : (
        <span className="skeleton-block skeleton-fill" aria-hidden="true" />
      )}
    </div>
  );
}
