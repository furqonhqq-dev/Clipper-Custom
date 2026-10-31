import test from "node:test";
import assert from "node:assert/strict";
import { percentile, seekSummary, driftMs, needsResync, displayNumber } from "../src/modules/c3c-metrics.js";

test("C3C1 percentile interpolation and empty samples", () => {
  assert.equal(percentile([], 95), null);
  assert.equal(percentile([100, 10, 50, 20], 50), 35);
  assert.equal(percentile([100, 10, 50, 20], 95), 92.5);
});
test("C3C1 seek samples filter invalid timings", () => {
  assert.deepEqual(seekSummary([10, 20, -1, NaN, 30]), {
    samples: 3, p50Ms: 20, p95Ms: 29, maxMs: 30,
  });
});
test("C3C1 video clock drift correction thresholds", () => {
  assert.equal(driftMs(1, 1.05), 50);
  assert.equal(driftMs(1, 0.85), -150);
  assert.equal(driftMs(NaN, 1), null);
  assert.equal(needsResync(1, 1.05), false);
  assert.equal(needsResync(1, 0.85), true);
  assert.equal(displayNumber(null), "—");
});
