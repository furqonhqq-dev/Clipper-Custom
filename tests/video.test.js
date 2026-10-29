import test from "node:test";
import assert from "node:assert/strict";
import { formatDuration, isVideoName, fileName } from "../src/modules/video.js";
test("durasi video termasuk jam dan metadata tidak valid", () => {
  assert.equal(formatDuration(65.9), "1:05");
  assert.equal(formatDuration(3661), "1:01:01");
  assert.equal(formatDuration(NaN), "—");
  assert.equal(formatDuration(Infinity), "—");
});
test("format video dan path Windows", () => {
  assert.ok(isVideoName("Klip.MP4"));
  assert.ok(!isVideoName("video.exe"));
  assert.equal(fileName("C:\\Video\\klip.mp4"), "klip.mp4");
});
