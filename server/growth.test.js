import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import {
  cmPerPixel,
  growthReport,
  slopeReport,
  plantSizes,
  potWidths,
} from "../shared/growth.js";
import { createGrowthRouter } from "./growth.js";
import { sampleNights } from "../src/growthSample.js";

const reading = {
  potPx: 300,
  heightPx: 450,
  widthPx: 150,
  areaPx: 9000,
  coverage: 0.3,
};
const env = {
  GROWTH_URL: "http://127.0.0.1:8771",
  GROWTH_TOKEN: "t".repeat(43),
  POT_LEFT_WIDTH_CM: "60",
  POT_RIGHT_WIDTH_CM: "50",
};

test("the pot in the frame sets the scale", () => {
  assert.equal(cmPerPixel(300, 60), 0.2);
  assert.deepEqual(plantSizes(reading, 60), {
    heightCm: 90,
    widthCm: 30,
    canopyCm2: 360,
    coverage: 0.3,
  });
});

test("a corrected pot width changes every saved night", () => {
  const history = [
    { date: "2026-11-06", status: "ok", plants: { left: reading } },
  ];
  const latest = { date: "2026-11-06", plants: { left: reading } };
  const first = growthReport(latest, history, env);
  const second = growthReport(latest, history, {
    ...env,
    POT_LEFT_WIDTH_CM: "30",
  });
  assert.equal(first.nights[0].plants.left.heightCm, 90);
  assert.equal(second.nights[0].plants.left.heightCm, 45);
});

test("a missing or invalid pot width stays missing", () => {
  for (const value of ["", undefined, "abc", "0", "-5"]) {
    assert.equal(potWidths({ POT_LEFT_WIDTH_CM: value }).left, null);
    const sizes = plantSizes(
      reading,
      potWidths({ POT_LEFT_WIDTH_CM: value }).left,
    );
    assert.equal(sizes.heightCm, null);
    assert.equal(sizes.coverage, 0.3);
  }
});

test("a failed night stays a gap, never a zero", () => {
  const report = growthReport(
    { date: "2026-11-07", plants: { left: reading } },
    [{ date: "2026-11-06", status: "view_moved" }],
    env,
  );
  assert.equal(report.nights[0].status, "view_moved");
  assert.equal(report.nights[0].plants.left, null);
});

async function serve(routerEnv, fetchImpl) {
  const app = express();
  app.use("/api/growth", createGrowthRouter(routerEnv, { fetchImpl }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    base: `http://127.0.0.1:${server.address().port}/api/growth`,
    close: () => server.close(),
  };
}

test("the route reports when measurements are not set up", async () => {
  for (const missing of [
    { GROWTH_URL: "" },
    { GROWTH_TOKEN: "short" },
    { GROWTH_URL: "http://user:pass@127.0.0.1:8771" },
    { GROWTH_URL: "file:///etc/passwd" },
  ]) {
    const site = await serve({ ...env, ...missing }, () => {
      throw new Error("must not call the store");
    });
    assert.equal((await fetch(site.base)).status, 503);
    site.close();
  }
});

test("the route sends the token upstream and hides failures", async () => {
  const seen = [];
  let healthy = true;
  const site = await serve(env, async (url, options) => {
    seen.push([url, options.headers.Authorization]);
    if (!healthy) return new Response("", { status: 500 });
    return Response.json(
      url.endsWith("/latest.json")
        ? { date: "2026-11-06", plants: { left: reading, right: reading } }
        : [],
    );
  });
  const report = await (await fetch(site.base)).json();
  assert.equal(report.plants[0].heightCm, 90);
  assert.equal(report.plants[1].heightCm, 75);
  assert.ok(seen.every(([, auth]) => auth === `Bearer ${env.GROWTH_TOKEN}`));
  assert.ok(!JSON.stringify(report).includes(env.GROWTH_TOKEN));
  site.close();
  healthy = false;
  const broken = await serve(
    env,
    async () => new Response("", { status: 500 }),
  );
  const response = await fetch(broken.base);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: "Plant measurements could not be loaded.",
  });
  broken.close();
});

test("the sample growth ends on the real latest night and leaves it unchanged", () => {
  const report = growthReport(
    { date: "2026-11-06", plants: { left: reading, right: reading } },
    [],
    env,
  );
  const before = JSON.stringify(report);
  const nights = sampleNights(report);
  assert.equal(JSON.stringify(report), before);
  assert.equal(nights.length, 30);
  assert.equal(nights.at(-1).date, "2026-11-06");
  assert.equal(nights.at(-1).plants.left.heightCm, report.plants[0].heightCm);
  assert.ok(nights[0].plants.left.heightCm < report.plants[0].heightCm);
  assert.deepEqual(report.nights, []);
});

test("the first day's height sets each slope tree's scale", () => {
  const day = (height, date) => ({
    date,
    status: "ok",
    plants: {
      left: { heightPx: height, widthPx: 100, areaPx: 2000, coverage: 0.4 },
      right: { heightPx: 150, widthPx: 75, areaPx: 900, coverage: 0.3 },
    },
  });
  const history = [day(200, "2026-11-07"), day(220, "2026-11-08")];
  const report = slopeReport(history[1], history, {
    GHAF_HEIGHT_CM: "100",
    SIDR_HEIGHT_CM: "60",
  });
  assert.equal(report.plants[0].name, "Ghaf");
  assert.equal(report.plants[0].heightCm, 110);
  assert.equal(report.plants[0].widthCm, 50);
  assert.equal(report.plants[1].heightCm, 60);
  assert.equal(report.nights[0].plants.left.heightCm, 100);
});

test("a missing reference height stays missing", () => {
  const day = {
    date: "2026-11-07",
    status: "ok",
    plants: {
      left: { heightPx: 200, widthPx: 100, areaPx: 10, coverage: 0.4 },
    },
  };
  const report = slopeReport(day, [day], {});
  assert.equal(report.plants[0].heightCm, null);
  assert.equal(report.plants[0].coverage, 0.4);
  assert.equal(report.plants[1].heightCm, null);
});

test("the slope route reads its own files", async () => {
  const seen = [];
  const site = await serve(env, async (url) => {
    seen.push(url);
    return Response.json(
      url.endsWith("/latest.json") ? { date: "2026-11-07", plants: {} } : [],
    );
  });
  assert.equal((await fetch(`${site.base}/slope`)).status, 200);
  assert.ok(seen.every((url) => url.includes("/slope/")));
  site.close();
});
