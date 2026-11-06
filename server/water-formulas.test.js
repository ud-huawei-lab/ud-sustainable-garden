import test from "node:test";
import assert from "node:assert/strict";
import {
  saturationVapourPressure,
  actualVapourPressure,
  absoluteHumidity,
  vapourPressureDeficit,
  kmhToMs,
  windAt2m,
  extraterrestrialRadiation,
  referenceEvapotranspiration,
} from "../shared/water.js";

const near = (actual, expected, tolerance, label) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} is not within ${tolerance} of ${expected}`,
  );

test("saturation vapour pressure matches the FAO-56 table", () => {
  near(saturationVapourPressure(25), 3.168, 0.001, "25 °C");
  near(saturationVapourPressure(15), 1.705, 0.001, "15 °C");
});
test("actual vapour pressure matches FAO-56 Example 5", () => {
  near(actualVapourPressure(18, 25, 82, 54), 1.7, 0.005, "ea");
});
test("absolute humidity follows the ideal gas relation", () => {
  near(absoluteHumidity(30, 100), 30.3, 0.1, "saturated at 30 °C");
  near(absoluteHumidity(20, 50), 8.6, 0.1, "half saturated at 20 °C");
  assert.equal(absoluteHumidity(30, 0), 0);
});
test("vapour pressure deficit is zero at saturation and keeps real zeros", () => {
  assert.equal(vapourPressureDeficit(30, 100), 0);
  near(vapourPressureDeficit(30, 40), 2.546, 0.001, "30 °C, 40 %");
});
test("calculated values stay missing when an input is missing or impossible", () => {
  for (const [t, rh] of [
    [null, 50],
    [30, null],
    [undefined, 50],
    [Number.NaN, 50],
    [30, 140],
    [30, -1],
    [-300, 50],
  ]) {
    assert.equal(absoluteHumidity(t, rh), null);
    assert.equal(vapourPressureDeficit(t, rh), null);
  }
  assert.equal(windAt2m(null, 3), null);
  assert.equal(kmhToMs(null), null);
});
test("wind converts from km/h to m/s and adjusts to 2 m (FAO-56 Eq. 47)", () => {
  near(kmhToMs(36), 10, 1e-9, "km/h");
  near(windAt2m(3.2, 10), 2.4, 0.01, "Example 14, 10 m");
  near(windAt2m(2.78, 10), 2.078, 0.01, "Example 18, 10 m");
  near(windAt2m(5, 2), 5, 0.01, "already at 2 m");
  assert.equal(windAt2m(0, 3), 0);
});
test("extraterrestrial radiation matches FAO-56 Examples 8 and 18", () => {
  near(extraterrestrialRadiation(-20, 246), 32.2, 0.05, "Example 8");
  near(extraterrestrialRadiation(50.8, 187), 41.09, 0.05, "Example 18");
});
test("daily ET0 reproduces FAO-56 Example 18 (Brussels, 6 July)", () => {
  const et0 = referenceEvapotranspiration({
    tMax: 21.5,
    tMin: 12.3,
    rhMax: 84,
    rhMin: 63,
    wind2m: 2.078,
    solar: 22.07,
    latitude: 50.8,
    elevation: 100,
    dayOfYear: 187,
  });
  near(et0, 3.88, 0.03, "ET0");
  assert.equal(Number(et0.toFixed(1)), 3.9);
});
test("daily ET0 is missing, never zero, when any input is missing", () => {
  const inputs = {
    tMax: 35,
    tMin: 22,
    rhMax: 70,
    rhMin: 25,
    wind2m: 1.5,
    solar: 18,
    latitude: 25.1,
    elevation: 30,
    dayOfYear: 310,
  };
  assert.ok(referenceEvapotranspiration(inputs) > 0);
  for (const key of Object.keys(inputs))
    assert.equal(
      referenceEvapotranspiration({ ...inputs, [key]: null }),
      null,
      key,
    );
});
test("daily ET0 clips a station reading above clear sky rather than amplifying it", () => {
  const base = {
    tMax: 35,
    tMin: 22,
    rhMax: 70,
    rhMin: 25,
    wind2m: 1.5,
    latitude: 25.1,
    elevation: 30,
    dayOfYear: 310,
  };
  const atClearSky = referenceEvapotranspiration({ ...base, solar: 18.5 });
  const brighter = referenceEvapotranspiration({ ...base, solar: 24 });
  assert.ok(brighter > atClearSky);
  assert.ok(brighter - atClearSky < 1.5);
});
