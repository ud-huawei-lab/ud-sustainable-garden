import test from "node:test";
import assert from "node:assert/strict";
import { connectReadings } from "../src/readings-transport.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));
const snapshot = (value) => ({
  entities: { "sensor.test": { state: value } },
  fetchedAt: "2026-11-05T12:00:00Z",
});
function fixture(t, response = () => Response.json(snapshot("0"))) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const state = { calls: 0, data: [], errors: [], unauthorized: 0 };
  class Events {
    constructor() {
      state.stream = this;
      this.handlers = {};
    }
    addEventListener(name, handler) {
      this.handlers[name] = handler;
    }
    close() {
      this.closed = true;
    }
  }
  const close = connectReadings({
    fetchImpl: async () => {
      state.calls++;
      return response();
    },
    EventSourceImpl: Events,
    onData: (data) => state.data.push(data),
    onError: (error) => state.errors.push(error),
    onUnauthorized: () => {
      state.unauthorized++;
    },
  });
  t.after(close);
  return { state, close };
}

test("live transport keeps real zeros and uses SSE without unnecessary polling", async (t) => {
  const { state } = fixture(t);
  await flush();
  assert.equal(state.data[0].entities["sensor.test"].state, "0");
  state.stream.onmessage({ data: JSON.stringify(snapshot("12")) });
  t.mock.timers.tick(12000);
  await flush();
  assert.equal(state.calls, 1);
  assert.equal(state.data.at(-1).entities["sensor.test"].state, "12");
});

test("failed SSE falls back to one-second reads and stops polling when streaming recovers", async (t) => {
  const { state } = fixture(t);
  await flush();
  state.stream.onerror();
  await flush();
  const before = state.calls;
  t.mock.timers.tick(1000);
  await flush();
  assert.equal(state.calls, before + 1);
  state.stream.onmessage({ data: JSON.stringify(snapshot("20")) });
  const recovered = state.calls;
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(state.calls, recovered);
});

test("buffered SSE also falls back, and cleanup closes streams and scheduled requests", async (t) => {
  const { state, close } = fixture(t);
  await flush();
  t.mock.timers.tick(10000);
  await flush();
  assert.equal(state.calls, 2);
  close();
  const before = state.calls;
  t.mock.timers.tick(20000);
  await flush();
  assert.equal(state.calls, before);
  assert.equal(state.stream.closed, true);
});

test("missing deployed API and expired login are surfaced instead of silently leaving blank readings", async (t) => {
  const { state } = fixture(
    t,
    () => new Response("NOT_FOUND", { status: 404 }),
  );
  await flush();
  assert.match(state.errors[0], /readings service/i);
  assert.equal(state.data.length, 0);
  state.stream.handlers["session-ended"]();
  assert.equal(state.unauthorized, 1);
  assert.equal(state.stream.closed, true);
});

test("unauthorized REST response ends the session and never supplies invented values", async (t) => {
  const { state } = fixture(t, () =>
    Response.json({ error: "Sign in." }, { status: 401 }),
  );
  await flush();
  assert.equal(state.unauthorized, 1);
  assert.equal(state.data.length, 0);
});
