import { WebSocket } from "ws";
import { allowedEntities } from "../shared/catalog.js";

export function publicEntity(entity) {
  return {
    state: entity.state,
    changed: entity.last_changed,
    updated: entity.last_updated,
    attributes: Object.fromEntries(
      [
        "unit_of_measurement",
        "friendly_name",
        "next_rising",
        "next_setting",
        "elevation",
        "azimuth",
      ]
        .filter((key) => entity.attributes?.[key] !== undefined)
        .map((key) => [key, entity.attributes[key]]),
    ),
  };
}

// One authenticated read-only HA subscription shared by the dashboard clients.
export class RealtimeReadings {
  constructor(ha, onSnapshot) {
    this.ha = ha;
    this.onSnapshot = onSnapshot;
    this.entities = {};
    this.listeners = new Set();
    this.socket = null;
    this.reconnect = null;
    this.flush = null;
    this.attempt = 0;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    if (Object.keys(this.entities).length)
      listener({
        entities: { ...this.entities },
        fetchedAt: new Date().toISOString(),
      });
    if (!this.socket && !this.connecting && !this.reconnect) this.connect();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        clearTimeout(this.reconnect);
        clearTimeout(this.flush);
        this.reconnect = null;
        this.flush = null;
        this.socket?.close();
        this.socket = null;
      }
    };
  }
  publish() {
    this.flush = null;
    const snapshot = {
      entities: { ...this.entities },
      fetchedAt: new Date().toISOString(),
    };
    this.onSnapshot(snapshot);
    for (const listener of this.listeners) listener(snapshot);
  }
  schedule() {
    if (!this.flush) this.flush = setTimeout(() => this.publish(), 250);
  }
  async connect() {
    this.connecting = true;
    try {
      const token = await this.ha.token();
      if (!this.listeners.size) return;
      const socket = new WebSocket(
        `${this.ha.url.replace(/^http/, "ws")}/api/websocket`,
        { maxPayload: 8 * 1024 * 1024 },
      );
      this.socket = socket;
      const watchdog = setTimeout(() => socket.terminate(), 25000);
      socket.on("error", () => {});
      socket.on("message", (bytes) => {
        let message;
        try {
          message = JSON.parse(bytes.toString());
        } catch {
          return;
        }
        if (message.type === "auth_required")
          socket.send(JSON.stringify({ type: "auth", access_token: token }));
        if (message.type === "auth_invalid") {
          this.ha.expires = 0;
          socket.close();
        }
        if (message.type === "auth_ok") {
          clearTimeout(watchdog);
          this.attempt = 0;
          socket.send(
            JSON.stringify({
              id: 1,
              type: "subscribe_events",
              event_type: "state_changed",
            }),
          );
          socket.send(JSON.stringify({ id: 2, type: "get_states" }));
        }
        if (message.id === 2 && message.type === "result" && message.success) {
          this.entities = Object.fromEntries(
            message.result
              .filter((e) => allowedEntities.has(e.entity_id))
              .map((e) => [e.entity_id, publicEntity(e)]),
          );
          this.publish();
        }
        if (
          message.type === "event" &&
          message.event?.event_type === "state_changed"
        ) {
          const { entity_id: id, new_state: entity } = message.event.data;
          if (!allowedEntities.has(id)) return;
          if (entity) this.entities[id] = publicEntity(entity);
          else delete this.entities[id];
          this.schedule();
        }
      });
      socket.on("close", () => {
        clearTimeout(watchdog);
        if (this.socket === socket) this.socket = null;
        this.retry();
      });
    } catch {
      this.retry();
    } finally {
      this.connecting = false;
    }
  }
  retry() {
    if (!this.listeners.size || this.reconnect) return;
    for (const listener of this.listeners)
      listener({
        error: "Sensor updates were interrupted. Reconnecting automatically.",
      });
    this.reconnect = setTimeout(
      () => {
        this.reconnect = null;
        this.connect();
      },
      Math.min(30000, 1000 * 2 ** this.attempt++),
    );
  }
}
