import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { skipsSignIn, hashPassword } from "./auth.js";
import { gardenHandler } from "../api/garden.js";

test("only a dev server on loopback skips sign-in", () => {
  const dev = { devMode: true, serverless: false, publicOrigin: null };
  for (const host of ["127.0.0.1", "localhost", "::1"])
    assert.equal(skipsSignIn({ ...dev, host }), true, host);
  for (const host of ["0.0.0.0", "192.168.1.5", "::", "", undefined])
    assert.equal(skipsSignIn({ ...dev, host }), false, String(host));
  const host = "127.0.0.1";
  assert.equal(skipsSignIn({ ...dev, host, devMode: false }), false);
  assert.equal(skipsSignIn({ ...dev, host, serverless: true }), false);
  assert.equal(
    skipsSignIn({
      ...dev,
      host,
      publicOrigin: new URL("https://garden.example"),
    }),
    false,
  );
});

test("the Vercel handler still rejects unauthenticated reads, even if asked for dev mode", async () => {
  const handler = gardenHandler(
    {
      HOST: "127.0.0.1",
      HA_URL: "http://127.0.0.1:9",
      HA_TOKEN: "test-only",
      APP_USERNAME: "garden-test",
      APP_PASSWORD_HASH: await hashPassword("test-local-access-password"),
      APP_SESSION_SECRET: "c".repeat(43),
      APP_ORIGIN: "https://garden.example",
    },
    { devMode: true },
  );
  const server = createServer(handler).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/readings`, {
      headers: { "X-Forwarded-Proto": "https" },
    });
    assert.equal(response.status, 401);
  } finally {
    server.close();
  }
});

test("a dev server on loopback opens without a login but still refuses other sites", async (t) => {
  const upstream = createServer((req, res) => {
    if (req.url === "/api/websocket") {
      res.writeHead(400);
      return res.end();
    }
    res.setHeader("Content-Type", "application/json");
    res.end("[]");
  }).listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const reserve = createServer().listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      HA_URL: `http://127.0.0.1:${upstream.address().port}`,
      HA_TOKEN: "test-only",
      APP_USERNAME: "",
      APP_PASSWORD_HASH: "",
      APP_ORIGIN: "",
      TRUST_PROXY: "",
      INFLUX_URL: "",
    },
    stdio: ["ignore", "pipe", "ignore"],
  });
  t.after(() => {
    child.kill();
    upstream.close();
  });
  // Vite can print first on a fresh checkout, so wait for the listening line.
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error("Dev server did not start.")),
      30000,
    );
    timer.unref();
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("UD Sustainable Garden:")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Dev server exited with code ${code}.`));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const session = await (await fetch(`${base}/auth/session`)).json();
  assert.deepEqual(session, { user: "local", local: true });
  assert.equal((await fetch(`${base}/api/readings`)).status, 200);
  assert.equal(
    (
      await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { Origin: base },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(`${base}/api/readings`, {
        headers: { "Sec-Fetch-Site": "cross-site" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${base}/api/readings`, {
        headers: { Origin: "https://unrelated.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(`${base}/api/cameras/trees/ptz`, { method: "POST" })).status,
    403,
  );
});
