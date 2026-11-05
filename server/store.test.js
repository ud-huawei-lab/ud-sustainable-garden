import test from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "./store.js";

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
