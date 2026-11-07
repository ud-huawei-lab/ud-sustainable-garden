// Pitch preview only. No soil sensor is installed, so these values must stay
// behind the Sample data switch. They never reach `entities` or the assistant.
// `entity` is the slot for the real WH51 reading once it exists.
const DAY = 86400000;
const STEP = 3 * 3600000;
const trees = [
  {
    id: "mango",
    name: "Mango",
    top: 62,
    fall: 5.5,
    every: 4,
    offset: 1,
    dry: 45,
    wet: 60,
  },
  {
    id: "lime",
    name: "Lime",
    top: 58,
    fall: 6.5,
    every: 3,
    offset: 2,
    dry: 42,
    wet: 56,
  },
  {
    id: "ghaf",
    name: "Ghaf",
    top: 34,
    fall: 2.4,
    every: 6,
    offset: 3,
    dry: 24,
    wet: 33,
  },
  {
    id: "sidr",
    name: "Sidr",
    top: 38,
    fall: 3.1,
    every: 5,
    offset: 4,
    dry: 28,
    wet: 36,
  },
];

export const soilBands = {
  dry: { label: "Dry", color: "#e8792b" },
  good: { label: "Good", color: "#2fa866" },
  wet: { label: "Wet", color: "#2f8fe0" },
};
const bandOf = (tree, value) =>
  value < tree.dry ? "dry" : value > tree.wet ? "wet" : "good";

function moistureAt(tree, day) {
  const since = (day + tree.offset) % tree.every;
  const ripple = Math.sin(day * Math.PI * 2) * 0.5;
  return Number((tree.top - tree.fall * since + ripple).toFixed(1));
}

export function sampleSoil(enabled, now = Date.now()) {
  if (!enabled) return null;
  const end = now - (now % STEP);
  const start = end - 30 * DAY;
  return {
    start,
    end,
    trees: trees.map((tree) => {
      const points = [];
      for (let time = start; time <= end; time += STEP)
        points.push({ time, value: moistureAt(tree, time / DAY) });
      const current = points.at(-1).value;
      const dayAgo = points.at(-9).value;
      return {
        id: tree.id,
        name: tree.name,
        device: "WH51 soil moisture sensor",
        entity: null,
        moisture: current,
        band: bandOf(tree, current),
        change: Number((current - dayAgo).toFixed(1)),
        daysSinceWater: Math.floor(
          (((end / DAY + tree.offset) % tree.every) + tree.every) % tree.every,
        ),
        points,
      };
    }),
  };
}
