import test from "node:test";
import assert from "node:assert/strict";
import {
  sceneWind,
  dayCycleSun,
  sceneBrightness,
} from "../shared/scene-weather.js";
import { publicEntity } from "./realtime.js";

test("sun angles reach the scene without exposing private HA attributes", () => {
  const sun = publicEntity({
    state: "above_horizon",
    attributes: { elevation: 40, azimuth: 120, access_token: "private" },
  });
  assert.deepEqual(sun.attributes, { elevation: 40, azimuth: 120 });
});

test("scene wind normalizes live units, bounds strength and stops on missing readings", () => {
  const entity = (state, unit = "km/h") => ({
    state,
    attributes: { unit_of_measurement: unit },
  });
  assert.equal(sceneWind(entity(10, "m/s"), entity(370)).speed, 36);
  assert.equal(sceneWind(entity(10), entity(370)).direction, 10);
  assert.equal(sceneWind(entity(1000), entity(0)).speed, 80);
  for (const state of [null, "", "unknown", "unavailable", -3])
    assert.equal(sceneWind(entity(state)).speed, 0);
  assert.equal(sceneWind(entity(10, "unsupported")).speed, 0);
  assert.equal(sceneWind(entity(0)).direction, null);
});

test("illustrative day cycle has daylight and night and wraps after a day", () => {
  assert.ok(dayCycleSun(12).elevation > 60);
  assert.ok(dayCycleSun(0).elevation < 0);
  assert.deepEqual(dayCycleSun(36), dayCycleSun(12));
  assert.ok(Math.abs(dayCycleSun(6).elevation) < 0.001);
});

test("scene brightness follows illuminance, preserves zero, and falls back only when unavailable", () => {
  const reading = (state, unit = "lx") => ({
    state,
    attributes: { unit_of_measurement: unit },
  });
  assert.equal(sceneBrightness(reading(0), reading(800)), 0);
  assert.ok(sceneBrightness(reading(50000)) > sceneBrightness(reading(5000)));
  assert.equal(sceneBrightness(reading(1000000)), 1);
  assert.equal(
    sceneBrightness(reading(50, "klx")),
    sceneBrightness(reading(50000)),
  );
  assert.equal(sceneBrightness(reading("unavailable"), reading(250)), 0.5);
  assert.equal(sceneBrightness(reading(-1), reading("unknown")), null);
  assert.equal(sceneBrightness(reading("")), null);
});
