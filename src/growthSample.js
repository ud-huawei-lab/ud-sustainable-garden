// Demo history for the pitch. It stays in the browser and never reaches the
// assistant or the stored measurements. Set this to false to show real nights.
export const SHOW_SAMPLE_GROWTH = true;

const NIGHTS = 30;
const DAY = 86400000;
const growth = {
  left: { heightCm: 0.14, widthCm: 0.1, coverage: 0.08 },
  right: { heightCm: 0.09, widthCm: 0.07, coverage: 0.05 },
};

const wobble = (night, seed) =>
  Math.sin(night * 1.7 + seed) * 0.004 + Math.sin(night * 0.6 + seed) * 0.003;

// Works back from the real latest values, so the last point is real.
export function sampleNights(data) {
  const end = Date.parse(`${data.date}T00:00:00+04:00`);
  return Array.from({ length: NIGHTS }, (_, index) => {
    const left = NIGHTS - 1 - index;
    const share = left / (NIGHTS - 1);
    return {
      date: new Date(end - left * DAY + 4 * 3600000).toISOString().slice(0, 10),
      status: "ok",
      plants: Object.fromEntries(
        data.plants.map((plant, seed) => [
          plant.id,
          Object.fromEntries(
            ["heightCm", "widthCm", "coverage"].map((key) => {
              const noise = left ? wobble(left, seed) : 0;
              const value = plant[key] * (1 - growth[plant.id][key] * share + noise);
              return [key, Number(value.toFixed(key === "coverage" ? 4 : 1))];
            }),
          ),
        ]),
      ),
    };
  });
}
