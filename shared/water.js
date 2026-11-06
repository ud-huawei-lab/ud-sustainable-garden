// Calculated water-loop estimates: pure functions, used by the server and the page.
// Formulas follow FAO Irrigation and Drainage Paper 56 (Allen et al., 1998).
// Every function returns null, never zero, when an input is missing.

const known = (...values) => values.every(Number.isFinite);
const validAir = (temperature, humidity) =>
  known(temperature, humidity) &&
  temperature > -273.15 &&
  humidity >= 0 &&
  humidity <= 100;

// Site values behind the estimates. Only the latitude is measured (HA config).
// The station's mounting height is unknown and HA's elevation is unset, so the
// other two are assumptions, shown on the page. Update them after a site visit.
export const WATER_SITE = {
  latitude: 25.108,
  elevation: 30,
  windHeight: 3,
};

// kPa at temperature °C (FAO-56 Eq. 11).
export function saturationVapourPressure(temperature) {
  if (!known(temperature) || temperature <= -237.3) return null;
  return 0.6108 * Math.exp((17.27 * temperature) / (temperature + 237.3));
}

// kPa from daily extremes of temperature and relative humidity (FAO-56 Eq. 17).
export function actualVapourPressure(tMin, tMax, rhMax, rhMin) {
  if (!validAir(tMin, rhMax) || !validAir(tMax, rhMin)) return null;
  return (
    (saturationVapourPressure(tMin) * (rhMax / 100) +
      saturationVapourPressure(tMax) * (rhMin / 100)) /
    2
  );
}

// Grams of water vapour per cubic metre of air, from the ideal gas relation.
export function absoluteHumidity(temperature, humidity) {
  if (!validAir(temperature, humidity)) return null;
  const vapour = saturationVapourPressure(temperature) * (humidity / 100);
  return (2166.79 * vapour) / (temperature + 273.15);
}

// kPa between saturated air and the air now, the drying pull on leaves.
export function vapourPressureDeficit(temperature, humidity) {
  if (!validAir(temperature, humidity)) return null;
  return saturationVapourPressure(temperature) * (1 - humidity / 100);
}

export const kmhToMs = (speed) => (known(speed) ? speed / 3.6 : null);

// m/s at 2 m from m/s measured at a height in metres (FAO-56 Eq. 47).
export function windAt2m(speed, height) {
  if (!known(speed, height) || height <= 0.08) return null;
  return (speed * 4.87) / Math.log(67.8 * height - 5.42);
}

// MJ/m²/day at the top of the atmosphere (FAO-56 Eq. 21 to 25).
export function extraterrestrialRadiation(latitude, dayOfYear) {
  if (!known(latitude, dayOfYear)) return null;
  const phi = (latitude * Math.PI) / 180;
  const season = (2 * Math.PI * dayOfYear) / 365;
  const distance = 1 + 0.033 * Math.cos(season);
  const declination = 0.409 * Math.sin(season - 1.39);
  const sunset = Math.acos(
    Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(declination))),
  );
  return (
    ((24 * 60) / Math.PI) *
    0.082 *
    distance *
    (sunset * Math.sin(phi) * Math.sin(declination) +
      Math.cos(phi) * Math.cos(declination) * Math.sin(sunset))
  );
}

// Grass-reference evapotranspiration in mm/day (FAO-56 Eq. 6, daily step, G = 0).
// solar is MJ/m²/day and wind2m is m/s at 2 m. This is a reference for short
// grass, not the measured water use of these trees.
export function referenceEvapotranspiration({
  tMax,
  tMin,
  rhMax,
  rhMin,
  wind2m,
  solar,
  latitude,
  elevation,
  dayOfYear,
}) {
  if (
    !known(tMax, tMin, wind2m, solar, latitude, elevation, dayOfYear) ||
    !validAir(tMin, rhMax) ||
    !validAir(tMax, rhMin) ||
    wind2m < 0 ||
    solar < 0
  )
    return null;
  const tMean = (tMax + tMin) / 2;
  const slope = (4098 * saturationVapourPressure(tMean)) / (tMean + 237.3) ** 2;
  const pressure = 101.3 * ((293 - 0.0065 * elevation) / 293) ** 5.26;
  const psychrometric = 0.000665 * pressure;
  const saturated =
    (saturationVapourPressure(tMax) + saturationVapourPressure(tMin)) / 2;
  const actual = actualVapourPressure(tMin, tMax, rhMax, rhMin);
  const top = extraterrestrialRadiation(latitude, dayOfYear);
  const clearSky = (0.75 + 2e-5 * elevation) * top;
  const netShort = 0.77 * solar;
  const cloudiness = Math.min(solar / clearSky, 1);
  const netLong =
    4.903e-9 *
    (((tMax + 273.16) ** 4 + (tMin + 273.16) ** 4) / 2) *
    (0.34 - 0.14 * Math.sqrt(actual)) *
    (1.35 * cloudiness - 0.35);
  const net = netShort - netLong;
  const result =
    (0.408 * slope * net +
      psychrometric * (900 / (tMean + 273)) * wind2m * (saturated - actual)) /
    (slope + psychrometric * (1 + 0.34 * wind2m));
  return Math.max(0, result);
}
