import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { createAuth, hashPassword } from "./auth.js";
import { memoryStore } from "./store.js";

const password = "test-account-password-only";
const passwordHash = await hashPassword(password);

test("sessions and logout work across different function instances", async (t) => {
  const store = memoryStore();
  const first = await setup(t, { store });
  const second = await setup(t, { store });
  const login = await first.post("/auth/login", {
    username: "garden-test",
    password,
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await fetch(second.base + "/api/private", { headers: { Cookie: cookie } }))
      .status,
    200,
  );
  await second.post("/auth/logout", {}, { Cookie: cookie });
  assert.equal(
    (await fetch(first.base + "/api/private", { headers: { Cookie: cookie } }))
      .status,
    401,
  );
});

test("changing the password hash revokes existing shared sessions", async (t) => {
  const store = memoryStore();
  const old = await setup(t, { store });
  const login = await old.post("/auth/login", {
    username: "garden-test",
    password,
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const current = await setup(t, {
    store,
    credentialHash: await hashPassword("replacement-password-only"),
  });
  assert.equal(
    (
      await fetch(current.base + "/api/private", {
        headers: { Cookie: cookie },
      })
    ).status,
    401,
  );
  assert.equal(
    (await fetch(old.base + "/api/private", { headers: { Cookie: cookie } }))
      .status,
    401,
  );
});

test("login limits are shared across function instances", async (t) => {
  const store = memoryStore();
  const first = await setup(t, { store, maxAttempts: 2 });
  const second = await setup(t, { store, maxAttempts: 2 });
  assert.equal(
    (
      await first.post("/auth/login", {
        username: "garden-test",
        password: "wrong",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await second.post("/auth/login", {
        username: "garden-test",
        password: "wrong",
      })
    ).status,
    401,
  );
  assert.equal(
    (await first.post("/auth/login", { username: "garden-test", password }))
      .status,
    429,
  );
});

async function setup(t, options = {}) {
  const { credentialHash = passwordHash, ...authOptions } = options;
  let now = Date.now();
  const app = express();
  const auth = createAuth(
    {
      username: "garden-test",
      passwordHash: credentialHash,
      origins: ["https://garden.example"],
      secure: true,
    },
    { now: () => now, ...authOptions },
  );
  app.use("/auth", auth.router);
  app.use("/api", auth.requireSession);
  app.get("/api/private", (req, res) => res.json({ private: true }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    auth.close();
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        Origin: "https://garden.example",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  return {
    auth,
    base,
    post,
    advance: (ms) => {
      now += ms;
    },
  };
}

test("auth fails closed without a configured account or a valid password hash", () => {
  assert.throws(() => createAuth({}), /APP_USERNAME/);
  assert.throws(
    () => createAuth({ username: "test", passwordHash: "plaintext" }),
    /APP_PASSWORD_HASH/,
  );
});

test("login protects data, uses opaque hardened cookies, rejects tampering and revokes on logout", async (t) => {
  const { base, post } = await setup(t);
  assert.equal((await fetch(base + "/api/private")).status, 401);
  const wrong = await post("/auth/login", {
    username: "garden-test",
    password: "incorrect",
  });
  assert.equal(wrong.status, 401);
  const unknown = await post("/auth/login", { username: "unknown", password });
  assert.deepEqual(await unknown.json(), await wrong.json());
  const login = await post("/auth/login", {
    username: "garden-test",
    password,
  });
  assert.equal(login.status, 200);
  assert.equal(login.headers.get("cache-control"), "no-store");
  const setCookie = login.headers.get("set-cookie");
  assert.match(setCookie, /^__Host-ud_garden=[\w-]{43};/);
  for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/"])
    assert.ok(setCookie.includes(flag));
  assert.ok(!setCookie.includes("Max-Age"));
  const cookie = setCookie.split(";")[0];
  assert.ok(!JSON.stringify(await login.json()).includes(password));
  assert.equal(
    (await fetch(base + "/api/private", { headers: { Cookie: cookie } }))
      .status,
    200,
  );
  assert.equal(
    (await fetch(base + "/api/private", { headers: { Cookie: cookie + "x" } }))
      .status,
    401,
  );
  assert.equal(
    (
      await fetch(base + "/api/private", {
        headers: { Cookie: cookie + "; " + cookie },
      })
    ).status,
    401,
  );
  const session = await fetch(base + "/auth/session", {
    headers: { Cookie: cookie },
  });
  assert.equal((await session.json()).user, "garden-test");
  const logout = await post("/auth/logout", {}, { Cookie: cookie });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/);
  assert.equal(
    (await fetch(base + "/api/private", { headers: { Cookie: cookie } }))
      .status,
    401,
  );
});

test("login and logout reject cross-site, missing-origin, malformed and oversized input", async (t) => {
  const { base, post } = await setup(t);
  for (const path of ["/auth/login", "/auth/logout"]) {
    assert.equal(
      (await post(path, {}, { Origin: "https://attacker.example" })).status,
      403,
    );
    assert.equal(
      (await post(path, {}, { "Sec-Fetch-Site": "cross-site" })).status,
      403,
    );
    assert.equal((await fetch(base + path, { method: "POST" })).status, 403);
    assert.equal((await fetch(base + path)).status, 405);
  }
  assert.equal(
    (await post("/auth/login", { username: [], password })).status,
    400,
  );
  assert.equal(
    (
      await post("/auth/login", {
        username: "garden-test",
        password: "x".repeat(5000),
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await fetch(base + "/auth/login", {
        method: "POST",
        headers: {
          Origin: "https://garden.example",
          "Content-Type": "application/json",
        },
        body: "{",
      })
    ).status,
    400,
  );
});

test("login rate limiting cannot be evaded with forged forwarding headers", async (t) => {
  const { post } = await setup(t, { maxAttempts: 2 });
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await post(
          "/auth/login",
          { username: "garden-test", password: "wrong" },
          { "X-Forwarded-For": `198.51.100.${i}` },
        )
      ).status,
      401,
    );
  const limited = await post(
    "/auth/login",
    { username: "garden-test", password },
    { "X-Forwarded-For": "198.51.100.99" },
  );
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
});

test("server expiry and logout notify open streams and old tokens cannot be revived", async (t) => {
  const { auth, base, post, advance } = await setup(t, { sessionMs: 1000 });
  let closed = 0;
  const app = express();
  app.use(auth.requireSession);
  app.get("/", (req, res) => {
    auth.onSessionEnd(req, () => {
      closed++;
    });
    res.end();
  });
  const streamServer = app.listen(0, "127.0.0.1");
  await once(streamServer, "listening");
  t.after(() => {
    streamServer.closeAllConnections();
    streamServer.close();
  });
  const login = await post("/auth/login", {
    username: "garden-test",
    password,
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  await fetch(`http://127.0.0.1:${streamServer.address().port}`, {
    headers: { Cookie: cookie },
  });
  advance(1001);
  assert.equal(
    (await fetch(base + "/auth/session", { headers: { Cookie: cookie } }))
      .status,
    401,
  );
  assert.equal(closed, 1);
  const second = await post("/auth/login", {
    username: "garden-test",
    password,
  });
  const nextCookie = second.headers.get("set-cookie").split(";")[0];
  assert.notEqual(nextCookie, cookie);
  await fetch(`http://127.0.0.1:${streamServer.address().port}`, {
    headers: { Cookie: nextCookie },
  });
  await post("/auth/logout", {}, { Cookie: nextCookie });
  assert.equal(closed, 2);
});
