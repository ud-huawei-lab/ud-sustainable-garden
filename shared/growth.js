// Plant measurements arrive in pixels. The pot in the same frame sets the scale,
// so corrected pot sizes apply to every saved night.
export const growthPlants = [
  { id: "left", name: "Mango", potSetting: "POT_LEFT_WIDTH_CM" },
  { id: "right", name: "Lime", potSetting: "POT_RIGHT_WIDTH_CM" },
];

const positive = (value) => {
  const number = Number(value);
  return value !== "" && value != null && Number.isFinite(number) && number > 0
    ? number
    : null;
};

export const potWidths = (env) =>
  Object.fromEntries(
    growthPlants.map(({ id, potSetting }) => [id, positive(env[potSetting])]),
  );

export function cmPerPixel(potPx, potCm) {
  const pixels = positive(potPx);
  const width = positive(potCm);
  return pixels && width ? width / pixels : null;
}

const round = (value, decimals = 1) =>
  value == null ? null : Number(value.toFixed(decimals));

export function plantSizes(reading, potCm) {
  const scale = cmPerPixel(reading?.potPx, potCm);
  if (!scale)
    return {
      heightCm: null,
      widthCm: null,
      canopyCm2: null,
      coverage: reading?.coverage ?? null,
    };
  return {
    heightCm: round(reading.heightPx * scale),
    widthCm: round(reading.widthPx * scale),
    canopyCm2: round(reading.areaPx * scale * scale, 0),
    coverage: reading.coverage ?? null,
  };
}

export function growthReport(latest, history, env) {
  const widths = potWidths(env);
  return {
    date: latest.date,
    capturedAt: latest.capturedAt,
    frame: latest.frame,
    potWidths: widths,
    plants: growthPlants.map(({ id, name }) => {
      const reading = latest.plants?.[id];
      return {
        id,
        name,
        ...plantSizes(reading, widths[id]),
        box: reading?.box ?? null,
        outline: reading?.outline ?? [],
      };
    }),
    nights: history.map((night) => ({
      date: night.date,
      capturedAt: night.capturedAt,
      status: night.status,
      plants: Object.fromEntries(
        growthPlants.map(({ id }) => [
          id,
          night.plants?.[id]
            ? plantSizes(night.plants[id], widths[id])
            : null,
        ]),
      ),
    })),
  };
}
