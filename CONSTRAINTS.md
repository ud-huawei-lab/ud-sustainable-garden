# Quality contract

- No status dots, indicators, or connection badges.
- No sample sensor values or fake history. Missing data stays missing.
- AI UI only; disabled input, no model/agent calls.
- Credentials stay in ignored environment configuration and server memory.
- Read-only HA endpoints, allowlisted entity IDs, history range at most 31 days.
- Localhost binding by default; remote binding requires application authentication.
- Dubai time for all user-facing timestamps and date-range inputs.
- Desktop and narrow mobile layouts must render without horizontal overflow.
- Automated boundary tests and production build must pass; document upstream limits.
