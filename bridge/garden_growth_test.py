import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer
from pathlib import Path

os.environ["GARDEN_GROWTH_ROOT"] = tempfile.mkdtemp()
import garden_growth as growth

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = None


def scene(shift=(0, 0), leaf_top=1400):
    """Draws two pots and two plants on a dark night background."""
    dx, dy = shift
    frame = np.full((2160, 3840), 40, np.uint8)
    for key, plant in growth.PLANTS.items():
        (cx, cy), _ = plant["rim"]
        row = plant["pot_row"]
        half = 150
        cv2.rectangle(frame, (cx - half + dx, cy + 40 + dy), (cx + half + dx, row + 120 + dy), 240, -1)
        cv2.rectangle(frame, (cx - 60 + dx, leaf_top + dy), (cx + 60 + dx, cy - 60 + dy), 220, -1)
    return frame


@unittest.skipIf(cv2 is None, "OpenCV is only installed in the job's environment")
class MeasurementTests(unittest.TestCase):
    def test_measures_height_width_and_pot(self):
        plant = growth.PLANTS["left"]
        result = growth.measure_plant(scene(), plant)
        self.assertEqual(result["heightPx"], plant["rim"][0][1] - 1400)
        self.assertEqual(result["widthPx"], 121)
        self.assertEqual(result["potPx"], 301)
        self.assertGreater(result["coverage"], 0.9)

    def test_taller_plant_gives_larger_height(self):
        plant = growth.PLANTS["left"]
        low = growth.measure_plant(scene(leaf_top=1400), plant)
        high = growth.measure_plant(scene(leaf_top=1340), plant)
        self.assertEqual(high["heightPx"] - low["heightPx"], 60)

    def test_measurement_follows_a_small_view_shift(self):
        plant = growth.PLANTS["left"]
        still = growth.measure_plant(scene(), plant)
        shifted = growth.measure_plant(scene((12, -8)), plant, 12, -8)
        self.assertEqual(still["heightPx"], shifted["heightPx"])
        self.assertEqual(still["widthPx"], shifted["widthPx"])

    def test_a_missing_plant_is_an_error_not_a_zero(self):
        with self.assertRaises(ValueError):
            growth.measure_plant(np.full((2160, 3840), 40, np.uint8), growth.PLANTS["left"])

    def test_detects_a_moved_view(self):
        reference = scene()
        dx, dy, match = growth.view_shift(reference, reference)
        self.assertTrue(growth.view_matches(dx, dy, match))
        dx, dy, match = growth.view_shift(scene((200, 0)), reference)
        self.assertFalse(growth.view_matches(dx, dy, match))

    def test_colour_frames_are_not_night_frames(self):
        night = cv2.cvtColor(scene(), cv2.COLOR_GRAY2BGR)
        self.assertTrue(growth.is_night_frame(night))
        day = night.copy()
        day[..., 0] = 200
        day[..., 2] = 40
        self.assertFalse(growth.is_night_frame(day))

    def test_summary_keeps_medians_and_spread(self):
        mask = np.zeros((200, 200), np.uint8)
        mask[50:100, 50:100] = 1
        rows = [
            {"potPx": 300, "heightPx": h, "widthPx": w, "areaPx": 100, "coverage": 0.5, "box": [1, 2, 3, 4], "mask": mask}
            for h, w in [(500, 300), (505, 310), (510, 320)]
        ]
        result = growth.summarise(rows)
        self.assertEqual(result["heightPx"], 505)
        self.assertEqual(result["spreadPx"], {"height": 10, "width": 20})
        self.assertTrue(result["outline"])


class FakeCamera:
    def __init__(self, frames):
        self.frames = list(frames)
        self.guard_calls = 0

    def snapshot(self):
        return self.frames.pop(0) if len(self.frames) > 1 else self.frames[0]

    def go_to_guard(self):
        self.guard_calls += 1


@unittest.skipIf(cv2 is None, "OpenCV is only installed in the job's environment")
class NightRunTests(unittest.TestCase):
    def setUp(self):
        self.at = datetime(2026, 11, 6, 22, 0, tzinfo=timezone.utc)
        growth.REFERENCE.parent.mkdir(parents=True, exist_ok=True)
        growth.REFERENCE.unlink(missing_ok=True)

    def jpeg(self, frame):
        return cv2.imencode(".jpg", cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR), [cv2.IMWRITE_JPEG_QUALITY, 95])[1].tobytes()

    def test_a_still_view_never_moves_the_camera(self):
        camera = FakeCamera([self.jpeg(scene())])
        night, _ = growth.measure(camera, wait=lambda _: None, clock=lambda: self.at)
        self.assertEqual(night["status"], "ok")
        self.assertEqual(night["date"], "2026-11-07")
        self.assertEqual(camera.guard_calls, 0)
        self.assertFalse(night["view"]["returnedToGuard"])

    def test_a_moved_view_returns_to_the_guard_point(self):
        growth.REFERENCE.write_bytes(self.jpeg(scene()))
        camera = FakeCamera([self.jpeg(scene((400, 0))), self.jpeg(scene())])
        night, _ = growth.measure(camera, wait=lambda _: None, clock=lambda: self.at)
        self.assertEqual(night["status"], "ok")
        self.assertEqual(camera.guard_calls, 1)
        self.assertTrue(night["view"]["returnedToGuard"])

    def test_a_view_that_cannot_be_restored_saves_no_measurement(self):
        growth.REFERENCE.write_bytes(self.jpeg(scene()))
        camera = FakeCamera([self.jpeg(scene((400, 0)))])
        night, image = growth.measure(camera, wait=lambda _: None, clock=lambda: self.at)
        self.assertEqual(night["status"], "view_moved")
        self.assertNotIn("plants", night)
        self.assertIsNone(image)


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        growth.ROOT.mkdir(parents=True, exist_ok=True)
        (growth.ROOT / "history.json").write_text("[]")
        (growth.ROOT / "secret.txt").write_text("private")
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), growth.Handler)
        cls.server.token = "t" * 43
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = "http://127.0.0.1:%d" % cls.server.server_port

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def status(self, path, token="t" * 43):
        request = urllib.request.Request(self.base + path, headers={"Authorization": "Bearer " + token})
        try:
            with urllib.request.urlopen(request) as response:
                return response.status
        except urllib.error.HTTPError as error:
            return error.code

    def test_requires_the_token(self):
        self.assertEqual(self.status("/history.json"), 200)
        self.assertEqual(self.status("/history.json", "wrong"), 401)

    def test_serves_fixed_files_only(self):
        self.assertEqual(self.status("/secret.txt"), 404)
        self.assertEqual(self.status("/../secret.txt"), 404)
        self.assertEqual(self.status("/nights/"), 404)


class PublishTests(unittest.TestCase):
    def test_failed_nights_stay_in_history_without_values(self):
        night = growth.failed(datetime(2026, 11, 6, 22, 0, tzinfo=timezone.utc), "view_moved", "Moved.")
        growth.publish(night)
        history = json.loads((growth.ROOT / "history.json").read_text())
        row = next(r for r in history if r["date"] == "2026-11-07")
        self.assertEqual(row["status"], "view_moved")
        self.assertNotIn("plants", row)





class SnapshotRetryTests(unittest.TestCase):
    def camera(self, outcomes):
        ha = growth.HomeAssistant({"ha_url": "http://ha", "ha_username": "u", "ha_password": "p"})
        ha.token = lambda: "t"
        calls = []

        def fake_open(request, timeout):
            calls.append(1)
            outcome = outcomes.pop(0)
            if isinstance(outcome, Exception):
                raise outcome

            class Response:
                def __enter__(self):
                    return self

                def __exit__(self, *args):
                    return False

                def read(self, limit):
                    return outcome

            return Response()

        return ha, calls, fake_open

    def run_snapshot(self, outcomes):
        ha, calls, fake_open = self.camera(outcomes)
        original = growth.urllib.request.urlopen
        growth.urllib.request.urlopen = fake_open
        waits = []
        try:
            return ha.snapshot(wait=waits.append), calls, waits
        finally:
            growth.urllib.request.urlopen = original

    def error(self, code):
        return urllib.error.HTTPError("http://ha", code, "error", {}, None)

    def test_a_server_error_is_retried_until_the_camera_answers(self):
        image, calls, waits = self.run_snapshot([self.error(500), urllib.error.URLError("timed out"), b"jpeg"])
        self.assertEqual(image, b"jpeg")
        self.assertEqual(len(calls), 3)
        self.assertEqual(waits, [growth.SNAPSHOT_GAP] * 2)

    def test_a_refused_request_is_not_retried(self):
        with self.assertRaises(urllib.error.HTTPError):
            self.run_snapshot([self.error(401), b"jpeg"])

    def test_it_gives_up_after_the_last_attempt(self):
        with self.assertRaises(urllib.error.HTTPError):
            self.run_snapshot([self.error(500)] * growth.SNAPSHOT_ATTEMPTS)


class SkipTests(unittest.TestCase):
    def test_a_second_run_skips_a_measured_day(self):
        at = datetime(2026, 11, 18, 22, 0, tzinfo=timezone.utc)
        folder = Path(tempfile.mkdtemp())
        self.assertFalse(growth.measured_today(folder, at))
        (folder / "2026-11-19.json").write_text(json.dumps({"status": "error"}))
        self.assertFalse(growth.measured_today(folder, at))
        (folder / "2026-11-19.json").write_text(json.dumps({"status": "ok"}))
        self.assertTrue(growth.measured_today(folder, at))


if __name__ == "__main__":
    unittest.main()
