import express from "express";
import { cameras } from "../shared/catalog.js";

export function createVisionRouter(env, { fetchImpl = fetch } = {}) {
  const router = express.Router();
  let origin;
  try {
    const url = new URL(env.AI_BRIDGE_URL);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    )
      origin = url.origin;
  } catch {}
  const configured = origin && env.AI_BRIDGE_TOKEN?.length >= 43;
  router.use((req, res, next) =>
    configured
      ? next()
      : res.status(503).json({ error: "Camera analysis is not configured." }),
  );
  const forward = async (req, res, path, body) => {
    try {
      const upstream = await fetchImpl(origin + path, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${env.AI_BRIDGE_TOKEN}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(body ? 110000 : 25000),
        redirect: "error",
      });
      if (!upstream.ok)
        return res.status(upstream.status === 429 ? 429 : 502).json({
          error:
            upstream.status === 429
              ? "The model is busy. Please try again shortly."
              : "The vision service could not complete this request. Try again.",
        });
      const result = await upstream.json();
      if (path === "/models") {
        if (!Array.isArray(result.models)) throw new Error();
        return res.json({
          models: result.models.slice(0, 40).map((m) => ({
            name: String(m.name).slice(0, 120),
            sizeBytes: m.sizeBytes,
            vision: m.vision === true,
            maxContext: m.maxContext,
          })),
          defaultModel: result.defaultModel,
          contextWindow: result.contextWindow,
        });
      }
      if (
        typeof result.answer !== "string" ||
        !result.context ||
        !Array.isArray(result.capturedAt)
      )
        throw new Error();
      res.json({
        answer: result.answer.slice(0, 8000),
        model: body.model,
        camera: body.camera,
        context: result.context,
        capturedAt: result.capturedAt,
        frameCount: result.frameCount,
        inferenceSeconds: result.inferenceSeconds,
      });
    } catch {
      res.status(502).json({
        error:
          "Camera analysis could not complete. Check the DGX connection and try again.",
      });
    }
  };
  router.get("/models", (req, res) => forward(req, res, "/models"));
  router.post(
    "/analyze",
    express.json({ limit: 14000, strict: true }),
    (req, res) => {
      const { camera, model, question, history = [] } = req.body || {};
      if (
        !cameras.some((c) => c.id === camera) ||
        typeof model !== "string" ||
        !/^[\w.\/:\-]{1,120}$/.test(model) ||
        typeof question !== "string" ||
        !question.trim() ||
        question.length > 1000 ||
        !Array.isArray(history) ||
        history.length > 6 ||
        history.some(
          (m) =>
            !m ||
            !["user", "assistant"].includes(m.role) ||
            typeof m.content !== "string" ||
            m.content.length > 2000,
        )
      )
        return res.status(400).json({
          error:
            "Choose a camera and model, and enter a question up to 1000 characters.",
        });
      return forward(req, res, "/analyze", {
        camera,
        model,
        question: question.trim(),
        history: history.map((m) => ({ role: m.role, content: m.content })),
      });
    },
  );
  router.use((error, req, res, next) =>
    res
      .status(error.type === "entity.too.large" ? 413 : 400)
      .json({ error: "Invalid analysis request." }),
  );
  return router;
}
