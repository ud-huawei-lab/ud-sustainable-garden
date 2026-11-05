import test from "node:test";
import assert from "node:assert/strict";
import { vercelConfig } from "../scripts/deployment-config.mjs";

test("deployment refuses a missing backend instead of shipping another static-only dashboard", () => {
  for (const origin of [
    undefined,
    "",
    "http://backend.example",
    "https://backend.example/path",
    "https://backend.example/",
    "https://user:password@backend.example",
    "https://backend.example?token=secret",
  ])
    assert.throws(() => vercelConfig(origin));
});

test("Vercel routes authentication and every API path to the configured backend without caching", () => {
  const config = vercelConfig("https://garden-backend.example");
  assert.deepEqual(config.rewrites, [
    {
      source: "/api/:path*",
      destination: "https://garden-backend.example/api/:path*",
    },
    {
      source: "/auth/:path*",
      destination: "https://garden-backend.example/auth/:path*",
    },
  ]);
  for (const source of ["/api/:path*", "/auth/:path*"])
    assert.deepEqual(
      config.headers.find((rule) => rule.source === source).headers,
      [{ key: "Cache-Control", value: "no-store" }],
    );
  assert.equal(config.outputDirectory, "dist");
});
