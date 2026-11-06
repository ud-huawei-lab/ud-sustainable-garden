const numeric = (value) =>
  value == null ||
  String(value).trim() === "" ||
  !Number.isFinite(Number(value))
    ? null
    : Number(value);

// Normalize the reported station unit before applying visual wind strength.
export function sceneWind(speedEntity, directionEntity) {
  const speed = numeric(speedEntity?.state);
  const factor = { "km/h": 1, "m/s": 3.6, mph: 1.609344, kn: 1.852 }[
    speedEntity?.attributes?.unit_of_measurement || "km/h"
  ];
  const direction = numeric(directionEntity?.state);
  return {
    speed:
      speed == null || factor == null
        ? 0
        : Math.max(0, Math.min(80, speed * factor)),
    direction: direction == null ? null : ((direction % 360) + 360) % 360,
  };
}

// A visual day cycle, not a surveyed solar/shadow study. Live mode uses HA angles.
export function dayCycleSun(hour) {
  const phase = ((((hour % 24) + 24) % 24) - 6) / 12;
  return {
    elevation: Math.sin(phase * Math.PI) * 65,
    azimuth: 90 + phase * 180,
  };
}
