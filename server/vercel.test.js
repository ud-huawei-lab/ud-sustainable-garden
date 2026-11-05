import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import { gardenHandler } from "../api/garden.js";
import { memoryStore } from "./store.js";
import { hashPassword } from "./auth.js";
import { randomBytes } from "node:crypto";

test("Vercel serves login, real readings and camera resources across isolated instances", async (t) => {
  const upstream = createServer((req, res) => {
    assert.equal(req.headers.authorization, "Bearer mock-ha-secret");
    if (req.url === "/api/states")
      return res.setHeader("Content-Type", "application/json").end(
        JSON.stringify([
          {
            entity_id: "sensor.ambient_weather_temperature",
            state: "0",
            attributes: { unit_of_measurement: "°C" },
          },
        ]),
      );
    if (req.url.startsWith("/api/hls/mock-camera-secret/"))
      return res
        .setHeader("Content-Type", "application/vnd.apple.mpegurl")
        .end("#EXTM3U\nsegment/0.1.m4s");
    res.writeHead(404).end();
  }).listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const stores = [];
  const env = {
    APP_USERNAME: "garden-test",
    APP_PASSWORD_HASH: await hashPassword("vercel-test-password-only"),
    APP_ORIGIN: "https://garden.example",
    APP_SESSION_SECRET: randomBytes(32).toString("base64url"),
    VERCEL_URL: "preview.example",
    HA_URL: `http://127.0.0.1:${upstream.address().port}`,
    HA_TOKEN: "mock-ha-secret",
  };
  const servers = [];
  t.after(() => {
    for (const server of servers) {
      server.closeAllConnections();
      server.close();
    }
    upstream.closeAllConnections();
    upstream.close();
  });
  async function instance() {
    const store = memoryStore();
    stores.push(store);
    const app = express();
    app.use(gardenHandler(env, { store }));
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    servers.push(server);
    return `http://127.0.0.1:${server.address().port}/api/garden`;
  }
  const first = await instance(),
    second = await instance();
  const headers = {
    "X-Forwarded-Proto": "https",
    Origin: "https://garden.example",
    "Content-Type": "application/json",
  };
  const request = (base, path, options = {}) =>
    fetch(`${base}?__garden_route=${encodeURIComponent(path)}`, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
  assert.equal((await request(first, "api/readings")).status, 401);
  const login = await request(first, "auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: "garden-test",
      password: "vercel-test-password-only",
    }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const reading = await request(second, "api/readings", {
    headers: { Cookie: cookie },
  });
  const body = await reading.json();
  assert.equal(reading.status, 200);
  assert.equal(body.entities["sensor.ambient_weather_temperature"].state, "0");
  assert.ok(!JSON.stringify(body).includes("mock-ha-secret"));
  assert.equal(
    (await request(first, "api/events", { headers: { Cookie: cookie } }))
      .status,
    204,
  );
  await stores[0].set(
    "stream:trees",
    {
      base: env.HA_URL + "/api/hls/mock-camera-secret/",
      playlist: env.HA_URL + "/api/hls/mock-camera-secret/master.m3u8",
      expires: Date.now() + 60000,
      lastUsed: Date.now(),
    },
    60000,
  );
  const camera = await request(first, "api/cameras/trees/live", {
    headers: { Cookie: cookie },
  });
  const cameraData = await camera.json();
  assert.ok(!cameraData.url.includes("mock-camera-secret"));
  assert.match(cameraData.url, /^\/api\/video\/trees\/[\w.-]+\/master.m3u8$/);
  const playlist = await request(second, cameraData.url.slice(1), {
    headers: { Cookie: cookie },
  });
  const text = await playlist.text();
  assert.equal(playlist.status, 200);
  assert.ok(!text.includes("mock-camera-secret"));
  assert.match(text, /\/api\/video\/trees\/[\w.-]+\/segment\/0.1.m4s/);
  const logout = await request(second, "auth/logout", {
    method: "POST",
    headers: { Cookie: cookie },
  });
  assert.match(logout.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/);
  assert.equal((await request(first, "api/readings")).status, 401);
  // Stateless logout clears the browser cookie; a copied token lasts until expiry.
  assert.equal(
    (await request(first, "api/readings", { headers: { Cookie: cookie } }))
      .status,
    200,
  );
});

test("Vercel rejects malformed rewrite paths and fails closed on missing runtime settings", async (t) => {
  const app = express();
  app.use(gardenHandler({}));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api/garden`;
  assert.equal(
    (await fetch(base + "?__garden_route=api/../auth/login")).status,
    400,
  );
  assert.equal(
    (
      await fetch(
        base + "?__garden_route=auth/session&__garden_route=api/readings",
      )
    ).status,
    400,
  );
  const response = await fetch(base + "?__garden_route=auth/session");
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("APP_PASSWORD_HASH"));
});
