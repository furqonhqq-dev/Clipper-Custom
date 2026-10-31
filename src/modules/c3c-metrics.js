// C3C1: pure preview diagnostic helpers. Browser video is NOT either native engine.
export function percentile(values, percentileRank) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const position = (ordered.length - 1) * percentileRank / 100;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return ordered[low] + (ordered[high] - ordered[low]) * (position - low);
}
export function seekSummary(values) {
  const valid = values.filter((value) => Number.isFinite(value) && value >= 0);
  return {
    samples: valid.length,
    p50Ms: percentile(valid, 50),
    p95Ms: percentile(valid, 95),
    maxMs: valid.length ? Math.max(...valid) : null,
  };
}
export function driftMs(masterSeconds, overlaySeconds) {
  if (!Number.isFinite(masterSeconds) || !Number.isFinite(overlaySeconds)) return null;
  return Math.round((overlaySeconds - masterSeconds) * 1000);
}
export function needsResync(masterSeconds, overlaySeconds, toleranceSeconds = 0.08) {
  const drift = driftMs(masterSeconds, overlaySeconds);
  return drift !== null && Math.abs(drift) > toleranceSeconds * 1000;
}
export function displayNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}
