import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { hashPassword } from "./auth.js";

test("HTTP boundary protects garden data, rejects arbitrary writes, and validates historical inputs", async (t) => {
  const upstream = createServer((req, res) => {
    if (req.url === "/api/websocket") {
      res.writeHead(400);
      return res.end();
    }
    assert.equal(req.headers.authorization, "Bearer test-backend-only-token");
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/states")
      return res.end(
        JSON.stringify([
          {
            entity_id: "sensor.ambient_weather_temperature",
            state: "0",
            attributes: {
              unit_of_measurement: "°C",
              access_token: "do-not-expose",
            },
            last_updated: "2026-11-05T01:00:00Z",
          },
          {
            entity_id: "sensor.unrelated_private_entity",
            state: "private",
            attributes: {},
          },
        ]),
      );
    res.end(JSON.stringify([]));
  }).listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const reserve = createServer().listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const child = spawn(process.execPath, ["server/index.js", "--production"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      HA_URL: `http://127.0.0.1:${upstream.address().port}`,
      HA_TOKEN: "test-backend-only-token",
      APP_USERNAME: "garden-test",
      APP_PASSWORD_HASH: await hashPassword("test-api-password-only"),
      APP_ORIGIN: "",
      TRUST_PROXY: "",
      INFLUX_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    child.kill();
    upstream.close();
  });
  await Promise.race([
    once(child.stdout, "data"),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Test server did not start.")),
        5000,
      ).unref(),
    ),
  ]);
  const base = `http://127.0.0.1:${port}`;
  for (const path of [
    "/api/readings",
    "/api/events",
    "/api/history",
    "/api/water",
    "/api/cameras/trees/snapshot",
    "/api/cameras/trees/live",
    "/api/video/trees/master.m3u8",
    "/api/ai/models",
    "/api/cameras/trees/controls",
  ])
    assert.equal((await fetch(base + path)).status, 401);
  const login = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "garden-test",
      password: "test-api-password-only",
    }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  for (const origin of [undefined, "https://unrelated.example"]) {
    for (const path of ["/api/ai/analyze", "/api/cameras/trees/ptz"]) {
      const response = await fetch(base + path, {
        method: "POST",
        headers: { Cookie: cookie, ...(origin ? { Origin: origin } : {}) },
      });
      assert.equal(response.status, 403);
    }
  }
  const request = (url, options = {}) =>
    fetch(url, { ...options, headers: { Cookie: cookie, ...options.headers } });
  const response = await request(`${base}/api/readings`);
  assert.equal(response.status, 200);
  const text = await response.text();
  const data = JSON.parse(text);
  assert.equal(data.entities["sensor.ambient_weather_temperature"].state, "0");
  assert.equal(Object.keys(data.entities).length, 1);
  assert.ok(!text.includes("do-not-expose"));
  assert.ok(!text.includes("test-backend-only-token"));
  for (const path of [
    "/api/history?metric=constructor",
    "/api/history?range=all",
    "/api/history?start=bad&end=bad",
    "/api/water?range=24h",
    "/api/water?range=constructor",
  ])
    assert.equal((await request(base + path)).status, 400);
  const water = await (await request(`${base}/api/water?range=7d`)).json();
  assert.equal(water.absoluteHumidity.stats.mean, null);
  assert.ok(water.days.every((day) => day.et0 === null));
  for (const path of [
    "/api/cameras/unknown/snapshot",
    "/api/states",
    "/api/video/unknown/master.m3u8",
  ])
    assert.equal((await request(base + path)).status, 404);
  assert.equal(
    (await request(`${base}/api/readings`, { method: "POST" })).status,
    405,
  );
  assert.equal(
    (
      await request(`${base}/api/readings`, {
        headers: { "Sec-Fetch-Site": "cross-site" },
      })
    ).status,
    403,
  );
  const events = await request(base + "/api/events", {
    signal: AbortSignal.timeout(4000),
  });
  assert.equal(events.status, 200);
  const logout = await fetch(base + "/auth/logout", {
    method: "POST",
    headers: { Origin: base, Cookie: cookie },
  });
  assert.equal(logout.status, 204);
  assert.match(await events.text(), /event: session-ended/);
  assert.equal((await request(base + "/api/readings")).status, 401);
});
