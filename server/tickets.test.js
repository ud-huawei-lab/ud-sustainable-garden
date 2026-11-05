import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createTickets } from "./tickets.js";

test("encrypted tickets work across isolated functions and expire without a database", () => {
  let now = Date.now();
  const secret = randomBytes(32).toString("base64url");
  const first = createTickets(secret, { now: () => now }),
    second = createTickets(secret, { now: () => now });
  const token = first.seal("session", { user: "test" }, 1800000);
  assert.deepEqual(second.open("session", token), { user: "test" });
  assert.notEqual(first.seal("session", { user: "test" }, 1800000), token);
  now += 1800001;
  assert.equal(second.open("session", token), null);
});

test("ticket tampering, cross-purpose reuse, incorrect keys and oversized input are rejected", () => {
  const tickets = createTickets(randomBytes(32).toString("base64url"));
  const token = tickets.seal(
    "camera",
    { source: "private-upstream-token" },
    3600000,
  );
  assert.ok(!token.includes("private-upstream-token"));
  assert.equal(tickets.open("session", token), null);
  const parts = token.split(".");
  parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
  assert.equal(tickets.open("camera", parts.join(".")), null);
  assert.equal(
    createTickets(randomBytes(32).toString("base64url")).open("camera", token),
    null,
  );
  assert.equal(tickets.open("camera", "a".repeat(6001)), null);
  assert.throws(() => createTickets("short"), /APP_SESSION_SECRET/);
});
