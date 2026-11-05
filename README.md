# UD Sustainable Garden

React + JSX frontend, Express backend, and an interactive Three.js garden scene.

## Run locally

Requires Node.js 22 or newer. The local `.env` is already configured on this device and is excluded from git.

```powershell
npm ci --ignore-scripts
npm run build
npm start
```

Open http://127.0.0.1:5173. For development with hot reload, use `npm run dev` instead of `npm start`. Run one server at a time. For another machine, copy `.env.example` to `.env` and configure the existing Home Assistant account or HA_TOKEN.

## Pages

- **Home:** Three.js reconstruction with orbit, zoom, keyboard-operable view controls, equipment labels, and real station readings. Two humidity extractors and two pots to their right. Layout and foliage are approximate, not a photogrammetry scan.
- **Overview:** the weather reference layout with current conditions and bright UV, irradiance, and AQI scales. The full sensor directory is separate.
- **Readings:** all 23 mapped readings grouped under Temperature, Humidity, Wind, Pressure, Solar & UV, Rainfall, and Air Quality. Cards are monochrome; color is reserved for measurement scales.
- **History:** sensor tiles open a centered dialog with 24-hour, 7-day, 30-day, or custom history; numeric graphs, text change tables, Dubai timestamps, and CSV export of displayed samples.
- **CCTV:** both camera feeds start automatically using HLS.js. Streams are muted by default; fullscreen/expanded views are available. If the upstream camera cannot stream, a snapshot fallback is shown.

AI is a disabled visual preview. There are no agent calls or connection-status badges. Green/yellow/red are used only within measurement scales. Page backgrounds are pure white or black. Home has a collapsible Environment panel and no outer frame.

## Data and security

The server signs in to Home Assistant and retains tokens in memory. Authentication steps share one persistent connection because the remote tunnel binds login flows to the request IP. Browser clients only receive allowlisted garden entities and stripped attributes. There is no device-control endpoint or unrestricted HA proxy.

One upstream WebSocket subscribes to state changes, which are coalesced over 250 ms and forwarded using Server-Sent Events. Updates arrive when the source devices publish; a one-second frontend refresh cannot make a slower sensor generate readings faster. Reconnection is automatic. REST readings are cached for one second as an initial-load fallback.

History is already stored by the HA recorder. This project reads that existing store; it does not create an additional database. Direct InfluxDB v1 querying is implemented as an optional adapter through `INFLUX_URL`, database, and credentials. It is not configured locally because the inspected InfluxDB URL was internal to the HA add-on. Available historical dates depend on the existing recorder retention. Grafana remains available through the History dialog link.

Both mapped cameras are allowlisted. LL-HLS manifests and nested `segment/*.m4s` resources are relayed through the server; upstream stream identifiers and access tokens do not enter the frontend. Cold camera startup over the HA cloud tunnel can take tens of seconds.

The server binds only to loopback by default. Remote binding requires APP_USERNAME and APP_PASSWORD and should sit behind HTTPS. This project has not been deployed publicly.

## Checks

```powershell
npm test
npm run check
npm run build
npm audit
```

Tests cover missing measurements and real zeros, date-range limits, credential filtering, read-only API boundaries, shared authentication, WebSocket changes, and safe nested HLS rewriting. Browser screenshots from local verification are in the ignored `artifacts/` directory.

## Reference

The user's `ud-huawei-lab/digital-twin` repository supplied the visual reference, integration patterns, and University of Dubai logo assets. A temporary reference clone was used for inspection; the application is an independent project.
