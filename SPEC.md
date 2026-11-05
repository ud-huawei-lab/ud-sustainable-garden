# UD Sustainable Garden

React + JSX dashboard with a Node backend and a Three.js digital garden. Local-first delivery; no hosting or public deployment.

Authentication: match the original dashboard's branded username/password sign-in. Require a configured account even on localhost, store only a salted password hash, and protect all sensor/history/camera endpoints with server-side sessions. HttpOnly, SameSite=Strict cookies, Secure over HTTPS; 12-hour absolute expiry, immediate logout revocation, cross-tab logout, origin checks, login rate limits, and no browser-readable tokens. Remote access requires a configured HTTPS origin; no public deployment is included.

Version 1: Reading (#/readings) uses the columnar layout exclusively. The former Columnar route opens Reading. Graph values follow the pointer without a slider; keyboard users focus the graph and use arrow keys, Home, or End.

Independent hash routes: Home (#/home), Overview (#/overview), Reading (#/readings), CCTV (#/cameras). Home is the default. Reading combines live readings and history in category columns; the legacy #/history URL opens this same page. Reading owns the full grouped sensor directory; Overview contains only the reference weather layout. The Three.js scene is approximate, based on camera views; two humidity extractors and two plant pots immediately to their right are confirmed by the user. Remove all other trees. More photographs and dimensions are needed for a faithful reconstruction. Do not attach station cabinet readings to the extractors as though they were extractor measurements.

Final sketch corrections: separate rear ground-mounted solar array to the extractors' left; tank behind the two pots; full-length parking canopy in front. Numbers 1–10 identify parking spaces, not solar panels. Camera 1 attaches to an extractor and Camera 2 to the canopy near its middle. Tubing routes are extractor → tank → plants, with illustrative flow animation. Pure white/black page and scene backgrounds, no Home frame, collapsible readings, neutral cards, color only for measurement scales. Group all station sensors under Temperature, Humidity, Wind, Pressure, Solar & UV, Rainfall, and Air Quality.

Live data: one shared HA WebSocket state-change subscription, relayed to browser clients with SSE; coalesce bursts over 250 ms, reconnect automatically. Device reporting intervals remain the limit on new measurements. CCTV autoplays both muted LL-HLS feeds; handle nested video segments without exposing upstream credentials. History has a tile for every mapped sensor, with a centered chart modal; text sensors use a recorded-change table.

Match the user's UD digital-twin weather reference: university branding, understated navigation, two wide top panels, three lower panels, large light-weight readings, subtle surfaces, light/dark theme, and a bottom ask bar. Extend the same language with history and two garden cameras. No status indicators, dots, connection badges, or fabricated readings. AI is display-only and makes no network requests.

Use the existing HA garden entities: outdoor/cabinet temperature and humidity, wind, gusts, direction, pressure, UV, irradiance, rain totals, IQAir, and camera.tree_fluent / camera.camera2_fluent. Readings update automatically. Keep HA credentials and camera tokens server-side. Do not expose arbitrary HA APIs or device control.

History: metric selection, outdoor/cabinet comparison, 24h / 7d / 30d / custom range, Dubai timestamps, gaps for missing readings, min/average/max, CSV export. Camera snapshots refresh; expandable live HLS view with snapshot fallback. InfluxDB v1 is optional; use HA recorder when no direct Influx route is configured. Link to the original Grafana dashboard for deeper investigation.

Acceptance: real data end-to-end; no secrets in browser bundles or git; keyboard-accessible controls; responsive desktop/mobile; tests for boundaries, numeric missing values, and time handling; production build and actual browser checks.
