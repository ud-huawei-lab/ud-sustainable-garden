# UD Sustainable Garden

React + JSX frontend, Express backend, and an interactive Three.js garden scene.

## Run locally

Requires Node.js 22 or newer. Copy `.env.example` to `.env`, configure Home Assistant credentials, and set up a dashboard account before starting. `.env` is excluded from git. This device already has the existing dashboard account configured.

```powershell
npm ci --ignore-scripts
npm run auth:setup
npm run build
npm start
```

Open http://127.0.0.1:5173 and sign in. For development with hot reload, use `npm run dev` instead of `npm start`. Run one server at a time. The setup command hides password input and saves a salted scrypt hash; it never saves the dashboard password itself. To change credentials, run it again and restart the server, which also invalidates existing sessions.

## Pages

- **Home:** Three.js reconstruction with orbit, zoom, keyboard-operable view controls, equipment labels, and real station readings. Two humidity extractors and two pots to their right. Layout and foliage are approximate, not a photogrammetry scan.
- **Overview:** the weather reference layout with current conditions and bright UV, irradiance, and AQI scales. The full sensor directory is separate.
- **Reading:** all 23 live readings and their history, grouped into three independent category columns that adapt to two columns on tablets and one on phones. Select any sensor for a centered history dialog with 24-hour, 7-day, 30-day, or custom ranges, Dubai timestamps, and CSV export. Values follow the pointer in an edge-constrained tooltip. There is no graph slider; focus the graph and use arrow keys, Home, or End for keyboard exploration. Old `#/history` and `#/columnar` links open Reading. Cards remain monochrome; color is reserved for measurement scales.
- **CCTV:** both camera feeds start automatically using HLS.js. Streams are muted by default; fullscreen/expanded views are available. If the upstream camera cannot stream, a snapshot fallback is shown.

AI is a disabled visual preview. There are no agent calls or connection-status badges. Green/yellow/red are used only within measurement scales. Page backgrounds are pure white or black. Home has a collapsible Environment panel and no outer frame.

## Data and security

The branded sign-in screen uses server-side authentication in both development and production. All `/api` routes, including readings, history, SSE, camera images, and HLS segments, require a valid session. The static application shell and logo are public and contain no sensor data or secrets. Browser sessions use random opaque HttpOnly, SameSite=Strict cookies; the server stores only digests of session tokens. There are no authentication tokens in localStorage or sessionStorage. Sessions expire after 12 hours and are revoked on logout or a password-hash change. Local sessions also end on server restart. Logout closes local SSE connections and signs out other tabs.

Login accepts at most eight attempts per client address in 15 minutes, with bounded password-verification concurrency. Unknown usernames and incorrect passwords receive the same error. Login/logout require an allowed Origin, and cross-site API requests are rejected. Requests have bounded bodies; security headers and a production Content Security Policy restrict executable content and framing.

The server signs in to Home Assistant and retains tokens in memory. Authentication steps share one persistent connection because the remote tunnel binds login flows to the request IP. Browser clients only receive allowlisted garden entities and stripped attributes. There is no device-control endpoint or unrestricted HA proxy.

Local hosting subscribes to HA state changes over WebSocket and relays them with SSE, coalescing bursts over 250 ms. Vercel uses one-second authenticated HTTP readings within its bounded function runtime. Both paths use real Home Assistant values; updates remain limited by source-device reporting intervals. REST readings are cached for one second per warm instance.

History is already stored by the HA recorder. This project reads that existing store; it does not create an additional database. Direct InfluxDB v1 querying is implemented as an optional adapter through `INFLUX_URL`, database, and credentials. It is not configured locally because the inspected InfluxDB URL was internal to the HA add-on. Available historical dates depend on the existing recorder retention. Grafana remains available through the History dialog link.

Both mapped cameras are allowlisted. LL-HLS manifests and nested `segment/*.m4s` resources are relayed through the server; upstream stream identifiers and access tokens do not enter the frontend. Cold camera startup over the HA cloud tunnel can take tens of seconds.

The server requires `APP_USERNAME` and `APP_PASSWORD_HASH` and binds only to loopback by default. Local HTTP uses an HttpOnly, SameSite=Strict cookie; it cannot use a Secure cookie without HTTPS. Remote binding requires `APP_ORIGIN=https://your-domain.example` and an HTTPS reverse proxy. HTTPS uses a `__Host-` prefixed Secure cookie, and plaintext remote requests are refused. Set `TRUST_PROXY=loopback` only when a trusted proxy on this machine terminates HTTPS; arbitrary forwarded client headers are otherwise ignored. Do not expose the Node port directly. This project has not been deployed publicly.

On Vercel, shared sessions, atomic login limits, and temporary camera stream metadata use a Redis store connected through the Vercel project's Storage tab. Local hosting uses in-memory storage. There is one configured dashboard account; this release does not provide account registration, password recovery, or multi-factor authentication.

## Checks

For hosted deployment, follow [DEPLOYMENT.md](DEPLOYMENT.md). The frontend and Node API run in the same Vercel project; `vercel.json` maps data and authentication requests to `api/garden.js`.

```powershell
npm test
npm run check
npm run build
npm audit
```

Tests cover missing measurements and real zeros, date-range limits, credential filtering, read-only API boundaries, shared HA authentication, WebSocket changes, safe nested HLS rewriting, password validation, cookie tampering, origin checks, login throttling, expiry, logout revocation, and live SSE termination. Browser screenshots from local verification are in the ignored `artifacts/` directory.

## Reference

The user's `ud-huawei-lab/digital-twin` repository supplied the visual reference, integration patterns, and University of Dubai logo assets. A temporary reference clone was used for inspection; the application is an independent project.
