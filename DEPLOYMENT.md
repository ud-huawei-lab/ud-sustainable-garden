# Deploy on Vercel

The React frontend and Node API run in the same Vercel project and use the same domain. `api/garden.js` hosts the API; `vercel.json` routes `/auth/*` and `/api/*` to it. There is no external backend URL to configure. Builds succeed without runtime secrets; unconfigured API requests fail closed with 503.

## Project settings

- Repository: `ud-huawei-lab/ud-sustainable-garden`, production branch `main`.
- Framework: Vite. Build: `npm run build`. Output: `dist`.
- Node: 24.x. Fluid compute is enabled in `vercel.json`.

## Server environment variables

Add these in the Vercel project's Environment Variables for Production and, when needed, Preview:

- `HA_URL=https://jnjtt9at8pwjtctcunrwlvs2mdegtpbf.ui.nabu.casa`
- `HA_USERNAME` and `HA_PASSWORD`, using the supplied HA account; alternatively, use `HA_TOKEN`.
- `APP_USERNAME` and `APP_PASSWORD_HASH`, using the configured Garden account. The local ignored `.env` already contains the hash. `npm run auth:setup` creates or changes it with hidden password input.
- `APP_ORIGIN=https://ud-sustainable-garden.vercel.app`. Vercel's system deployment URL is also allowed for previews.

Keep credentials and the password hash marked sensitive/encrypted. Never give them a `VITE_` prefix, commit `.env`, or put them in browser code. The Garden viewer account and the Home Assistant source account serve different purposes.

## Shared sessions through Vercel Storage

In the same project's **Storage** tab, connect an **Upstash Redis** store through Vercel Marketplace. Choose a free option if available; a paid plan requires approval. Connect it to the required deployment environments. The integration supplies `KV_REST_API_URL` and `KV_REST_API_TOKEN`; `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are also supported.

Redis stores hashed session identifiers with 12-hour expiry, atomic login-attempt counters, and temporary camera stream metadata. Passwords and Home Assistant account credentials are not stored in Redis. Camera stream metadata contains upstream stream URLs and is private server data with a one-hour TTL. No browser-readable session tokens or upstream camera URLs are returned to clients.

Shared storage makes login, logout, and camera playback work when consecutive requests reach different Vercel instances. Sessions survive cold starts; changing the configured password hash invalidates old sessions. If Redis is unavailable, protected requests fail rather than bypassing authentication.

Local `npm start` continues using one process and in-memory storage; no Redis is required locally. Local sessions end on restart.

## Live measurements and cameras

Vercel uses one-second authenticated HTTP readings rather than an indefinitely open server connection. Values come directly from HA through the Node function and retain each sensor's actual reporting interval. Local development continues to use SSE.

Camera stream metadata is shared so playlists and video segments can reach different instances safely. HLS resources remain same-origin and authenticated. Individual function requests have a 120-second duration limit to allow HA camera startup and long-polling playlist requests; cold starts and the upstream network can still delay playback.

## Verify

Redeploy the latest `main` after saving environment variables and connecting storage. `/auth/session` should return 401 when signed out, rather than 404 or 503. Sign in and confirm `/api/readings` returns the mapped entities, Reading displays values, history loads, and both camera feeds play. Logout must return protected endpoints to 401, including requests handled by another instance.

Successful build/deployment does not prove that runtime credentials or storage are configured. Live-site verification remains required. Reverting the deployment restores the preceding version; leave secrets in Vercel's environment settings.
