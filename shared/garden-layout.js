// Sketch-based layout; elevations are illustrative rather than survey measurements.
export const slopeBounds = { left: 4.7, right: 14.2, back: -8.5, front: 8.5 };
export function plantingHeight(x, z) {
  const across = Math.max(
    0,
    Math.min(
      1,
      (x - slopeBounds.left) / (slopeBounds.right - slopeBounds.left),
    ),
  );
  const forward = Math.max(
    0,
    Math.min(
      1,
      (z - slopeBounds.back) / (slopeBounds.front - slopeBounds.back),
    ),
  );
  return -0.07 - across * (1.8 + 0.25 * forward);
}
export const gardenTrees = [
  {
    name: "Mango",
    x: 1.2,
    z: -3.1,
    y: 0,
    size: 1.05,
    potted: true,
    kind: 0,
    level: "Raised pavement · pot",
  },
  {
    name: "Lemon",
    x: 2.8,
    z: -3.1,
    y: 0,
    size: 0.9,
    potted: true,
    kind: 1,
    level: "Raised pavement · pot",
  },
  {
    name: "Ghaf",
    x: 7.1,
    z: -5.2,
    size: 1.5,
    potted: false,
    kind: 2,
    level: "Upper slope",
  },
  {
    name: "Sidr",
    x: 11.4,
    z: 1.6,
    size: 1.25,
    potted: false,
    kind: 3,
    level: "Lower slope",
  },
].map((tree) => ({
  ...tree,
  y: tree.potted ? tree.y : plantingHeight(tree.x, tree.z),
}));
const onSlope = (x, z) => [x, plantingHeight(x, z) + 0.12, z];
export const groundIrrigationRoutes = [
  [[2, 0.55, -4.97], [4.45, 0.2, -4.5], onSlope(5.4, -4.2), onSlope(6.4, -3.2)],
  [onSlope(6.4, -3.2), onSlope(6.8, -4.4), onSlope(7.1, -5.2)],
  [onSlope(6.4, -3.2), onSlope(8.6, -0.8), onSlope(11.4, 1.6)],
];
