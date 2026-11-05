# Hosted Garden deployment

The Vercel site initially deployed only `dist/`. Its `/api/readings` and `/auth/session` routes returned 404, so no readings could appear. The Nabu Casa server itself was reachable and returned real sensor data.

The project needs a persistent Node web service for its server-side sessions, shared Home Assistant WebSocket connection, and camera proxy. Vercel continues to serve the frontend and proxies `/api/*` and `/auth/*` to that service. No Home Assistant secrets belong in Vite variables or the frontend bundle.

## 1. Deploy the backend

Use the repository's `render.yaml` Blueprint to create **one** Node web service. It starts with the free plan; do not change to a paid plan without authorization. The free service can sleep and cold-start, and restarting it signs users out. Always-on production hosting can be chosen later.

The Blueprint configures:

- Build: `npm ci --ignore-scripts && npm run build`
- Start: `npm start`
- Health check: `/healthz`
- `HOST=0.0.0.0`, with Render's assigned `PORT`
- `APP_ORIGIN=https://ud-sustainable-garden.vercel.app`
- `TRUST_PROXY=1`, relying on Render's trusted edge proxy; the Node port must not be directly exposed.
- `HA_URL=https://jnjtt9at8pwjtctcunrwlvs2mdegtpbf.ui.nabu.casa`

Set these secret environment variables in the backend hosting dashboard:

- `HA_USERNAME` and `HA_PASSWORD`, using the supplied Home Assistant account; alternatively, a long-lived `HA_TOKEN` can replace them.
- `APP_USERNAME` and `APP_PASSWORD_HASH`, using the configured dashboard account. The local ignored `.env` already holds the hash. For another account, run `npm run auth:setup` in a terminal and use its resulting hash.

Never commit `.env`, paste credentials into repository files, or add `VITE_` prefixes to secrets. The two logins are separate: the Garden login authorizes viewers; the HA account lets the backend read the source data.

## 2. Connect Vercel to the backend

Copy the actual HTTPS origin assigned to the backend service. In the Vercel project's production environment, set `GARDEN_BACKEND_ORIGIN` to that origin, **without a trailing slash**. Do not substitute an unverified or guessed hostname.

Redeploy the frontend. `vercel.ts` generates the two proxy rules and no-store headers. It refuses to deploy if the backend origin is absent or malformed. The browser keeps using `https://ud-sustainable-garden.vercel.app` for login, readings, and cameras, so cookies stay same-origin. The backend checks that same public origin and uses Secure, HttpOnly, SameSite=Strict cookies.

The frontend uses SSE and falls back to one-second HTTP readings if a proxy buffers or interrupts the stream. Actual measurement freshness still depends on each sensor's reporting interval.

## 3. Verify before calling the deployment complete

- The backend `/healthz` responds 200, with no secrets in the response.
- Vercel `/auth/session` responds 401 while signed out, rather than 404.
- Login succeeds with the configured Garden account, and its cookie has Secure, HttpOnly, and SameSite=Strict.
- Vercel `/api/readings` responds 200 after login and contains the mapped HA entities.
- Reading displays real values, history loads, and both camera feeds play.
- Logout revokes the session, closes its live connection, and returns protected endpoints to 401.

Only one backend instance is supported by the in-memory session and login-limit stores. Multiple instances need shared stores first. A static Vercel-only deployment cannot run this persistent backend. Hosting access and environment configuration are required to complete deployment.

## Rollback

Revert the deployment commit and redeploy the previous frontend/backend revision together. Keep secrets in the hosting environment. Backend restarts intentionally invalidate existing sessions; users sign in again.
