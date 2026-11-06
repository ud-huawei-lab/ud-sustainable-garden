# DGX camera vision gateway

The production Garden app remains on Vercel. This small Python standard-library service runs on the DGX Spark as the `jetson` user. It uses Home Assistant at `http://100.66.41.77:8123` through Tailscale and Ollama at `http://127.0.0.1:11434`.

Only the two catalog cameras, three read-only weather sensors, installed model metadata, and bounded vision analysis are available. Raw Ollama is never published. HTTPS Tailscale Funnel on port 8443 forwards only to the gateway on `127.0.0.1:8767`; every gateway route requires a separate random bearer token. The existing port 443 Serve route is unaffected.

Configuration lives outside the repository at `~/.config/ud-garden-vision/config.json`, owner-only mode 0600, inside a 0700 directory. It contains `token`, `ha_url`, `ha_username`, and `ha_password`. Do not commit it. Vercel stores only `AI_BRIDGE_URL` and `AI_BRIDGE_TOKEN` as server environment variables; the token must be sensitive. There are no browser-visible gateway credentials.

Installed paths:
- `~/ud-garden-vision/garden_vision.py`
- `~/.config/systemd/user/ud-garden-vision.service`

Service commands:
```sh
systemctl --user status ud-garden-vision
systemctl --user restart ud-garden-vision
journalctl --user -u ud-garden-vision --since '10 minutes ago'
```

To disable only this gateway's internet route:
```sh
sudo tailscale funnel --https=8443 off
```

The UI defaults to `gemma4:12b`, lists installed vision models only. Each analysis captures three chronological frames one second apart and uses up to the last three conversation exchanges. Images and inference context are held in memory, not saved to files. The model can stay resident in Ollama for ten minutes to avoid repeated cold loading. Voice and equipment control are not enabled.

Requests explicitly set `think: false` and `num_ctx: 32768`; no global Ollama settings are changed. The context indicator uses Ollama's returned `prompt_eval_count` and `eval_count`, not an estimate, and separately lists each model's maximum context and file size. The inference time comes from Ollama's `total_duration` and excludes capture/network time. Larger context allocation does not mean every request fills the entire window.

The gateway has bounded request bodies, socket read timeouts, at most twelve handler threads, one active inference, a fixed camera/model allowlist, and no arbitrary URLs or tools. Vercel additionally requires a dashboard session and same-origin POST. The model can still misdescribe an image; this is descriptive assistance, not a health assessment or an automation trigger.

Tests:
```sh
python -m unittest discover -s bridge -p '*_test.py'
```

## Plant measurements

`garden_growth.py` runs on the DGX as the `jetson` user. It is separate from the vision gateway and reuses that gateway's Home Assistant login from `~/.config/ud-garden-vision/config.json`.

Installed paths:
- `~/garden_growth_C42/`: the script, its `.venv`, `reference.jpg`, `latest.json`, `history.json` and one JSON and JPEG per night in `nights/`
- `~/.config/garden_growth_C42/config.json`: data service token, mode 0600
- `~/.config/systemd/user/garden-growth-measure_C42.timer`: runs the job at 02:00 Dubai time
- `~/.config/systemd/user/garden-growth-data_C42.service`: read-only data on `127.0.0.1:8771`

The data service serves only `/latest.json`, `/history.json` and `/frame.jpg`, and requires the token. Locally, open a tunnel with `ssh -f -N -L 8771:127.0.0.1:8771 dgx`. A deployed site needs its own HTTPS route to this service.

Calibration values in `PLANTS` belong to the Camera 1 guard position. If the camera or pots move, update them and delete `reference.jpg`, so that the next night saves a new reference. The job uses the guard position because Home Assistant's pan and tilt sensors did not change when the camera moved.

```sh
systemctl --user start garden-growth-measure_C42.service
journalctl --user -u garden-growth-measure_C42 --since today
```
