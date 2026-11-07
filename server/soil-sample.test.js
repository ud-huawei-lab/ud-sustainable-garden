import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sampleSoil, soilBands } from "../src/soilSample.js";

const at = Date.UTC(2026, 10, 7, 6);

test("soil sample data is absent while the switch is off", () => {
  for (const value of [false, undefined, null, 0, ""])
    assert.equal(sampleSoil(value, at), null);
});

test("soil sample data covers each tree and names its device", () => {
  const soil = sampleSoil(true, at);
  assert.deepEqual(
    soil.trees.map(({ name }) => name),
    ["Mango", "Lime", "Ghaf", "Sidr"],
  );
  for (const tree of soil.trees) {
    assert.equal(tree.device, "WH51 soil moisture sensor");
    assert.equal(tree.entity, null);
    assert.ok(tree.moisture > 0 && tree.moisture <= 100);
    assert.equal(tree.moisture, tree.points.at(-1).value);
  }
});

test("every sample tree has a soil band for its ring", () => {
  for (const tree of sampleSoil(true, at).trees)
    assert.ok(soilBands[tree.band]?.color, tree.name);
});

test("soil sample data stays out of real data and the assistant", async () => {
  for (const file of [
    "src/Assistant.jsx",
    "src/data.js",
    "src/gardenScene.js",
    "src/Home.jsx",
    "server/app.js",
    "server/vision.js",
    "shared/catalog.js",
  ]) {
    const source = await readFile(file, "utf8");
    assert.ok(!source.includes("soilSample"), file);
    assert.ok(!source.includes("sampleSoil"), file);
  }
});
