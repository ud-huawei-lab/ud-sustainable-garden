import express from "express";
import { fileURLToPath } from "node:url";
import { HomeAssistant } from "./ha.js";
import { RealtimeReadings } from "./realtime.js";
import { mediaPath, rewritePlaylist } from "./media.js";
import { historyRange } from "./data.js";
import { history } from "./history.js";
import { waterInsights, waterRanges } from "./water.js";
import { createAuth, createLocalAccess, skipsSignIn } from "./auth.js";
import { memoryStore } from "./store.js";
import { createTickets } from "./tickets.js";
import { createVisionRouter } from "./vision.js";
import { createCameraControlsRouter } from "./camera-controls.js";
import { createGrowthRouter } from "./growth.js";
import { allowedEntities, cameras, metrics } from "../shared/catalog.js";

export async function createApp(
  env = process.env,
  { serverless = false, store: suppliedStore, devMode = false } = {},
) {
  const host = env.HOST || "127.0.0.1";
  const port = Number(env.PORT || 5173);
  const loopback =
    !serverless && ["127.0.0.1", "localhost", "::1"].includes(host);
  const originSetting =
    env.APP_ORIGIN ||
    (serverless && (env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL)
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL}`
      : "");
  const publicOrigin = originSetting ? new URL(originSetting) : null;
  if (
    publicOrigin &&
    (publicOrigin.protocol !== "https:" ||
      publicOrigin.origin !== originSetting)
  )
    throw new Error("APP_ORIGIN must be an HTTPS origin without a path.");
  if (!loopback && !publicOrigin)
    throw new Error("Remote binding requires an HTTPS APP_ORIGIN.");
  const origins = publicOrigin
    ? [publicOrigin.origin]
    : [
        `http://127.0.0.1:${port}`,
        `http://localhost:${port}`,
        `http://[::1]:${port}`,
      ];
  if (serverless && env.VERCEL_URL)
    origins.push(new URL(`https://${env.VERCEL_URL}`).origin);
  const store = suppliedStore || memoryStore();
  const tickets = serverless ? createTickets(env.APP_SESSION_SECRET) : null;
  const auth = skipsSignIn({ devMode, serverless, publicOrigin, host })
    ? createLocalAccess({ origins })
    : createAuth(
        {
          username: env.APP_USERNAME,
          passwordHash: env.APP_PASSWORD_HASH,
          origins,
          secure: Boolean(publicOrigin),
          partitioned: Boolean(publicOrigin),
        },
        { store, tickets },
      );
  const app = express();
  app.disable("x-powered-by");
  if (serverless) app.set("trust proxy", 1);
  else if (env.TRUST_PROXY === "loopback") app.set("trust proxy", "loopback");
  else if (env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  // The hosting platform checks this directly over its internal HTTP network.
  // It reveals no data or configuration and does not establish a session.
  app.get("/healthz", (req, res) =>
    res.set("Cache-Control", "no-store").json({ ok: true }),
  );
  const ha = new HomeAssistant(env);
  const cache = new Map();
  const snapshots = new Map();
  const waterCache = new Map();
  let statesCache = { at: 0, data: null };
  let statesPromise;
  const realtime = new RealtimeReadings(ha, (snapshot) => {
    statesCache = { at: Date.now(), data: snapshot };
  });
  app.use((req, res, next) => {
    const allowedHosts = new Set([
      `localhost:${port}`,
      `127.0.0.1:${port}`,
      `[::1]:${port}`,
    ]);
    if (publicOrigin) allowedHosts.add(publicOrigin.host);
    if (loopback && !allowedHosts.has(req.headers.host))
      return res.sendStatus(403);
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy": `default-src 'self'; script-src 'self'${process.argv.includes("--production") ? "" : " 'unsafe-inline'"}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'`,
    });
    if (publicOrigin && !req.secure)
      return res
        .status(426)
        .json({ error: "Use HTTPS to access this dashboard." });
    if (req.secure) res.set("Strict-Transport-Security", "max-age=31536000");
    next();
  });
  app.use("/auth", auth.router);
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      req.method !== "GET" &&
      !(
        req.method === "POST" &&
        (req.path === "/ai/analyze" ||
          /^\/cameras\/(trees|garden)\/ptz$/.test(req.path))
      )
    )
      return res.sendStatus(405);
    if (req.method === "POST" && !origins.includes(req.headers.origin))
      return res.sendStatus(403);
    if (req.headers["sec-fetch-site"] === "cross-site")
      return res.sendStatus(403);
    next();
  });
  app.use("/api", auth.requireSession);
  app.use("/api/ai", createVisionRouter(env));
  app.use("/api/cameras", createCameraControlsRouter(ha));
  app.get("/api/events", (req, res) => {
    // A 204 stops EventSource reconnects; the client uses one-second HTTP reads.
    if (serverless) return res.status(204).end();
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const unsubscribe = realtime.subscribe((snapshot) =>
      res.write(
        `data: ${JSON.stringify({ ...snapshot, grafanaUrl: env.GRAFANA_URL || "" })}\n\n`,
      ),
    );
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
    const detachSession = auth.onSessionEnd(req, () => {
      res.write("event: session-ended\ndata: {}\n\n");
      res.end();
    });
    req.on("close", () => {
      detachSession();
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
  app.get("/api/readings", async (req, res) => {
    if (!ha.url || (!env.HA_TOKEN && (!env.HA_USERNAME || !env.HA_PASSWORD)))
      return res.status(503).json({
        error:
          "The Home Assistant connection is not configured on this server.",
      });
    if (Date.now() - statesCache.at > 1000 || !statesCache.data) {
      if (!statesPromise)
        statesPromise = ha
          .get("/api/states")
          .then((states) => {
            const entities = Object.fromEntries(
              states
                .filter((e) => allowedEntities.has(e.entity_id))
                .map((e) => [
                  e.entity_id,
                  {
                    state: e.state,
                    changed: e.last_changed,
                    updated: e.last_updated,
                    attributes: Object.fromEntries(
                      [
                        "unit_of_measurement",
                        "friendly_name",
                        "next_rising",
                        "next_setting",
                        "elevation",
                        "azimuth",
                      ]
                        .filter((k) => e.attributes?.[k] !== undefined)
                        .map((k) => [k, e.attributes[k]]),
                    ),
                  },
                ]),
            );
            statesCache = {
              at: Date.now(),
              data: { entities, fetchedAt: new Date().toISOString() },
            };
          })
          .finally(() => {
            statesPromise = null;
          });
      await statesPromise;
    }
    res.json({
      ...statesCache.data,
      grafanaUrl: env.GRAFANA_URL || "",
      cameras: cameras.map(({ id, name }) => ({ id, name })),
    });
  });
  app.get("/api/history", async (req, res) => {
    const metric = req.query.metric || "temperature";
    if (!Object.hasOwn(metrics, metric))
      return res.status(400).json({ error: "Choose a supported metric." });
    let range;
    try {
      range = historyRange(req.query);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const key = JSON.stringify([
      metric,
      Math.floor(range.start / 60000),
      Math.floor(range.end / 60000),
    ]);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < 60000) return res.json(cached.data);
    const data = await history(ha, metric, range, env);
    if (cache.size >= 40) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), data });
    res.json(data);
  });
  app.get("/api/water", async (req, res) => {
    const range = req.query.range || "7d";
    if (!waterRanges.includes(range))
      return res.status(400).json({ error: "Choose a supported water range." });
    const cached = waterCache.get(range);
    if (cached && Date.now() - cached.at < 300000) return res.json(cached.data);
    const data = await waterInsights(ha, range);
    waterCache.set(range, { at: Date.now(), data });
    res.json(data);
  });
  app.use("/api/growth", createGrowthRouter(env));
  const cameraFor = (id) => cameras.find((c) => c.id === id);
  const streamUrl = (id, stream) =>
    `/api/video/${id}/${tickets ? tickets.seal("camera", { ...stream, id }, Math.max(1, stream.expires - Date.now())) + "/" : ""}${new URL(stream.playlist).pathname.split("/").pop()}`;
  app.get("/api/cameras/:id/snapshot", async (req, res) => {
    const camera = cameraFor(req.params.id);
    if (!camera) return res.sendStatus(404);
    let snapshot = snapshots.get(camera.id);
    if (!snapshot || Date.now() - snapshot.at > 20000) {
      try {
        const upstream = await ha.raw(
          `/api/camera_proxy/${camera.entity}`,
          AbortSignal.timeout(25000),
        );
        if (
          !upstream.ok ||
          !upstream.headers.get("content-type")?.startsWith("image/")
        )
          throw new Error("Snapshot unavailable.");
        const bytes = Buffer.from(await upstream.arrayBuffer());
        if (bytes.length > 4 * 1024 * 1024)
          throw new Error("Snapshot too large.");
        snapshot = {
          at: Date.now(),
          bytes,
          type: upstream.headers.get("content-type"),
        };
        snapshots.set(camera.id, snapshot);
      } catch {
        if (!snapshot) return res.sendStatus(502);
      }
    }
    res
      .set("X-Captured-At", new Date(snapshot.at).toISOString())
      .type(snapshot.type)
      .send(snapshot.bytes);
  });
  // Only these two cameras can start streams. Upstream HLS URLs never reach the browser.
  app.get("/api/cameras/:id/live", async (req, res) => {
    const camera = cameraFor(req.params.id);
    if (!camera) return res.sendStatus(404);
    const existing = await store.get("stream:" + camera.id);
    if (existing && Date.now() - existing.lastUsed < 30000)
      return res.json({
        url: streamUrl(camera.id, existing),
      });
    const result = await ha.command({
      type: "camera/stream",
      entity_id: camera.entity,
    });
    const url = new URL(result.url, ha.url);
    if (
      url.origin !== new URL(ha.url).origin ||
      !url.pathname.startsWith("/api/hls/")
    )
      throw new Error("Unsupported camera stream.");
    const stream = {
      base: new URL(".", url).href,
      playlist: url.href,
      expires: Date.now() + 3600000,
      lastUsed: Date.now(),
    };
    await store.set("stream:" + camera.id, stream, 3600000);
    res.json({
      url: streamUrl(camera.id, stream),
    });
  });
  app.get(
    /^\/api\/video\/([a-z]+)\/(?:([\w-]+\.[\w-]+\.[\w-]+)\/)?([\w./-]+)$/,
    async (req, res) => {
      const id = req.params[0];
      const ticket = req.params[1];
      const stream = serverless
        ? tickets.open("camera", ticket)
        : await store.get("stream:" + id);
      const file = req.params[2];
      if (serverless && stream?.id !== id) return res.sendStatus(404);
      if (!stream || stream.expires < Date.now() || !mediaPath(file))
        return res.sendStatus(404);
      if (!serverless && Date.now() - stream.lastUsed > 15000) {
        stream.lastUsed = Date.now();
        await store.set(
          "stream:" + id,
          stream,
          Math.max(1, stream.expires - Date.now()),
        );
      }
      const path = new URL(file, stream.base);
      for (const key of ["_HLS_msn", "_HLS_part", "_HLS_skip"]) {
        const value = req.query[key];
        if (typeof value === "string" && /^(?:\d{1,12}|YES|v2)$/.test(value))
          path.searchParams.set(key, value);
      }
      const upstream = await ha.raw(
        path.pathname + path.search,
        AbortSignal.timeout(file.endsWith(".m3u8") ? 65000 : 25000),
      );
      if (!upstream.ok) return res.sendStatus(502);
      if (file.endsWith(".m3u8")) {
        const text = await upstream.text();
        const playlist = rewritePlaylist(
          text,
          new URL(stream.base),
          id,
          ticket,
        );
        return res.type("application/vnd.apple.mpegurl").send(playlist);
      }
      res
        .type(upstream.headers.get("content-type") || "video/mp2t")
        .send(Buffer.from(await upstream.arrayBuffer()));
    },
  );
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "This endpoint is not available." }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error(
      `[${new Date().toISOString()}] ${req.path}: upstream request failed`,
    );
    res.status(502).json({
      error: "The garden data could not be loaded. Please try again.",
    });
  });
  if (serverless) {
    app.use((req, res) =>
      res.status(404).json({ error: "This endpoint is not available." }),
    );
  } else if (process.argv.includes("--production")) {
    app.use(express.static(fileURLToPath(new URL("../dist", import.meta.url))));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
  app.locals.gardenAuth = auth;
  return app;
}
