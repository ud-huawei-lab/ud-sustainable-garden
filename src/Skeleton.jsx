export default function Skeleton({
  kind = "readings",
  label = "Loading readings",
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
      ) : (
        <span className="skeleton-block skeleton-fill" aria-hidden="true" />
      )}
    </div>
  );
}
