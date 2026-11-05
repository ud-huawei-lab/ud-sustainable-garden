# Changelog

## Unreleased

- Add the original dashboard's branded sign-in experience using the existing account, salted scrypt password hashes, and opaque server-side sessions.
- Protect all data, history, live-event, and camera endpoints; add 12-hour expiry, logout revocation, origin checks, login rate limits, and HTTPS enforcement for remote access.
- Diagnose the Vercel site's missing API routes; add an explicit Vercel-to-Node proxy configuration and a Render backend Blueprint pinned to the supplied Nabu Casa instance. Hosting activation remains pending account access and configuration.
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
