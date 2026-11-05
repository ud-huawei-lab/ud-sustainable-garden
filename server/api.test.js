import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("HTTP boundary exposes only garden data, rejects writes, and validates historical inputs", async (t) => {
  const upstream = createServer((req, res) => {
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
      APP_USERNAME: "",
      APP_PASSWORD: "",
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
  const response = await fetch(`${base}/api/readings`);
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
  ])
    assert.equal((await fetch(base + path)).status, 400);
  for (const path of [
    "/api/cameras/unknown/snapshot",
    "/api/states",
    "/api/video/unknown/master.m3u8",
  ])
    assert.equal((await fetch(base + path)).status, 404);
  assert.equal(
    (await fetch(`${base}/api/readings`, { method: "POST" })).status,
    405,
  );
  assert.equal(
    (
      await fetch(`${base}/api/readings`, {
        headers: { "Sec-Fetch-Site": "cross-site" },
      })
    ).status,
    403,
  );
});
