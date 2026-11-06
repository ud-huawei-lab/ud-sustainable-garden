import test from "node:test";
import assert from "node:assert/strict";
import {
  gardenTrees,
  plantingHeight,
  groundIrrigationRoutes,
  slopeBounds,
} from "../shared/garden-layout.js";
test("garden keeps pots on pavement and places staggered ground trees on the slope behind the tank", () => {
  assert.deepEqual(
    gardenTrees.map((t) => t.name),
    ["Mango", "Lemon", "Ghaf", "Sidr"],
  );
  assert.ok(gardenTrees.slice(0, 2).every((t) => t.potted && t.y === 0));
  const [ghaf, sidr] = gardenTrees.slice(2);
  assert.ok(!ghaf.potted && !sidr.potted);
  assert.ok(ghaf.y > sidr.y + 0.5);
  assert.ok(ghaf.z - sidr.z > 4);
  assert.ok(slopeBounds.front < -5.8, "slope begins behind the tank");
  for (const tree of [ghaf, sidr]) {
    assert.ok(tree.z < slopeBounds.front && tree.z > slopeBounds.back);
    assert.ok(tree.x > slopeBounds.left && tree.x < slopeBounds.right);
    assert.equal(tree.y, plantingHeight(tree.x, tree.z));
  }
  assert.equal(plantingHeight(2, slopeBounds.front), -0.07);
});
test("irrigation reaches both ground trees above the sloped surface", () => {
  for (const route of groundIrrigationRoutes)
    for (const [x, y, z] of route) assert.ok(y > plantingHeight(x, z));
  for (const tree of gardenTrees.slice(2))
    assert.ok(
      groundIrrigationRoutes.some((route) => {
        const end = route.at(-1);
        return end[0] === tree.x && end[2] === tree.z;
      }),
    );
});
