import test from "node:test";
import assert from "node:assert/strict";
import { mediaPath, rewritePlaylist } from "./media.js";
test("camera proxy accepts nested LL-HLS segments but rejects traversal and arbitrary resources", () => {
  assert.ok(mediaPath("segment/12.3.m4s"));
  assert.ok(mediaPath("init.mp4"));
  assert.ok(mediaPath("playlist.m3u8"));
  for (const path of [
    "../init.mp4",
    "segment/../../secret.mp4",
    "https://example.com/a.ts",
    "segment/a.exe",
    "segment/%2e%2e/a.ts",
  ])
    assert.ok(!mediaPath(path));
});
test("playlist rewrite preserves nested segment paths and never discloses the upstream stream identifier", () => {
  const base = new URL("https://ha.example/api/hls/private-stream/");
  const text =
    '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-PART:URI="segment/2.1.m4s"\nsegment/2.m4s\n';
  const output = rewritePlaylist(text, base, "trees");
  assert.ok(output.includes("/api/video/trees/segment/2.1.m4s"));
  assert.ok(output.includes("/api/video/trees/init.mp4"));
  assert.ok(!output.includes("private-stream"));
  assert.throws(() =>
    rewritePlaylist("https://other.example/a.ts", base, "trees"),
  );
  assert.throws(() => rewritePlaylist("../other/init.mp4", base, "trees"));
});
