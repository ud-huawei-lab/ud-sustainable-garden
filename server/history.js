import { metrics } from '../shared/catalog.js';
import { normalizeHistory, numeric, aggregate, thin } from './data.js';

export async function history(ha, metricKey, range, env) {
  const metric = metrics[metricKey];
  let series;
  let source = 'Home Assistant';
  if (env.INFLUX_URL) {
    const interval = Math.max(60, Math.ceil((range.end - range.start) / 1000 / 800));
    const entityFilter = metric.series.map(([, id]) => `"entity_id" = '${id.replace('sensor.', '')}'`).join(' OR ');
    const query = `SELECT mean("value") FROM "${metric.measurement}" WHERE (${entityFilter}) AND time >= ${range.start}ms AND time <= ${range.end}ms GROUP BY time(${interval}s), "entity_id" fill(null)`;
    const url = new URL('/query', env.INFLUX_URL);
    url.search = new URLSearchParams({ db: env.INFLUX_DATABASE || 'homeassistant', q: query, epoch: 'ms' });
    const headers = env.INFLUX_USERNAME ? { Authorization: `Basic ${Buffer.from(`${env.INFLUX_USERNAME}:${env.INFLUX_PASSWORD || ''}`).toString('base64')}` } : {};
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(25000), redirect: 'error' });
    if (!response.ok) throw new Error('The historical database could not be reached.');
    const payload = await response.json();
    if (payload.error || payload.results?.some(r => r.error)) throw new Error('The historical query could not be completed.');
    const rows = payload.results?.[0]?.series || [];
    series = metric.series.map(([name, entity]) => ({ name, entity, points: (rows.find(row => row.tags?.entity_id === entity.replace('sensor.', ''))?.values || []).map(([time, value]) => ({ time, value: numeric(value) })) }));
    source = 'InfluxDB';
  } else {
    const query = new URLSearchParams({ filter_entity_id: metric.series.map(s => s[1]).join(','), end_time: new Date(range.end).toISOString(), no_attributes: '1', minimal_response: '1', significant_changes_only: '0' });
    const payload = await ha.get(`/api/history/period/${new Date(range.start).toISOString()}?${query}`);
    series = metric.series.map(([name, entity]) => ({ name, entity, points: normalizeHistory(payload.find(rows => rows[0]?.entity_id === entity) || []) }));
  }
  return { metric: metricKey, unit: metric.unit, source, ...range, series: series.map(s => ({ ...s, stats: aggregate(s.points), points: thin(s.points) })) };
}
