# Changelog

## Unreleased

- Add Plants page and nightly camera measurements of plant height, width, canopy and leaf cover, stored on the DGX.
- Add a plant measurement overlay to the Camera 1 feed.
- Add the Water page: calculated absolute humidity, VPD and FAO-56 ET0 with dew point, from existing station history. Outages stay blank.
- `npm run dev` on loopback skips sign-in. Deployments and `npm start` still require it.
- Keep the assistant panel collapsed when models fail to load, and let its collapse button work.
- Add the original dashboard's branded sign-in experience using the existing account, salted scrypt password hashes, and opaque server-side sessions.
- Protect all data, history, live-event, and camera endpoints with origin checks, login limits, and HTTPS enforcement. Vercel uses 30-minute cookies; local hosting retains 12-hour revocable sessions.
- Host the frontend and Node API together on Vercel with no Redis or storage subscription. Use 30-minute encrypted session cookies and encrypted camera routing context across function instances. Logout clears the browser cookie; copied cookies expire naturally. Local hosting retains in-memory session revocation.
- Add one-second HTTP readings when the live stream is interrupted or buffered, and surface request failures.
- Add authentication, HTTPS proxy, deployment-route, and transport regression checks, plus a CI workflow.

## 1.0.0 — 2026-11-05

- Home: interactive Three.js garden with the confirmed equipment arrangement, two camera mounts, and illustrative water tubing.
- Overview: current weather measurements with bright measurement scales.
- Reading: all 23 sensors in category columns, with historical charts, custom date ranges, and CSV export.
- History values follow the pointer; graphs support arrow keys without a slider.
- CCTV: two automatically playing live feeds, with protected server-side camera proxying.
- Shared live Home Assistant updates, light/dark themes, and a display-only AI preview.

Requires server-side Home Assistant configuration. Direct InfluxDB access is optional and unconfigured by default; historical availability depends on HA recorder retention. The 3D scene and water flow are illustrative. This release does not deploy a public service.
