import { createApp } from "../server/app.js";

export function gardenHandler(env = process.env, options = {}) {
  let application;
  return async (req, res) => {
    try {
      const url = new URL(req.url, "https://garden.invalid");
      const routes = url.searchParams.getAll("__garden_route");
      if (routes.length > 1)
        return res.status(400).json({ error: "Invalid request path." });
      if (routes.length === 1) {
        const route = routes[0];
        if (
          !/^(?:api\/|auth\/|healthz$)/.test(route) ||
          /[\\?#]|\.\./.test(route)
        )
          return res.status(400).json({ error: "Invalid request path." });
        url.searchParams.delete("__garden_route");
        req.url = "/" + route + url.search;
      }
      application ||= createApp(env, { serverless: true, ...options });
      const app = await application;
      await new Promise((resolve, reject) => {
        res.once("finish", resolve);
        res.once("close", resolve);
        try {
          app(req, res);
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      application = null;
      if (res.headersSent) return res.end();
      console.error("Garden API initialization failed: " + error.message);
      res.setHeader("Cache-Control", "no-store");
      res.status(503).json({
        error:
          "The dashboard server is not configured. Please contact the administrator.",
      });
    }
  };
}

export default gardenHandler();
