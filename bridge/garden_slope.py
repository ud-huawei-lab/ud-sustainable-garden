#!/usr/bin/env python3
"""Daily measurement of the slope trees for the Garden app.

Runs on the DGX with SAM 2.1, using 4K daylight frames from Camera 2. The trees
stand on open sand, so a segmentation model fits better than a brightness
threshold. Results stay in pixels. The app applies each tree's reference height.
"""
import json
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path.home() / "garden_growth_C42"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import garden_growth as growth

SLOPE = growth.ROOT / "slope"
REFERENCE = SLOPE / "reference.jpg"
SNAPSHOT = "camera.camera2_snapshots_clear"
GUARD_GO_TO = "button.camera2_guard_go_to"
MODEL = "facebook/sam2.1-hiera-large"
FRAME_COUNT = 5
FRAME_GAP = 15
SETTLE_SECONDS = 30
BOX_MARGIN = 28
CROP_MARGIN = 100
VIEW_CROP = (1240, 760, 2720, 1440)
MAX_SHIFT = 80
MIN_MATCH = 0.08
# `base` is where the trunk meets the ground, calibrated on the saved view.
# `box` is the SAM prompt, the same every day. Prompting from the last result
# let the box creep outward and inflated growth, so do not do that.
TREES = {
    "left": {"box": (1540, 980, 1760, 1270), "base": (1645, 1256)},
    "right": {"box": (2310, 1020, 2440, 1160), "base": (2372, 1201)},
}


def measure_mask(mask, base_y):
    """Measures a full-frame mask from the fixed ground point."""
    import numpy as np

    mask = mask.copy()
    mask[base_y + 1 :, :] = 0
    ys, xs = np.where(mask)
    if not len(xs):
        raise ValueError("No tree found")
    left, right = int(xs.min()), int(xs.max()) + 1
    top = int(ys.min())
    height = base_y - top
    if height <= 0:
        raise ValueError("Tree top is below its base")
    area = int(mask.sum())
    return {
        "heightPx": height,
        "widthPx": right - left,
        "areaPx": area,
        "coverage": round(area / ((right - left) * height), 4),
        "box": [left, top, right - left, height],
        "mask": mask,
    }


def summarise(readings):
    """Keeps medians and the frame closest to the median height."""
    middle = statistics.median_low(r["heightPx"] for r in readings)
    chosen = next(r for r in readings if r["heightPx"] == middle)
    median = lambda key: statistics.median(r[key] for r in readings)
    spread = lambda key: max(r[key] for r in readings) - min(r[key] for r in readings)
    return {
        "heightPx": median("heightPx"),
        "widthPx": median("widthPx"),
        "areaPx": median("areaPx"),
        "coverage": round(median("coverage"), 4),
        "spreadPx": {"height": spread("heightPx"), "width": spread("widthPx")},
        "box": chosen["box"],
        "outline": growth.outline(chosen["mask"]),
    }


def view_shift(gray, reference):
    import cv2
    import numpy as np

    x0, y0, x1, y1 = VIEW_CROP
    a = cv2.resize(reference[y0:y1, x0:x1], None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA).astype(np.float32)
    b = cv2.resize(gray[y0:y1, x0:x1], None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA).astype(np.float32)
    (dx, dy), match = cv2.phaseCorrelate(a, b, cv2.createHanningWindow(a.shape[::-1], cv2.CV_32F))
    return dx * 4, dy * 4, match


def view_matches(dx, dy, match):
    return match >= MIN_MATCH and abs(dx) <= MAX_SHIFT and abs(dy) <= MAX_SHIFT


class Segmenter:
    def __init__(self):
        import torch
        from transformers import Sam2Model, Sam2Processor

        self.torch = torch
        self.processor = Sam2Processor.from_pretrained(MODEL)
        self.model = Sam2Model.from_pretrained(MODEL).to("cuda").eval()

    def __call__(self, colour, box):
        """Returns a frame-sized mask for one box prompt."""
        import cv2
        import numpy as np
        from PIL import Image

        height, width = colour.shape[:2]
        x0 = max(0, int(box[0]) - CROP_MARGIN)
        y0 = max(0, int(box[1]) - CROP_MARGIN)
        x1 = min(width, int(box[2]) + CROP_MARGIN)
        y1 = min(height, int(box[3]) + CROP_MARGIN)
        rgb = cv2.cvtColor(colour[y0:y1, x0:x1], cv2.COLOR_BGR2RGB)
        prompt = [[[float(box[0] - x0), float(box[1] - y0), float(box[2] - x0), float(box[3] - y0)]]]
        inputs = self.processor(images=Image.fromarray(rgb), input_boxes=prompt, return_tensors="pt").to("cuda")
        with self.torch.inference_mode():
            output = self.model(**inputs, multimask_output=True)
        masks = self.processor.post_process_masks(output.pred_masks.cpu(), inputs["original_sizes"])[0]
        masks = masks.squeeze().numpy() > 0
        best = int(np.argmax(output.iou_scores.cpu().squeeze().numpy()))
        full = np.zeros((height, width), np.uint8)
        full[y0:y1, x0:x1] = masks[best]
        return full


def history_entry(day):
    entry = {"date": day["date"], "capturedAt": day["capturedAt"], "status": day["status"]}
    if day["status"] == "ok":
        entry["plants"] = {
            key: {k: plant[k] for k in ("heightPx", "widthPx", "areaPx", "coverage")}
            for key, plant in day["plants"].items()
        }
    return entry


def publish(day, image=None):
    SLOPE.mkdir(parents=True, exist_ok=True)
    growth.save_json(SLOPE / (day["date"] + ".json"), day)
    if image is not None:
        growth.save_bytes(SLOPE / (day["date"] + ".jpg"), image)
    days = [json.loads(p.read_text()) for p in sorted(SLOPE.glob("20*.json"))]
    growth.save_json(SLOPE / "history.json", [history_entry(d) for d in days])
    good = [d for d in days if d["status"] == "ok"]
    if good:
        growth.save_json(SLOPE / "latest.json", good[-1])


def measure(camera, segment, wait=time.sleep, clock=lambda: datetime.now(timezone.utc)):
    import cv2

    now = clock()
    first = camera()
    colour, gray = growth.decode(first)
    SLOPE.mkdir(parents=True, exist_ok=True)
    if not REFERENCE.exists():
        growth.save_bytes(REFERENCE, first)
    reference = cv2.cvtColor(growth.decode(REFERENCE.read_bytes())[0], cv2.COLOR_BGR2GRAY)
    returned = False
    dx, dy, match = view_shift(gray, reference)
    if not view_matches(dx, dy, match):
        camera.go_to_guard()
        returned = True
        wait(SETTLE_SECONDS)
        first = camera()
        colour, gray = growth.decode(first)
        dx, dy, match = view_shift(gray, reference)
        if not view_matches(dx, dy, match):
            return growth.failed(now, "view_moved", "The saved view could not be restored."), None
    frames = [first]
    for _ in range(FRAME_COUNT - 1):
        wait(FRAME_GAP)
        frames.append(camera())
    readings = {key: [] for key in TREES}
    shifts = []
    for image in frames:
        colour, gray = growth.decode(image)
        dx, dy, match = view_shift(gray, reference)
        if not view_matches(dx, dy, match):
            continue
        ox, oy = round(dx), round(dy)
        shifts.append((ox, oy))
        for key, tree in TREES.items():
            box = tree["box"]
            mask = segment(colour, (box[0] + ox, box[1] + oy, box[2] + ox, box[3] + oy))
            readings[key].append(measure_mask(mask, tree["base"][1] + oy))
    if len(shifts) < 3:
        return growth.failed(now, "view_moved", "Too few frames matched the saved view."), None
    day = {
        "date": growth.dubai_date(now),
        "capturedAt": now.isoformat(),
        "status": "ok",
        "frames": len(shifts),
        "frame": {"width": growth.FRAME_SIZE[0], "height": growth.FRAME_SIZE[1]},
        "view": {"dx": shifts[0][0], "dy": shifts[0][1], "returnedToGuard": returned},
        "plants": {key: summarise(rows) for key, rows in readings.items()},
    }
    return day, frames[0]


class Camera:
    def __init__(self, ha):
        self.ha = ha

    def __call__(self):
        growth.SNAPSHOT = SNAPSHOT
        return self.ha.snapshot()

    def go_to_guard(self):
        growth.GUARD_GO_TO = GUARD_GO_TO
        self.ha.go_to_guard()


def main():
    if growth.measured_today(SLOPE):
        print("Already measured today.")
        return 0
    ha = growth.HomeAssistant(json.loads(growth.HA_CONFIG.read_text()))
    try:
        day, image = measure(Camera(ha), Segmenter())
    except Exception as error:
        day, image = growth.failed(datetime.now(timezone.utc), "error", type(error).__name__ + ": " + str(error)[:200]), None
    finally:
        try:
            ha.close()
        except OSError:
            pass
    publish(day, image)
    print(json.dumps({k: v for k, v in day.items() if k != "plants"}))
    for key, plant in day.get("plants", {}).items():
        print(key, {k: v for k, v in plant.items() if k != "outline"})
    return 0 if day["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
