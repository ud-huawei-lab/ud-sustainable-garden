// Sketch-based layout; elevations are illustrative rather than survey measurements.
export const slopeBounds = {
  left: -10.5,
  right: 4.7,
  back: -17.5,
  front: -8.5,
};
export function plantingHeight(x, z) {
  const downhill = Math.max(
    0,
    Math.min(
      1,
      (slopeBounds.front - z) / (slopeBounds.front - slopeBounds.back),
    ),
  );
  const across = Math.max(
    0,
    Math.min(
      1,
      (x - slopeBounds.left) / (slopeBounds.right - slopeBounds.left),
    ),
  );
  return -0.07 - downhill * (1.8 + 0.25 * across);
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
    x: 0.2,
    z: -10.8,
    size: 1.5,
    potted: false,
    kind: 2,
    level: "Upper slope",
  },
  {
    name: "Sidr",
    x: 2.8,
    z: -15.2,
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
  [[2, 0.55, -6.63], [2, 0.2, -8.2], onSlope(2, -9.1)],
  [onSlope(2, -9.1), onSlope(0.6, -9.7), onSlope(0.2, -10.8)],
  [onSlope(2, -9.1), onSlope(3.5, -12.2), onSlope(2.8, -15.2)],
];
