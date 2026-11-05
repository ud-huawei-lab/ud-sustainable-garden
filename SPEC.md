# UD Sustainable Garden

React + JSX dashboard with a Node backend. Local-first delivery; no hosting or public deployment.

Match the user's UD digital-twin weather reference: university branding, understated navigation, two wide top panels, three lower panels, large light-weight readings, subtle surfaces, light/dark theme, and a bottom ask bar. Extend the same language with history and two garden cameras. No status indicators, dots, connection badges, or fabricated readings. AI is display-only and makes no network requests.

Use the existing HA garden entities: outdoor/cabinet temperature and humidity, wind, gusts, direction, pressure, UV, irradiance, rain totals, IQAir, and camera.tree_fluent / camera.camera2_fluent. Readings update automatically. Keep HA credentials and camera tokens server-side. Do not expose arbitrary HA APIs or device control.

History: metric selection, outdoor/cabinet comparison, 24h / 7d / 30d / custom range, Dubai timestamps, gaps for missing readings, min/average/max, CSV export. Camera snapshots refresh; expandable live HLS view with snapshot fallback. InfluxDB v1 is optional; use HA recorder when no direct Influx route is configured. Link to the original Grafana dashboard for deeper investigation.

Acceptance: real data end-to-end; no secrets in browser bundles or git; keyboard-accessible controls; responsive desktop/mobile; tests for boundaries, numeric missing values, and time handling; production build and actual browser checks.
