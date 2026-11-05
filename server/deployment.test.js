import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const config = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url)),
);

test("Vercel hosts the UI and API together without a separate backend origin", () => {
  assert.equal(config.framework, "vite");
  assert.equal(existsSync(new URL("../api/garden.js", import.meta.url)), true);
  assert.equal(existsSync(new URL("../render.yaml", import.meta.url)), false);
  assert.ok(!JSON.stringify(config).includes("GARDEN_BACKEND_ORIGIN"));
});

test("Vercel routes auth and data to its own function without caching", () => {
  assert.deepEqual(config.rewrites, [
    {
      source: "/auth/:path*",
      destination: "/api/garden?__garden_route=auth/:path*",
    },
    {
      source: "/api/:path*",
      destination: "/api/garden?__garden_route=api/:path*",
    },
  ]);
  for (const source of ["/api/:path*", "/auth/:path*"])
    assert.deepEqual(
      config.headers.find((rule) => rule.source === source).headers,
      [{ key: "Cache-Control", value: "no-store" }],
    );
  assert.equal(config.outputDirectory, "dist");
  assert.equal(config.functions["api/garden.js"].maxDuration, 120);
});
