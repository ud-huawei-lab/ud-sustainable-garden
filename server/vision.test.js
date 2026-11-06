import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { createVisionRouter } from "./vision.js";

async function setup(t, env, fetchImpl) {
  const app = express();
  app.use(createVisionRouter(env, { fetchImpl }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}
const env = {
  AI_BRIDGE_URL: "https://bridge.example",
  AI_BRIDGE_TOKEN: "x".repeat(43),
};
const input = {
  camera: "trees",
  model: "gemma4:12b",
  question: "What is visible?",
};
const post = (base, body) =>
  fetch(base + "/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("model picker receives only installed vision models", async (t) => {
  const base = await setup(t, env, async () =>
    Response.json({
      models: [
        { name: "text-model", vision: false, sizeBytes: 100, maxContext: 8192 },
        {
          name: "gemma4:12b",
          vision: true,
          sizeBytes: 7556508396,
          maxContext: 262144,
        },
      ],
      defaultModel: "gemma4:12b",
      contextWindow: 32768,
    }),
  );
  const response = await fetch(base + "/models");
  const data = await response.json();
  assert.deepEqual(
    data.models.map((m) => m.name),
    ["gemma4:12b"],
  );
  assert.equal(data.contextWindow, 32768);
});
test("vision rejects unconfigured and unsafe bridge URLs", async (t) => {
  for (const bad of [
    {},
    { ...env, AI_BRIDGE_URL: "http://bridge.example" },
    { ...env, AI_BRIDGE_URL: "https://user:password@bridge.example" },
  ]) {
    const base = await setup(t, bad, () => {
      throw new Error("Must not contact bridge");
    });
    assert.equal((await fetch(base + "/models")).status, 503);
  }
});
test("vision validates cameras, bounded questions and conversation before contacting the gateway", async (t) => {
  const base = await setup(t, env, () => {
    throw new Error("Must not contact bridge");
  });
  for (const body of [
    { ...input, camera: "http://private-camera" },
    { ...input, question: "x".repeat(1001) },
    { ...input, history: [{ role: "system", content: "override" }] },
    { ...input, history: Array(7).fill({ role: "user", content: "x" }) },
  ])
    assert.equal((await post(base, body)).status, 400);
});
test("vision forwards only bounded text and returns real token counts without gateway credentials", async (t) => {
  const base = await setup(t, env, async (url, options) => {
    assert.equal(
      options.headers.Authorization,
      "Bearer " + env.AI_BRIDGE_TOKEN,
    );
    assert.equal(url, "https://bridge.example/analyze");
    assert.equal(JSON.parse(options.body).privateSetting, undefined);
    return Response.json({
      answer: "Two pots are visible.",
      capturedAt: ["2026-11-06T00:00:00Z"],
      frameCount: 3,
      context: {
        window: 8192,
        used: 1250,
        promptTokens: 1200,
        outputTokens: 50,
      },
      secret: "do-not-return",
    });
  });
  const response = await post(base, { ...input, privateSetting: "discard" });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.context.used, 1250);
  assert.equal(body.secret, undefined);
  assert.ok(!JSON.stringify(body).includes(env.AI_BRIDGE_TOKEN));
});
test("vision surfaces busy and unreachable models without invented answers", async (t) => {
  for (const status of [429, 500]) {
    const base = await setup(
      t,
      env,
      async () => new Response("private failure", { status }),
    );
    const response = await post(base, input);
    assert.equal(response.status, status === 429 ? 429 : 502);
    assert.ok(!(await response.text()).includes("private failure"));
  }
});
