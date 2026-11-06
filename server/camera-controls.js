import express from "express";

const controls = { trees: "tree", garden: "camera2" };
const directions = ["left", "right", "up", "down", "stop"];
export function cameraMoveSequence(camera, direction) {
  const prefix = Object.hasOwn(controls, camera) ? controls[camera] : null;
  if (!prefix || !directions.includes(direction))
    throw new Error("Unsupported camera direction.");
  const press = (value) => ({
    action: "button.press",
    target: { entity_id: `button.${prefix}_ptz_${value}` },
  });
  if (direction === "stop") return [press("stop")];
  return [
    { ...press(direction), continue_on_error: true },
    { delay: { milliseconds: 350 } },
    press("stop"),
  ];
}
export function createCameraControlsRouter(ha, { now = Date.now } = {}) {
  const router = express.Router();
  const busy = new Set();
  let cached,
    at = 0,
    pending;
  const capabilities = async () => {
    if (cached && now() - at < 30000) return cached;
    if (!pending)
      pending = ha
        .get("/api/states")
        .then((states) => {
          const available = new Set(
            states
              .filter((s) => s.state !== "unavailable")
              .map((s) => s.entity_id),
          );
          cached = Object.fromEntries(
            Object.entries(controls).map(([id, prefix]) => [
              id,
              directions.every((d) =>
                available.has(`button.${prefix}_ptz_${d}`),
              ),
            ]),
          );
          at = now();
          return cached;
        })
        .finally(() => {
          pending = null;
        });
    return pending;
  };
  router.get("/:id/controls", async (req, res) => {
    if (!Object.hasOwn(controls, req.params.id)) return res.sendStatus(404);
    res.json({ panTilt: (await capabilities())[req.params.id], mode: "nudge" });
  });
  router.post(
    "/:id/ptz",
    express.json({ limit: "1kb", strict: true }),
    async (req, res) => {
      const id = req.params.id,
        direction = req.body?.direction;
      if (!Object.hasOwn(controls, id)) return res.sendStatus(404);
      if (
        !directions.includes(direction) ||
        Object.keys(req.body || {}).some((key) => key !== "direction")
      )
        return res.status(400).json({ error: "Choose a supported direction." });
      if (direction !== "stop" && !(await capabilities())[id])
        return res.status(409).json({
          error: "Direction controls are unavailable for this camera.",
        });
      if (busy.has(id) && direction !== "stop")
        return res
          .status(429)
          .json({ error: "Wait for the current nudge to finish." });
      if (direction !== "stop") busy.add(id);
      try {
        await ha.command({
          type: "execute_script",
          sequence: cameraMoveSequence(id, direction),
        });
        res.json({ ok: true, direction });
      } catch (error) {
        // Home Assistant owns the stop sequence, independent of the browser connection.
        // If a service call fails, make a separate best-effort stop as well.
        try {
          await ha.command({
            type: "execute_script",
            sequence: cameraMoveSequence(id, "stop"),
          });
        } catch {}
        res.status(502).json({
          error:
            "The direction request could not complete. Try Stop before moving again.",
        });
      } finally {
        if (direction !== "stop") busy.delete(id);
      }
    },
  );
  router.use((error, req, res, next) => {
    if (error.status === 400 || error.type === "entity.too.large")
      return res
        .status(error.type === "entity.too.large" ? 413 : 400)
        .json({ error: "Invalid camera control request." });
    next(error);
  });
  return router;
}
