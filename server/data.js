export function numeric(value) {
  if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function historyRange(query, now = Date.now()) {
  const durations = { '24h': 86400000, '7d': 7 * 86400000, '30d': 30 * 86400000 };
  let start, end;
  if (query.start || query.end) {
    start = Date.parse(query.start); end = Date.parse(query.end);
  } else {
    const duration = durations[query.range || '24h'];
    if (!duration) throw new Error('Choose a supported history range.');
    end = now; start = end - duration;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end > now + 60000 || end - start > 31 * 86400000) {
    throw new Error('Choose a valid past date range of at most 31 days.');
  }
  return { start, end };
}
export function aggregate(points) {
  const values = points.map(p => p.value).filter(v => v !== null && Number.isFinite(v));
  return { min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null,
    average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, count: values.length };
}
export function normalizeHistory(rows) {
  return rows.map(row => ({ time: Date.parse(row.last_updated || row.last_changed), value: numeric(row.state) }))
    .filter(p => Number.isFinite(p.time)).sort((a, b) => a.time - b.time);
}
export const dubaiDateTime = value => `${value}:00+04:00`;

// Keep missing-state markers when reducing a long history for chart rendering.
export function thin(points, limit = 1200) {
  if (points.length <= limit) return points;
  const step = Math.ceil(points.length / limit);
  return points.filter((p, i) => i % step === 0 || i === points.length - 1 || p.value === null || points[i - 1]?.value === null);
}
