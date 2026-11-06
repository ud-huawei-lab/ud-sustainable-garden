import express from "express";
import { growthReport } from "../shared/growth.js";

const CACHE_MS = 300000;

function originOf(value) {
  try {
    const url = new URL(value);
    const safe =
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash;
    return safe ? url.origin : null;
  } catch {
    return null;
  }
}

export function createGrowthRouter(env, { fetchImpl = fetch } = {}) {
  const router = express.Router();
  const origin = originOf(env.GROWTH_URL);
  const configured = origin && env.GROWTH_TOKEN?.length >= 43;
  let report = { at: 0, data: null };
  let frame = { at: 0, date: null, bytes: null };

  const upstream = async (path) => {
    const response = await fetchImpl(origin + path, {
      headers: { Authorization: `Bearer ${env.GROWTH_TOKEN}` },
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Measurement store failed.");
    return response;
  };
  const loadReport = async () => {
    if (report.data && Date.now() - report.at < CACHE_MS) return report.data;
    const [latest, history] = await Promise.all([
      upstream("/latest.json").then((r) => r.json()),
      upstream("/history.json").then((r) => r.json()),
    ]);
    if (!latest?.plants || !Array.isArray(history))
      throw new Error("Measurement store failed.");
    report = { at: Date.now(), data: growthReport(latest, history, env) };
    return report.data;
  };

  router.use((req, res, next) =>
    configured
      ? next()
      : res.status(503).json({ error: "Plant measurements are not set up." }),
  );
  router.get("/", async (req, res) => {
    try {
      res.set("Cache-Control", "no-store").json(await loadReport());
    } catch {
      res
        .status(502)
        .json({ error: "Plant measurements could not be loaded." });
    }
  });
  router.get("/frame", async (req, res) => {
    try {
      const { date } = await loadReport();
      if (frame.date !== date) {
        const response = await upstream("/frame.jpg");
        frame = {
          date,
          bytes: Buffer.from(await response.arrayBuffer()),
        };
      }
      res.set("Cache-Control", "no-store").type("image/jpeg").send(frame.bytes);
    } catch {
      res.sendStatus(502);
    }
  });
  return router;
}
