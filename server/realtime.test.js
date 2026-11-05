import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocketServer } from "ws";
import { RealtimeReadings } from "./realtime.js";

test("realtime delivers initial and changed values without exposing unrelated entities or tokens", async (t) => {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const wss = new WebSocketServer({ server });
  t.after(() => {
    wss.clients.forEach((client) => client.terminate());
    wss.close();
    server.close();
  });
  const entity = {
    entity_id: "sensor.ambient_weather_temperature",
    state: "0",
    attributes: { unit_of_measurement: "°C", access_token: "private-token" },
  };
  wss.on("connection", (socket) => {
    const send = (message) => socket.send(JSON.stringify(message));
    send({ type: "auth_required" });
    socket.on("message", (bytes) => {
      const message = JSON.parse(bytes);
      if (message.type === "auth") {
        assert.equal(message.access_token, "server-only");
        send({ type: "auth_ok" });
      }
      if (message.type === "get_states") {
        send({
          type: "result",
          id: message.id,
          success: true,
          result: [
            entity,
            { entity_id: "sensor.private", state: "secret", attributes: {} },
          ],
        });
        setTimeout(() => {
          if (socket.readyState === 1)
            send({
              type: "event",
              event: {
                event_type: "state_changed",
                data: {
                  entity_id: entity.entity_id,
                  new_state: { ...entity, state: "1" },
                },
              },
            });
        }, 10);
      }
    });
  });
  const feed = new RealtimeReadings(
    {
      url: `http://127.0.0.1:${server.address().port}`,
      token: async () => "server-only",
    },
    () => {},
  );
  const snapshots = [];
  let unsubscribe;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("No real-time change was delivered")),
      3000,
    );
    unsubscribe = feed.subscribe((snapshot) => {
      if (!snapshot.entities) return;
      snapshots.push(snapshot);
      if (snapshot.entities[entity.entity_id]?.state === "1") {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  unsubscribe();
  assert.equal(snapshots[0].entities[entity.entity_id].state, "0");
  assert.equal(snapshots.at(-1).entities[entity.entity_id].state, "1");
  assert.equal(Object.keys(snapshots.at(-1).entities).length, 1);
  assert.ok(!JSON.stringify(snapshots).includes("private-token"));
  assert.ok(!JSON.stringify(snapshots).includes("server-only"));
});
