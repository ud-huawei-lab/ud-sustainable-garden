# Quality contract

- No status dots, indicators, or connection badges.
- No sample sensor values or fake history. Missing data stays missing. The one approved exception is the pitch's sample growth chart in `src/growthSample.js`, which stays in the browser and never reaches the assistant or stored measurements. Soil moisture samples in `src/soilSample.js` appear only while the Sample data switch in Home settings is on. The switch is off by default, and the data never reaches the assistant or `entities`.
- AI UI only; disabled input, no model/agent calls.
- Credentials stay in ignored environment configuration and server memory.
- Read-only HA endpoints, allowlisted entity IDs, history range at most 31 days.
- Localhost binding by default; remote binding requires application authentication. Only `npm run dev` on loopback skips sign-in.
- Dubai time for all user-facing timestamps and date-range inputs.
- Desktop and narrow mobile layouts must render without horizontal overflow.
- Automated boundary tests and production build must pass; document upstream limits.
