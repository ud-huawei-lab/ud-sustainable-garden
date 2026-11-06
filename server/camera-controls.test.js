import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { createCameraControlsRouter } from "./camera-controls.js";
async function setup(t, command = async () => {}, available = true) {
  const app = express();
  const entities = ["tree", "camera2"].flatMap((prefix) =>
    ["left", "right", "up", "down", "stop"].map((d) => ({
      entity_id: `button.${prefix}_ptz_${d}`,
      state: available ? "unknown" : "unavailable",
    })),
  );
  app.use(createCameraControlsRouter({ get: async () => entities, command }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}
const move = (base, id, body) =>
  fetch(`${base}/${id}/ptz`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
test("PTZ discovers actual button capabilities and rejects unavailable cameras", async (t) => {
  const base = await setup(t, undefined, false);
  assert.equal(
    (await (await fetch(base + "/trees/controls")).json()).panTilt,
    false,
  );
  assert.equal((await move(base, "trees", { direction: "up" })).status, 409);
  assert.equal((await fetch(base + "/unknown/controls")).status, 404);
});
test("PTZ accepts only allowlisted short nudges with a Home Assistant stop sequence", async (t) => {
  const commands = [];
  const base = await setup(t, async (command) => commands.push(command));
  for (const body of [
    { direction: "calibrate" },
    { direction: "left", duration: 9999 },
    { direction: "button.other" },
  ])
    assert.equal((await move(base, "trees", body)).status, 400);
  assert.equal((await move(base, "trees", { direction: "right" })).status, 200);
  assert.deepEqual(commands[0], {
    type: "execute_script",
    sequence: [
      {
        action: "button.press",
        target: { entity_id: "button.tree_ptz_right" },
        continue_on_error: true,
      },
      { delay: { milliseconds: 350 } },
      { action: "button.press", target: { entity_id: "button.tree_ptz_stop" } },
    ],
  });
  await move(base, "garden", { direction: "stop" });
  assert.equal(commands[1].sequence.length, 1);
  assert.equal(
    commands[1].sequence[0].target.entity_id,
    "button.camera2_ptz_stop",
  );
});
test("PTZ attempts an extra stop when Home Assistant reports a failure", async (t) => {
  const commands = [];
  const base = await setup(t, async (command) => {
    commands.push(command);
    if (commands.length === 1) throw new Error("upstream failed");
  });
  assert.equal((await move(base, "garden", { direction: "down" })).status, 502);
  assert.equal(
    commands[1].sequence[0].target.entity_id,
    "button.camera2_ptz_stop",
  );
});

test("PTZ rejects overlapping nudges but keeps Stop available", async (t) => {
  let release, started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  const base = await setup(t, async (command) => {
    if (command.sequence.length > 1) {
      started();
      await hold;
    }
  });
  const first = move(base, "trees", { direction: "left" });
  await ready;
  assert.equal((await move(base, "trees", { direction: "right" })).status, 429);
  assert.equal((await move(base, "trees", { direction: "stop" })).status, 200);
  release();
  assert.equal((await first).status, 200);
});
