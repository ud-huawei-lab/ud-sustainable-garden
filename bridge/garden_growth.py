#!/usr/bin/env python3
"""Nightly plant measurement for the Garden app.

Runs on the DGX. `measure` takes 4K night frames of the two pots and saves
pixel measurements. `serve` shares the saved results with the app. Results stay
in pixels, so the app can apply corrected pot sizes to every past night.
"""
import hmac
import json
import os
import statistics
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(os.environ.get("GARDEN_GROWTH_ROOT", Path.home() / "garden_growth_C42"))
NIGHTS = ROOT / "nights"
REFERENCE = ROOT / "reference.jpg"
CONFIG = Path.home() / ".config" / "garden_growth_C42" / "config.json"
HA_CONFIG = Path.home() / ".config" / "ud-garden-vision" / "config.json"

SNAPSHOT = "camera.camera1_snapshots_clear"
GUARD_GO_TO = "button.tree_guard_go_to"
DUBAI = timezone(timedelta(hours=4))
FRAME_COUNT = 5
FRAME_GAP = 15
SETTLE_SECONDS = 25
MAX_IMAGE_BYTES = 6 * 1024 * 1024

# Calibrated on the 4K frame from the saved guard position.
FRAME_SIZE = (3840, 2160)
VIEW_CROP = (1780, 1180, 2860, 2060)
MAX_SHIFT = 60
MIN_MATCH = 0.15
LEAF_LEVEL = 130
BRIGHT_BACKGROUND_LEVEL = 205
POT_LEVEL = 125
MIN_PATCH = 40
PLANTS = {
    "left": {
        "search": (1890, 1270, 2240, 1660),
        "pot_row": 1704,
        "pot_span": (1830, 2240),
        "rim": ((2045, 1635), (160, 28)),
        "ignore": [],
        "bright_background": [],
    },
    "right": {
        "search": (2270, 1200, 2760, 1790),
        "pot_row": 1850,
        "pot_span": (2270, 2692),
        "rim": ((2483, 1742), (184, 42)),
        "ignore": [[(2650, 1416), (2840, 1416), (2840, 1830), (2650, 1830)]],
        "bright_background": [[(2570, 1500), (2650, 1420), (2650, 1800), (2570, 1800)]],
    },
}


def dubai_date(now):
    return now.astimezone(DUBAI).date().isoformat()


def is_night_frame(colour):
    """Night frames come from the infrared mode, so they carry no colour."""
    import cv2

    small = cv2.resize(colour, (480, 270), interpolation=cv2.INTER_AREA).astype("int16")
    return float(abs(small[..., 0] - small[..., 2]).mean()) < 3


def view_shift(gray, reference):
    """Returns the (dx, dy) shift in frame pixels and the match strength."""
    import cv2
    import numpy as np

    x0, y0, x1, y1 = VIEW_CROP
    a = cv2.resize(reference[y0:y1, x0:x1], None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA).astype(np.float32)
    b = cv2.resize(gray[y0:y1, x0:x1], None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA).astype(np.float32)
    (dx, dy), match = cv2.phaseCorrelate(a, b, cv2.createHanningWindow(a.shape[::-1], cv2.CV_32F))
    return dx * 4, dy * 4, match


def view_matches(dx, dy, match):
    return match >= MIN_MATCH and abs(dx) <= MAX_SHIFT and abs(dy) <= MAX_SHIFT


def moved(points, dx, dy):
    return [(x + dx, y + dy) for x, y in points]


def plant_mask(gray, plant, dx=0, dy=0):
    """Returns a frame-sized mask of the plant above its pot."""
    import cv2
    import numpy as np

    x0, y0, x1, y1 = plant["search"]
    x0, x1, y0, y1 = x0 + dx, x1 + dx, y0 + dy, y1 + dy
    level = np.full(gray.shape, LEAF_LEVEL, np.uint8)
    for polygon in plant["bright_background"]:
        cv2.fillPoly(level, [np.array(moved(polygon, dx, dy), np.int32)], BRIGHT_BACKGROUND_LEVEL)
    mask = (gray > level).astype(np.uint8)
    window = np.zeros(gray.shape, np.uint8)
    window[y0:y1, x0:x1] = 1
    mask &= window

    # The bright pot rim touches the leaves, so the mask stops at its back edge.
    (_, rim_y), (_, rim_depth) = plant["rim"]
    mask[rim_y + dy - rim_depth :, :] = 0
    for polygon in plant["ignore"]:
        cv2.fillPoly(mask, [np.array(moved(polygon, dx, dy), np.int32)], 0)

    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    keep = np.zeros_like(mask)
    for i in range(1, count):
        if stats[i, cv2.CC_STAT_AREA] >= MIN_PATCH:
            keep[labels == i] = 1
    return keep


def pot_width(gray, plant, dx=0, dy=0):
    """Returns the pot's width in pixels at its widest row band."""
    import numpy as np

    row = plant["pot_row"] + dy
    x0, x1 = plant["pot_span"]
    x0, x1 = x0 + dx, x1 + dx
    bright = np.median(gray[row - 6 : row + 7, x0:x1], axis=0) > POT_LEVEL
    best = current = 0
    for value in bright:
        current = current + 1 if value else 0
        best = max(best, current)
    return best


def measure_plant(gray, plant, dx=0, dy=0):
    import numpy as np

    mask = plant_mask(gray, plant, dx, dy)
    ys, xs = np.where(mask)
    if not len(xs):
        raise ValueError("No plant found")
    pot = pot_width(gray, plant, dx, dy)
    if pot < 200:
        raise ValueError("No pot found")
    left, right = int(xs.min()), int(xs.max()) + 1
    top, bottom = int(ys.min()), int(ys.max()) + 1
    rim_y = plant["rim"][0][1] + dy
    box_area = (right - left) * (bottom - top)
    return {
        "potPx": pot,
        "heightPx": rim_y - top,
        "widthPx": right - left,
        "areaPx": int(mask.sum()),
        "coverage": round(float(mask.sum()) / box_area, 4),
        "box": [left, top, right - left, bottom - top],
        "mask": mask,
    }


def outline(mask, tolerance=3, limit=4000):
    """Returns simplified leaf outlines as lists of [x, y] points."""
    import cv2

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    result, points = [], 0
    for contour in contours:
        simple = cv2.approxPolyDP(contour, tolerance, True).reshape(-1, 2)
        if len(simple) < 3 or points + len(simple) > limit:
            continue
        result.append(simple.tolist())
        points += len(simple)
    return result


def summarise(readings):
    """Takes per-frame readings of one plant and keeps the median frame."""
    middle = statistics.median_low(r["heightPx"] for r in readings)
    chosen = next(r for r in readings if r["heightPx"] == middle)
    median = lambda key: statistics.median(r[key] for r in readings)
    spread = lambda key: max(r[key] for r in readings) - min(r[key] for r in readings)
    return {
        "potPx": median("potPx"),
        "heightPx": median("heightPx"),
        "widthPx": median("widthPx"),
        "areaPx": median("areaPx"),
        "coverage": round(median("coverage"), 4),
        "spreadPx": {"height": spread("heightPx"), "width": spread("widthPx")},
        "box": chosen["box"],
        "outline": outline(chosen["mask"]),
    }


class HomeAssistant:
    def __init__(self, config):
        self.base = config["ha_url"].rstrip("/")
        self.username = config["ha_username"]
        self.password = config["ha_password"]
        self.access = None
        self.refresh = None
        self.expires = 0

    def _json(self, url, body=None, headers=None, form=False):
        data = None
        all_headers = dict(headers or {})
        if body is not None:
            data = urllib.parse.urlencode(body).encode() if form else json.dumps(body).encode()
            if not form:
                all_headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=data, headers=all_headers)
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read() or b"null")

    def token(self):
        if self.access and time.monotonic() < self.expires:
            return self.access
        client = "http://localhost:8767/"
        flow = self._json(self.base + "/auth/login_flow", {"client_id": client, "handler": ["homeassistant", None], "redirect_uri": client})
        login = self._json(
            self.base + "/auth/login_flow/" + flow["flow_id"],
            {"client_id": client, "username": self.username, "password": self.password},
        )
        if login.get("type") != "create_entry":
            raise ValueError("Home Assistant sign-in failed")
        result = self._json(
            self.base + "/auth/token",
            {"grant_type": "authorization_code", "code": login["result"], "client_id": client},
            form=True,
        )
        self.access = result["access_token"]
        self.refresh = result.get("refresh_token")
        self.expires = time.monotonic() + result["expires_in"] - 60
        return self.access

    def close(self):
        """Ends the sign-in, so nightly runs do not pile up sessions on HA."""
        if self.refresh:
            data = urllib.parse.urlencode({"action": "revoke", "token": self.refresh}).encode()
            urllib.request.urlopen(urllib.request.Request(self.base + "/auth/token", data=data), timeout=15).read()
            self.refresh = self.access = None

    def _auth(self):
        return {"Authorization": "Bearer " + self.token()}

    def snapshot(self):
        request = urllib.request.Request(self.base + "/api/camera_proxy/" + SNAPSHOT, headers=self._auth())
        with urllib.request.urlopen(request, timeout=60) as response:
            image = response.read(MAX_IMAGE_BYTES + 1)
        if not image or len(image) > MAX_IMAGE_BYTES:
            raise ValueError("Invalid image size")
        return image

    def go_to_guard(self):
        self._json(self.base + "/api/services/button/press", {"entity_id": GUARD_GO_TO}, self._auth())


def decode(image):
    import cv2
    import numpy as np

    colour = cv2.imdecode(np.frombuffer(image, np.uint8), cv2.IMREAD_COLOR)
    if colour is None:
        raise ValueError("Invalid image")
    if colour.shape[1] != FRAME_SIZE[0] or colour.shape[0] != FRAME_SIZE[1]:
        raise ValueError("Unexpected frame size")
    return colour, cv2.cvtColor(colour, cv2.COLOR_BGR2GRAY)


def save_json(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, separators=(",", ":")))
    os.replace(temporary, path)


def save_bytes(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_bytes(value)
    os.replace(temporary, path)


def history_entry(night):
    entry = {"date": night["date"], "capturedAt": night["capturedAt"], "status": night["status"]}
    if night["status"] == "ok":
        entry["plants"] = {
            key: {k: plant[k] for k in ("potPx", "heightPx", "widthPx", "areaPx", "coverage")}
            for key, plant in night["plants"].items()
        }
    return entry


def publish(night, image=None):
    NIGHTS.mkdir(parents=True, exist_ok=True)
    save_json(NIGHTS / (night["date"] + ".json"), night)
    if image is not None:
        save_bytes(NIGHTS / (night["date"] + ".jpg"), image)
    nights = [json.loads(p.read_text()) for p in sorted(NIGHTS.glob("*.json"))]
    save_json(ROOT / "history.json", [history_entry(n) for n in nights])
    good = [n for n in nights if n["status"] == "ok"]
    if good:
        save_json(ROOT / "latest.json", good[-1])


def failed(now, status, detail):
    return {"date": dubai_date(now), "capturedAt": now.isoformat(), "status": status, "detail": detail}


def measure(ha, wait=time.sleep, clock=lambda: datetime.now(timezone.utc)):
    import cv2

    now = clock()
    first = ha.snapshot()
    colour, gray = decode(first)
    if not is_night_frame(colour):
        return failed(now, "not_night", "The camera was not in night mode."), None
    if not REFERENCE.exists():
        save_bytes(REFERENCE, first)
    reference = cv2.cvtColor(decode(REFERENCE.read_bytes())[0], cv2.COLOR_BGR2GRAY)

    returned = False
    dx, dy, match = view_shift(gray, reference)
    if not view_matches(dx, dy, match):
        ha.go_to_guard()
        returned = True
        wait(SETTLE_SECONDS)
        first = ha.snapshot()
        colour, gray = decode(first)
        dx, dy, match = view_shift(gray, reference)
        if not view_matches(dx, dy, match):
            return failed(now, "view_moved", "The saved view could not be restored."), None

    frames = [first]
    for _ in range(FRAME_COUNT - 1):
        wait(FRAME_GAP)
        frames.append(ha.snapshot())

    readings = {key: [] for key in PLANTS}
    shifts = []
    for image in frames:
        _, gray = decode(image)
        dx, dy, match = view_shift(gray, reference)
        if not view_matches(dx, dy, match):
            continue
        ox, oy = round(dx), round(dy)
        shifts.append((ox, oy))
        for key, plant in PLANTS.items():
            readings[key].append(measure_plant(gray, plant, ox, oy))
    if len(shifts) < 3:
        return failed(now, "view_moved", "Too few frames matched the saved view."), None

    night = {
        "date": dubai_date(now),
        "capturedAt": now.isoformat(),
        "status": "ok",
        "frames": len(shifts),
        "frame": {"width": FRAME_SIZE[0], "height": FRAME_SIZE[1]},
        "view": {"dx": shifts[0][0], "dy": shifts[0][1], "returnedToGuard": returned},
        "plants": {key: summarise(rows) for key, rows in readings.items()},
    }
    return night, frames[0]


def run_measure():
    ha = HomeAssistant(json.loads(HA_CONFIG.read_text()))
    try:
        night, image = measure(ha)
    except Exception as error:
        night, image = failed(datetime.now(timezone.utc), "error", type(error).__name__ + ": " + str(error)[:200]), None
    finally:
        try:
            ha.close()
        except OSError:
            pass
    publish(night, image)
    print(json.dumps({k: v for k, v in night.items() if k != "plants"}))
    if night["status"] == "ok":
        for key, plant in night["plants"].items():
            print(key, {k: v for k, v in plant.items() if k not in ("outline",)})
    return 0 if night["status"] in ("ok", "not_night") else 1


def latest_frame_path():
    latest = json.loads((ROOT / "latest.json").read_text())
    return NIGHTS / (latest["date"] + ".jpg")


def resolve(path):
    """Maps a request path to a fixed file. Nothing else can be read."""
    if path == "/latest.json":
        return ROOT / "latest.json", "application/json"
    if path == "/history.json":
        return ROOT / "history.json", "application/json"
    if path == "/frame.jpg":
        return latest_frame_path(), "image/jpeg"
    return None, None


class Handler(BaseHTTPRequestHandler):
    server_version = "garden-growth"
    sys_version = ""
    timeout = 20

    def do_GET(self):
        expected = "Bearer " + self.server.token
        if not hmac.compare_digest(self.headers.get("Authorization", ""), expected):
            return self.respond(401)
        try:
            path, kind = resolve(urllib.parse.urlsplit(self.path).path)
            if path is None:
                return self.respond(404)
            body = path.read_bytes()
        except (OSError, ValueError, KeyError):
            return self.respond(404)
        self.respond(200, body, kind)

    def respond(self, status, body=b"", kind="text/plain"):
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


def run_server():
    config = json.loads(CONFIG.read_text())
    if len(config.get("token", "")) < 43:
        raise SystemExit("Missing token")
    server = ThreadingHTTPServer((config["bind"], config["port"]), Handler)
    server.token = config["token"]
    server.serve_forever()


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "measure":
        raise SystemExit(run_measure())
    if command == "serve":
        run_server()
    else:
        raise SystemExit("Usage: garden_growth.py measure|serve")
