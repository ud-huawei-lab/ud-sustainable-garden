import express from 'express';
import { Readable } from 'node:stream';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { HomeAssistant } from './ha.js';
import { historyRange } from './data.js';
import { history } from './history.js';
import { allowedEntities, cameras, metrics } from '../shared/catalog.js';

const env = process.env;
const host = env.HOST || '127.0.0.1';
const port = Number(env.PORT || 5173);
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && (!env.APP_USERNAME || !env.APP_PASSWORD)) {
  throw new Error('Remote binding requires APP_USERNAME and APP_PASSWORD.');
}
const app = express();
app.disable('x-powered-by');
const ha = new HomeAssistant(env);
const cache = new Map();
const streams = new Map();
let statesCache = { at: 0, data: null };
let statesPromise;
const equal = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
app.use((req, res, next) => {
  const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  if (['127.0.0.1', 'localhost', '::1'].includes(host) && !allowedHosts.has(req.headers.host)) return res.sendStatus(403);
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' });
  if (env.APP_USERNAME && env.APP_PASSWORD) {
    const expected = `${env.APP_USERNAME}:${env.APP_PASSWORD}`;
    const actual = req.headers.authorization?.startsWith('Basic ') ? Buffer.from(req.headers.authorization.slice(6), 'base64').toString() : '';
    if (!equal(actual, expected)) return res.set('WWW-Authenticate', 'Basic realm="UD Sustainable Garden"').status(401).send('Sign in to view the garden.');
  }
  next();
});
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.sendStatus(405);
  if (req.headers['sec-fetch-site'] === 'cross-site') return res.sendStatus(403);
  next();
});
app.get('/api/readings', async (req, res) => {
  if (Date.now() - statesCache.at > 10000 || !statesCache.data) {
    if (!statesPromise) statesPromise = ha.get('/api/states').then(states => {
      const entities = Object.fromEntries(states.filter(e => allowedEntities.has(e.entity_id)).map(e => [e.entity_id, {
        state: e.state, changed: e.last_changed, updated: e.last_updated,
        attributes: Object.fromEntries(['unit_of_measurement', 'friendly_name', 'next_rising', 'next_setting', 'elevation'].filter(k => e.attributes?.[k] !== undefined).map(k => [k, e.attributes[k]])),
      }]));
      statesCache = { at: Date.now(), data: { entities, fetchedAt: new Date().toISOString() } };
    }).finally(() => { statesPromise = null; });
    await statesPromise;
  }
  res.json({ ...statesCache.data, grafanaUrl: env.GRAFANA_URL || '', cameras: cameras.map(({ id, name }) => ({ id, name })) });
});
app.get('/api/history', async (req, res) => {
  const metric = req.query.metric || 'temperature';
  if (!Object.hasOwn(metrics, metric)) return res.status(400).json({ error: 'Choose a supported metric.' });
  let range;
  try { range = historyRange(req.query); } catch (error) { return res.status(400).json({ error: error.message }); }
  const key = JSON.stringify([metric, Math.floor(range.start / 60000), Math.floor(range.end / 60000)]);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 60000) return res.json(cached.data);
  const data = await history(ha, metric, range, env);
  if (cache.size >= 40) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), data });
  res.json(data);
});
const cameraFor = id => cameras.find(c => c.id === id);
app.get('/api/cameras/:id/snapshot', async (req, res) => {
  const camera = cameraFor(req.params.id);
  if (!camera) return res.sendStatus(404);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  res.on('close', () => controller.abort());
  try {
    const upstream = await ha.raw(`/api/camera_proxy/${camera.entity}`, controller.signal);
    if (!upstream.ok || !upstream.headers.get('content-type')?.startsWith('image/')) return res.sendStatus(502);
    res.type(upstream.headers.get('content-type'));
    Readable.fromWeb(upstream.body).on('error', () => res.end()).pipe(res);
  } finally { clearTimeout(timer); }
});
// Only these two cameras can start streams. Upstream HLS URLs never reach the browser.
app.get('/api/cameras/:id/live', async (req, res) => {
  const camera = cameraFor(req.params.id);
  if (!camera) return res.sendStatus(404);
  const result = await ha.command({ type: 'camera/stream', entity_id: camera.entity });
  const url = new URL(result.url, ha.url);
  if (url.origin !== new URL(ha.url).origin || !url.pathname.startsWith('/api/hls/')) throw new Error('Unsupported camera stream.');
  streams.set(camera.id, { base: new URL('.', url), playlist: url, expires: Date.now() + 3600000 });
  res.json({ url: `/api/video/${camera.id}/${url.pathname.split('/').pop()}` });
});
app.get('/api/video/:id/:file', async (req, res) => {
  const stream = streams.get(req.params.id);
  const file = req.params.file;
  if (!stream || stream.expires < Date.now() || !/^[\w.-]+\.(m3u8|ts|m4s|mp4)$/.test(file)) return res.sendStatus(404);
  const path = new URL(file, stream.base);
  const upstream = await ha.raw(path.pathname, AbortSignal.timeout(25000));
  if (!upstream.ok) return res.sendStatus(502);
  if (file.endsWith('.m3u8')) {
    const text = await upstream.text();
    // HA playlists use sibling paths. Refuse external or parent-directory resources.
    const rewrite = value => {
      const target = new URL(value, path);
      if (target.origin !== path.origin || new URL('.', target).href !== stream.base.href) throw new Error('Unsupported playlist resource.');
      return `/api/video/${req.params.id}/${target.pathname.split('/').pop()}`;
    };
    const playlist = text.split('\n').map(line => line.startsWith('#') ? line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${rewrite(uri)}"`) : line.trim() ? rewrite(line.trim()) : line).join('\n');
    return res.type('application/vnd.apple.mpegurl').send(playlist);
  }
  res.type(upstream.headers.get('content-type') || 'video/mp2t').send(Buffer.from(await upstream.arrayBuffer()));
});
app.use('/api', (req, res) => res.status(404).json({ error: 'This endpoint is not available.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(`[${new Date().toISOString()}] ${req.path}: upstream request failed`);
  res.status(502).json({ error: 'The garden data could not be loaded. Please try again.' });
});
if (process.argv.includes('--production')) {
  app.use(express.static(fileURLToPath(new URL('../dist', import.meta.url))));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.listen(port, host, () => console.log(`UD Sustainable Garden: http://${host}:${port}`));
