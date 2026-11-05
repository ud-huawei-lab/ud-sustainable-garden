import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { hashPassword } from "./auth.js";

async function server(t, trustProxy) {
  const reserve = createServer().listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const child = spawn(process.execPath, ["server/index.js", "--production"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "0.0.0.0",
      PORT: String(port),
      APP_ORIGIN: "https://garden.example",
      APP_USERNAME: "garden-test",
      APP_PASSWORD_HASH: await hashPassword("proxy-test-password-only"),
      TRUST_PROXY: trustProxy,
      HA_URL: "https://ha.example",
      HA_TOKEN: "test-only-token",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  await Promise.race([
    once(child.stdout, "data"),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Test server failed to start")),
        5000,
      ).unref(),
    ),
  ]);
  return `http://127.0.0.1:${port}`;
}

test("remote authentication refuses plaintext and forged HTTPS headers when no proxy is trusted", async (t) => {
  const base = await server(t, "");
  assert.equal((await fetch(base + "/healthz")).status, 200);
  assert.equal((await fetch(base + "/auth/session")).status, 426);
  assert.equal(
    (
      await fetch(base + "/auth/session", {
        headers: { "X-Forwarded-Proto": "https" },
      })
    ).status,
    426,
  );
});

test("an explicitly trusted HTTPS proxy receives Secure cookies while cross-origin login remains blocked", async (t) => {
  const base = await server(t, "loopback");
  const headers = {
    "X-Forwarded-Proto": "https",
    Origin: "https://garden.example",
    "Content-Type": "application/json",
  };
  const body = JSON.stringify({
    username: "garden-test",
    password: "proxy-test-password-only",
  });
  const login = await fetch(base + "/auth/login", {
    method: "POST",
    headers,
    body,
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /^__Host-ud_garden=/);
  assert.match(login.headers.get("set-cookie"), /; Secure;/);
  assert.equal(
    login.headers.get("strict-transport-security"),
    "max-age=31536000",
  );
  assert.equal(
    (
      await fetch(base + "/auth/login", {
        method: "POST",
        headers: { ...headers, Origin: "https://attacker.example" },
        body,
      })
    ).status,
    403,
  );
});
