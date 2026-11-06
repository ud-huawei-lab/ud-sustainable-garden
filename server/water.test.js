import test from "node:test";
import assert from "node:assert/strict";
import {
  WATER_ENTITIES,
  outdoorSilences,
  heldSegments,
  segmentStats,
  summariseWater,
  waterWindow,
} from "./water.js";
import { allowedEntities } from "../shared/catalog.js";

const HOUR = 3600000;
const DAY = 24 * HOUR;
// 00:00 Dubai time on 3 Nov 2026 is 20:00 UTC on 2 Nov.
const MIDNIGHT = Date.UTC(2026, 10, 2, 20);
const iso = (time) => new Date(time).toISOString();

// A plausible Dubai November day, sampled every ten minutes, with a real value
// at every step, so that each input series has rows like the recorder returns.
function day(start, { skip = () => false } = {}) {
  const rows = { temperature: [], humidity: [], wind: [], irradiance: [] };
  for (let time = start; time < start + DAY; time += 10 * 60000) {
    if (skip(time)) continue;
    const hour = (time - start) / HOUR;
    const warmth = Math.sin(((hour - 8) / 24) * 2 * Math.PI);
    const daylight = Math.max(0, Math.sin(((hour - 6.5) / 11) * Math.PI));
    rows.temperature.push({
      state: String(28 + 7 * warmth),
      last_changed: iso(time),
    });
    rows.humidity.push({
      state: String(45 - 20 * warmth),
      last_changed: iso(time),
    });
    rows.wind.push({ state: String(6 + 3 * warmth), last_changed: iso(time) });
    rows.irradiance.push({
      state: String(700 * daylight),
      last_changed: iso(time),
    });
  }
  return rows;
}
const payload = (...days) => {
  const merged = { temperature: [], humidity: [], wind: [], irradiance: [] };
  for (const part of days)
    for (const key of Object.keys(merged)) merged[key].push(...part[key]);
  return merged;
};
const inputs = (rows, dewPoint = []) => ({
  temperature: rows.temperature,
  humidity: rows.humidity,
  wind: rows.wind,
  irradiance: rows.irradiance,
  dewPoint,
});

test("water insights read only allowlisted entities", () => {
  for (const entity of Object.values(WATER_ENTITIES))
    assert.ok(allowedEntities.has(entity), entity);
});
test("the window starts at Dubai midnight and stays inside the 31-day limit", () => {
  const now = MIDNIGHT + 13 * HOUR;
  const week = waterWindow("7d", now);
  assert.equal(week.start, MIDNIGHT - 7 * DAY);
  assert.equal(week.end, now);
  const month = waterWindow("30d", now);
  assert.equal(month.start, MIDNIGHT - 30 * DAY);
  assert.ok(month.end - month.start <= 31 * DAY);
  assert.throws(() => waterWindow("24h", now));
  assert.throws(() => waterWindow("constructor", now));
});
test("a silence across all outdoor sensors is found, even though HA shows no unavailable state", () => {
  const points = [
    [
      { time: 0, value: 1 },
      { time: 10 * 60000, value: 1 },
      { time: 4 * HOUR, value: 1 },
    ],
    [
      { time: 5 * 60000, value: 2 },
      { time: 4 * HOUR, value: 2 },
    ],
  ];
  assert.deepEqual(outdoorSilences(points, 0, 5 * HOUR), [
    { from: 10 * 60000, to: 4 * HOUR },
    { from: 4 * HOUR, to: 5 * HOUR },
  ]);
});
test("a constant value holds while other sensors still report, but not through a silence", () => {
  const irradiance = [{ time: 0, value: 0 }];
  const segments = heldSegments(irradiance, 0, 12 * HOUR, {
    silences: [{ from: 2 * HOUR, to: 3 * HOUR }],
  });
  assert.deepEqual(segments, [
    { from: 0, to: 2 * HOUR, value: 0 },
    { from: 3 * HOUR, to: 12 * HOUR, value: 0 },
  ]);
});
test("a held value stops at the hold limit and at an unavailable state", () => {
  assert.deepEqual(
    heldSegments([{ time: 0, value: 5 }], 0, 12 * HOUR, {
      holdLimit: 3 * HOUR,
    }),
    [{ from: 0, to: 3 * HOUR, value: 5 }],
  );
  assert.deepEqual(
    heldSegments(
      [
        { time: 0, value: 5 },
        { time: HOUR, value: null },
        { time: 2 * HOUR, value: 7 },
      ],
      0,
      3 * HOUR,
    ),
    [
      { from: 0, to: HOUR, value: 5 },
      { from: 2 * HOUR, to: 3 * HOUR, value: 7 },
    ],
  );
});
test("time weighting counts how long a value lasted and keeps zero", () => {
  const stats = segmentStats(
    [
      { from: 0, to: 3 * HOUR, value: 0 },
      { from: 3 * HOUR, to: 4 * HOUR, value: 8 },
    ],
    0,
    8 * HOUR,
  );
  assert.deepEqual(stats, { min: 0, max: 8, mean: 2, coverage: 0.5 });
  assert.deepEqual(segmentStats([], 0, HOUR), {
    min: null,
    max: null,
    mean: null,
    coverage: 0,
  });
});
test("a complete day gets an ET0 estimate in the expected range; today does not", () => {
  const now = MIDNIGHT + 13 * HOUR;
  const rows = payload(day(MIDNIGHT - DAY), day(MIDNIGHT));
  const result = summariseWater(inputs(rows), "7d", now);
  const yesterday = result.days.find((d) => d.date === "2026-11-02");
  assert.ok(yesterday.et0 > 3 && yesterday.et0 < 7, String(yesterday.et0));
  assert.deepEqual(yesterday.missing, []);
  const today = result.days.find((d) => d.date === "2026-11-03");
  assert.equal(today.partial, true);
  assert.equal(today.et0, null);
  assert.ok(today.vpdPeak > 0);
});
test("a day with a multi-hour outage stays missing instead of being estimated", () => {
  const now = MIDNIGHT + 13 * HOUR;
  const start = MIDNIGHT - DAY;
  const rows = day(start, {
    skip: (time) => time >= start + 10 * HOUR && time < start + 14 * HOUR,
  });
  const result = summariseWater(inputs(rows), "7d", now);
  const row = result.days.find((d) => d.date === "2026-11-02");
  assert.equal(row.et0, null);
  assert.ok(row.missing.includes("temperature"));
  const point = result.et0.points.find((p) => p.time === start + 12 * HOUR);
  assert.equal(point.value, null);
  const during = result.vpd.points.filter(
    (p) => p.time >= start + 10.5 * HOUR && p.time < start + 13.5 * HOUR,
  );
  assert.ok(during.length && during.every((p) => p.value === null));
});
test("night-long zero irradiance is a reading, not a gap", () => {
  const now = MIDNIGHT + 13 * HOUR;
  const start = MIDNIGHT - DAY;
  const rows = day(start);
  rows.irradiance = rows.irradiance.filter((row, index, all) => {
    const zero = Number(row.state) === 0;
    return !(zero && Number(all[index - 1]?.state) === 0);
  });
  const result = summariseWater(inputs(rows), "7d", now);
  const row = result.days.find((d) => d.date === "2026-11-02");
  assert.deepEqual(row.missing, []);
  assert.ok(row.solar > 10);
});
test("no recorder data means no values, and the chart window follows real data", () => {
  const now = MIDNIGHT + 13 * HOUR;
  const empty = summariseWater(inputs(payload()), "30d", now);
  assert.equal(empty.absoluteHumidity.stats.mean, null);
  assert.ok(empty.days.every((d) => d.et0 === null));
  assert.ok(empty.absoluteHumidity.points.every((p) => p.value === null));
  const short = summariseWater(inputs(day(MIDNIGHT - DAY)), "30d", now);
  assert.equal(short.start, MIDNIGHT - DAY);
  assert.equal(short.limitedBy, "retention");
  assert.equal(short.days[0].date, "2026-11-02");
});
test("the result names every assumption behind the estimate", () => {
  const now = MIDNIGHT + 13 * HOUR;
  const { assumptions } = summariseWater(
    inputs(day(MIDNIGHT - DAY)),
    "7d",
    now,
  );
  assert.equal(assumptions.windHeight, 3);
  assert.equal(assumptions.elevation, 30);
  assert.ok(Math.abs(assumptions.latitude - 25.108) < 0.01);
});
