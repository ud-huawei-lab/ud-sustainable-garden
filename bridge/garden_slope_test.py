import json
import os
import tempfile
import unittest
from datetime import datetime, timezone

os.environ.setdefault("GARDEN_GROWTH_ROOT", tempfile.mkdtemp())
import garden_growth as growth
import garden_slope as slope

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = None


@unittest.skipIf(cv2 is None, "OpenCV is only installed in the job's environment")
class SlopeTests(unittest.TestCase):
    def setUp(self):
        self.at = datetime(2026, 11, 7, 7, 0, tzinfo=timezone.utc)
        slope.SLOPE.mkdir(parents=True, exist_ok=True)
        for path in slope.SLOPE.glob("*"):
            path.unlink()
        slope.REFERENCE = slope.SLOPE / "reference.jpg"

    def scene(self, shift=0):
        rng = np.random.default_rng(4)
        frame = rng.integers(90, 200, (2160, 3840, 3), dtype=np.uint8)
        frame = cv2.GaussianBlur(frame, (15, 15), 0)
        cv2.circle(frame, (1800 + shift, 1100), 120, (30, 30, 30), -1)
        cv2.rectangle(frame, (2300 + shift, 900), (2500 + shift, 1300), (230, 230, 230), -1)
        return cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 92])[1].tobytes()

    def mask(self, top=1000, left=1600, right=1700):
        mask = np.zeros((2160, 3840), np.uint8)
        mask[top:1300, left:right] = 1
        return mask

    def test_height_runs_from_the_fixed_ground_point(self):
        result = slope.measure_mask(self.mask(), 1256)
        self.assertEqual(result["heightPx"], 256)
        self.assertEqual(result["widthPx"], 100)
        self.assertEqual(result["box"], [1600, 1000, 100, 256])

    def test_debris_below_the_ground_point_is_ignored(self):
        mask = self.mask()
        mask[1280:1300, 1400:1900] = 1
        self.assertEqual(slope.measure_mask(mask, 1256)["widthPx"], 100)

    def test_a_missing_tree_is_an_error_not_a_zero(self):
        with self.assertRaises(ValueError):
            slope.measure_mask(np.zeros((2160, 3840), np.uint8), 1256)

    def test_every_day_uses_the_same_calibrated_prompt(self):
        boxes = []
        slope.publish(
            {
                "date": "2026-11-06",
                "capturedAt": "x",
                "status": "ok",
                "plants": {
                    key: {"heightPx": 1, "widthPx": 1, "areaPx": 1, "coverage": 1, "box": [0, 0, 9999, 9999]}
                    for key in slope.TREES
                },
            }
        )

        class Camera:
            def __call__(inner):
                return self.scene()

            def go_to_guard(inner):
                pass

        def segment(colour, box):
            boxes.append(box)
            return self.mask()

        slope.measure(Camera(), segment, wait=lambda _: None, clock=lambda: self.at)
        calibrated = [tree["box"] for tree in slope.TREES.values()]
        for box in boxes:
            nearest = min(max(abs(a - b) for a, b in zip(box, c)) for c in calibrated)
            self.assertLessEqual(nearest, 3, box)

    def run_day(self, frames):
        calls = {"guard": 0}

        class Camera:
            def __call__(inner):
                return frames.pop(0) if len(frames) > 1 else frames[0]

            def go_to_guard(inner):
                calls["guard"] += 1

        day, image = slope.measure(Camera(), lambda colour, box: self.mask(), wait=lambda _: None, clock=lambda: self.at)
        return day, image, calls

    def test_a_still_view_never_moves_the_camera(self):
        day, _, calls = self.run_day([self.scene()])
        self.assertEqual(day["status"], "ok")
        self.assertEqual(calls["guard"], 0)
        self.assertEqual(day["date"], "2026-11-07")

    def test_a_view_that_cannot_be_restored_saves_no_measurement(self):
        slope.REFERENCE.write_bytes(self.scene())
        day, image, calls = self.run_day([self.scene(420)])
        self.assertEqual(day["status"], "view_moved")
        self.assertEqual(calls["guard"], 1)
        self.assertNotIn("plants", day)
        self.assertIsNone(image)

    def test_a_failed_day_stays_in_history_without_values(self):
        slope.publish(growth.failed(self.at, "error", "No frame."))
        rows = json.loads((slope.SLOPE / "history.json").read_text())
        self.assertEqual(rows[0]["status"], "error")
        self.assertNotIn("plants", rows[0])


if __name__ == "__main__":
    unittest.main()
