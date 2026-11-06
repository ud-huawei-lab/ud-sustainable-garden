import test from "node:test";
import assert from "node:assert/strict";
import {
  gardenTrees,
  plantingHeight,
  groundIrrigationRoutes,
  slopeBounds,
} from "../shared/garden-layout.js";
test("garden keeps Mango and Lemon on pavement and staggers Ghaf and Sidr on different slope levels", () => {
  assert.deepEqual(
    gardenTrees.map((t) => t.name),
    ["Mango", "Lemon", "Ghaf", "Sidr"],
  );
  assert.ok(gardenTrees.slice(0, 2).every((t) => t.potted && t.y === 0));
  const [ghaf, sidr] = gardenTrees.slice(2);
  assert.ok(!ghaf.potted && !sidr.potted);
  assert.ok(ghaf.y > sidr.y + 0.5);
  assert.ok(Math.abs(ghaf.z - sidr.z) > 4);
  for (const tree of [ghaf, sidr])
    assert.equal(tree.y, plantingHeight(tree.x, tree.z));
  assert.equal(plantingHeight(slopeBounds.left, 0), -0.07);
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
