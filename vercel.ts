import { vercelConfig } from "./scripts/deployment-config.mjs";

// Vercel serves the UI and proxies the API to the persistent Node process.
// This variable is an origin only; HA credentials never enter the Vite build.
export const config = vercelConfig(process.env.GARDEN_BACKEND_ORIGIN);
