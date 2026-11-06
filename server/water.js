import { normalizeHistory } from "./data.js";
import {
  WATER_SITE,
  absoluteHumidity,
  kmhToMs,
  referenceEvapotranspiration,
  vapourPressureDeficit,
  windAt2m,
} from "../shared/water.js";

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const DUBAI_OFFSET = 4 * HOUR;

// HA records changes only, so a value lasts until the next row. The outdoor
// array also drops out for hours without HA marking it unavailable (seen 29 to
// 31 Oct 2026, up to 254 minutes), which would freeze the last value. These
// limits turn those periods back into gaps. Limits come from 10 days of history.
const SILENCE_LIMIT = 30 * MINUTE;
const HOLD_LIMIT = 3 * HOUR;
const REQUIRED_COVERAGE = 0.9;

export const WATER_ENTITIES = {
  temperature: "sensor.ambient_weather_temperature",
  humidity: "sensor.ambient_weather_humidity",
  wind: "sensor.ambient_weather_wind_speed",
  irradiance: "sensor.ambient_weather_irradiance",
  dewPoint: "sensor.ambient_weather_dew_point",
};
const windows = { "7d": 7, "30d": 30 };
const buckets = { "7d": 30 * MINUTE, "30d": HOUR };
export const waterRanges = Object.keys(windows);
const round = (value, digits = 3) =>
  value == null ? null : Number(value.toFixed(digits));
const dubaiMidnight = (time) =>
  Math.floor((time + DUBAI_OFFSET) / DAY) * DAY - DUBAI_OFFSET;

export function waterWindow(range, now = Date.now()) {
  if (!Object.hasOwn(windows, range))
    throw new Error("Choose a supported water range.");
  return { start: dubaiMidnight(now) - windows[range] * DAY, end: now };
}

// Spans over the range where no outdoor sensor reported at all.
export function outdoorSilences(series, start, end, limit = SILENCE_LIMIT) {
  const times = series
    .flat()
    .map((point) => point.time)
    .filter((time) => time >= start && time <= end)
    .sort((a, b) => a - b);
  const silences = [];
  let previous = start;
  for (const time of [...times, end]) {
    if (time - previous > limit) silences.push({ from: previous, to: time });
    previous = time;
  }
  return silences;
}

// Spans where a reading is known, ending at the next row, a missing state, the
// hold limit, or a silence. holdZero keeps overnight zero irradiance, which HA
// records once at dusk, as a real reading.
export function heldSegments(
  points,
  start,
  end,
  { silences = [], holdLimit = Infinity, holdZero = false } = {},
) {
  const segments = [];
  points.forEach((point, index) => {
    if (point.value == null) return;
    const limit = holdZero && point.value === 0 ? Infinity : holdLimit;
    let from = Math.max(point.time, start);
    const to = Math.min(
      points[index + 1]?.time ?? end,
      end,
      point.time + limit,
    );
    if (from >= to) return;
    for (const silence of silences) {
      if (silence.to <= from || silence.from >= to) continue;
      if (silence.from > from)
        segments.push({ from, to: silence.from, value: point.value });
      from = Math.max(from, silence.to);
    }
    if (from < to) segments.push({ from, to, value: point.value });
  });
  return segments;
}

// Time-weighted statistics over [start, end], with the share of it that is known.
export function segmentStats(segments, start, end) {
  let known = 0;
  let total = 0;
  let min = null;
  let max = null;
  for (const segment of segments) {
    const span = Math.min(segment.to, end) - Math.max(segment.from, start);
    if (span <= 0) continue;
    known += span;
    total += segment.value * span;
    if (min == null || segment.value < min) min = segment.value;
    if (max == null || segment.value > max) max = segment.value;
  }
  return {
    min,
    max,
    mean: known ? total / known : null,
    coverage: known / (end - start),
  };
}

// Applies calculate only where both inputs are known.
function combine(first, second, calculate) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < first.length && j < second.length) {
    const from = Math.max(first[i].from, second[j].from);
    const to = Math.min(first[i].to, second[j].to);
    if (from < to) {
      const value = calculate(first[i].value, second[j].value);
      if (value != null) result.push({ from, to, value });
    }
    if (first[i].to <= second[j].to) i += 1;
    else j += 1;
  }
  return result;
}

// One point per bucket for the chart. A mostly unknown bucket stays a gap.
function bucketed(segments, start, end, size) {
  const points = [];
  let first = 0;
  for (let from = start; from < end; from += size) {
    const to = Math.min(from + size, end);
    while (first < segments.length && segments[first].to <= from) first += 1;
    let last = first;
    while (last < segments.length && segments[last].from < to) last += 1;
    const stats = segmentStats(segments.slice(first, last), from, to);
    points.push({
      time: from + (to - from) / 2,
      value: stats.coverage >= 0.5 ? round(stats.mean) : null,
    });
  }
  return points;
}

function statsOf(stats) {
  return {
    min: round(stats.min),
    max: round(stats.max),
    mean: round(stats.mean),
  };
}

function summariseDay(dayStart, end, inputs, vpd, site) {
  const dayEnd = dayStart + DAY;
  const partial = dayEnd > end;
  const lastKnown = Math.min(dayEnd, end);
  const date = new Date(dayStart + DUBAI_OFFSET).toISOString().slice(0, 10);
  const of = (segments) => segmentStats(segments, dayStart, lastKnown);
  const temperature = of(inputs.temperature);
  const humidity = of(inputs.humidity);
  const wind = of(inputs.wind);
  const irradiance = of(inputs.irradiance);
  const vapour = of(vpd);
  const missing = Object.entries({ temperature, humidity, wind, irradiance })
    .filter(([, stats]) => stats.coverage < REQUIRED_COVERAGE)
    .map(([name]) => name);
  const complete = !partial && !missing.length;
  const solar = complete ? irradiance.mean * 0.0864 : null;
  const wind2m = complete
    ? windAt2m(kmhToMs(wind.mean), site.windHeight)
    : null;
  const et0 = complete
    ? referenceEvapotranspiration({
        tMax: temperature.max,
        tMin: temperature.min,
        rhMax: humidity.max,
        rhMin: humidity.min,
        wind2m,
        solar,
        latitude: site.latitude,
        elevation: site.elevation,
        dayOfYear: Math.round(
          (Date.parse(date) - Date.UTC(Number(date.slice(0, 4)), 0, 0)) / DAY,
        ),
      })
    : null;
  return {
    date,
    time: dayStart + DAY / 2,
    partial,
    et0: round(et0),
    // Today's peak is so far. A past day with an outage may have lost its peak.
    vpdPeak:
      partial || vapour.coverage >= REQUIRED_COVERAGE
        ? round(vapour.max)
        : null,
    tMin: complete ? round(temperature.min) : null,
    tMax: complete ? round(temperature.max) : null,
    rhMin: complete ? round(humidity.min) : null,
    rhMax: complete ? round(humidity.max) : null,
    wind2m: round(wind2m),
    solar: round(solar),
    missing,
  };
}

// rows holds raw HA recorder rows for each key of WATER_ENTITIES.
export function summariseWater(
  rows,
  range,
  now = Date.now(),
  site = WATER_SITE,
) {
  const { start: requested, end } = waterWindow(range, now);
  const points = Object.fromEntries(
    Object.keys(WATER_ENTITIES).map((key) => [
      key,
      normalizeHistory(rows[key] || []),
    ]),
  );
  const earliest = Math.min(
    ...Object.values(points).flatMap((series) =>
      series.length ? [series[0].time] : [],
    ),
  );
  const start =
    Number.isFinite(earliest) && earliest > requested
      ? dubaiMidnight(earliest)
      : requested;
  const silences = outdoorSilences(
    [points.temperature, points.humidity, points.wind, points.irradiance],
    start,
    end,
  );
  const held = (series, options) =>
    heldSegments(series, start, end, {
      silences,
      holdLimit: HOLD_LIMIT,
      ...options,
    });
  const inputs = {
    temperature: held(points.temperature),
    humidity: held(points.humidity),
    wind: held(points.wind),
    irradiance: held(points.irradiance, { holdZero: true }),
  };
  const dewPoint = held(points.dewPoint);
  const moisture = combine(
    inputs.temperature,
    inputs.humidity,
    absoluteHumidity,
  );
  const vpd = combine(
    inputs.temperature,
    inputs.humidity,
    vapourPressureDeficit,
  );
  const size = buckets[range];
  const series = (name, unit, segments) => ({
    name,
    unit,
    points: bucketed(segments, start, end, size),
    stats: statsOf(segmentStats(segments, start, end)),
  });
  const days = [];
  for (let day = start; day < end; day += DAY)
    days.push(summariseDay(day, end, inputs, vpd, site));
  const complete = days.filter((day) => day.et0 != null);
  return {
    range,
    source: "Home Assistant",
    start,
    end,
    limitedBy: start > requested ? "retention" : null,
    assumptions: { ...site },
    absoluteHumidity: series("Absolute humidity", "g/m³", moisture),
    dewPoint: series("Dew point", "°C", dewPoint),
    vpd: series("Vapour pressure deficit", "kPa", vpd),
    et0: {
      name: "Reference evapotranspiration",
      unit: "mm/day",
      start,
      end: dubaiMidnight(end),
      points: days
        .filter((day) => !day.partial)
        .map((day) => ({ time: day.time, value: day.et0 })),
      stats: {
        days: complete.length,
        min: complete.length
          ? Math.min(...complete.map((day) => day.et0))
          : null,
        max: complete.length
          ? Math.max(...complete.map((day) => day.et0))
          : null,
        mean: complete.length
          ? round(
              complete.reduce((sum, day) => sum + day.et0, 0) / complete.length,
            )
          : null,
      },
    },
    days,
  };
}

export async function waterInsights(ha, range, now = Date.now()) {
  const { start, end } = waterWindow(range, now);
  const query = new URLSearchParams({
    filter_entity_id: Object.values(WATER_ENTITIES).join(","),
    end_time: new Date(end).toISOString(),
    no_attributes: "1",
    minimal_response: "1",
    significant_changes_only: "0",
  });
  const payload = await ha.get(
    `/api/history/period/${new Date(start).toISOString()}?${query}`,
  );
  const rows = Object.fromEntries(
    Object.entries(WATER_ENTITIES).map(([key, entity]) => [
      key,
      payload.find((series) => series[0]?.entity_id === entity) || [],
    ]),
  );
  return summariseWater(rows, range, now);
}
