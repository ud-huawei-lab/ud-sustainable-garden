import test from "node:test";
import assert from "node:assert/strict";
import { memoryStore, redisStore } from "./store.js";

test("storage expires sessions and limits without retaining raw token material", async () => {
  let now = 1000;
  const store = memoryStore({ now: () => now });
  await store.set("session:hashed-token", { user: "test" }, 100);
  assert.deepEqual(await store.get("session:hashed-token"), { user: "test" });
  assert.equal((await store.attempt("attempt:hashed-ip", 100)).count, 1);
  assert.equal((await store.attempt("attempt:hashed-ip", 100)).count, 2);
  now += 101;
  assert.equal(await store.get("session:hashed-token"), null);
  assert.equal((await store.attempt("attempt:hashed-ip", 100)).count, 1);
});

test("Vercel Redis configuration fails closed and never uses plaintext transport", () => {
  assert.throws(() => redisStore({}), /Storage/);
  assert.throws(
    () =>
      redisStore({
        KV_REST_API_URL: "http://redis.example",
        KV_REST_API_TOKEN: "mock-only",
      }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      redisStore({
        KV_REST_API_URL: "https://user:password@redis.example",
        KV_REST_API_TOKEN: "mock-only",
      }),
    /HTTPS/,
  );
});

test("Redis requests authenticate server-side, use TTLs and atomic limits, and refuse upstream errors", async () => {
  const calls = [];
  const store = redisStore(
    {
      KV_REST_API_URL: "https://redis.example",
      KV_REST_API_TOKEN: "mock-private-token",
    },
    {
      fetchImpl: async (url, options) => {
        assert.equal(url, "https://redis.example");
        assert.equal(options.redirect, "error");
        assert.equal(
          options.headers.Authorization,
          "Bearer mock-private-token",
        );
        const command = JSON.parse(options.body);
        calls.push(command);
        if (command[0] === "GET")
          return Response.json({ result: '{"user":"test"}' });
        if (command[0] === "EVAL") return Response.json({ result: [2, 1000] });
        return Response.json({ result: "OK" });
      },
    },
  );
  await store.set("session:hash", { user: "test" }, 5000);
  assert.deepEqual(calls[0].slice(-2), ["PX", 5000]);
  assert.deepEqual(await store.get("session:hash"), { user: "test" });
  assert.deepEqual(await store.attempt("attempt:hash", 1000), {
    count: 2,
    ttl: 1000,
  });
  assert.equal(calls.at(-1)[0], "EVAL");
  const broken = redisStore(
    {
      UPSTASH_REDIS_REST_URL: "https://redis.example",
      UPSTASH_REDIS_REST_TOKEN: "mock-token",
    },
    {
      fetchImpl: async () =>
        Response.json({ error: "private upstream details" }),
    },
  );
  await assert.rejects(
    broken.get("session:hash"),
    (error) => !error.message.includes("private upstream details"),
  );
});
