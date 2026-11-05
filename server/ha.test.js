import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { HomeAssistant } from "./ha.js";

test("parallel readers share one sign-in on one persistent connection", async (t) => {
  const sockets = new Set();
  let starts = 0;
  const server = createServer((req, res) => {
    sockets.add(req.socket.remotePort);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/auth/login_flow") {
      starts++;
      res.end(JSON.stringify({ type: "form", flow_id: "test-flow" }));
    } else if (req.url === "/auth/login_flow/test-flow")
      res.end(JSON.stringify({ type: "create_entry", result: "one-use-code" }));
    else if (req.url === "/auth/token")
      res.end(
        JSON.stringify({
          access_token: "backend-token",
          refresh_token: "backend-refresh",
          expires_in: 1800,
        }),
      );
    else res.writeHead(404).end("{}");
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const ha = new HomeAssistant({
    HA_URL: `http://127.0.0.1:${server.address().port}`,
    HA_USERNAME: "test",
    HA_PASSWORD: "test",
  });
  t.after(async () => {
    await ha.authDispatcher.close();
    server.close();
  });
  assert.deepEqual(await Promise.all([ha.token(), ha.token(), ha.token()]), [
    "backend-token",
    "backend-token",
    "backend-token",
  ]);
  assert.equal(starts, 1);
  assert.equal(sockets.size, 1);
});
