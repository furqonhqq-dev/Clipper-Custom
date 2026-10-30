#!/usr/bin/env python3
"""Guardrail: no engine selection until both render + preview benchmarks exist."""
import json
from pathlib import Path

root = Path("poc-results")
a_path = root / "engine-a" / "report.json"
b_path = root / "engine-b" / "report.json"
a = json.loads(a_path.read_text(encoding="utf-8")) if a_path.exists() else None
b = json.loads(b_path.read_text(encoding="utf-8")) if b_path.exists() else None
summary = {
    "engine_a_offline_render_smoke": a.get("passed") if a else "NOT_RUN",
    "engine_a_realtime_preview": "NOT_TESTED",
    "engine_b_native_render": (
        "TESTED" if b and b.get("render_test_executed") else "NOT_TESTED"
    ),
    "engine_b_realtime_preview": (
        "TESTED" if b and b.get("preview_test_executed") else "NOT_TESTED"
    ),
    "decision": "NO_ENGINE_SELECTED",
    "reason": "P0 realtime preview and comparable native rendering tests are incomplete",
}
root.mkdir(exist_ok=True)
(root / "comparison-status.json").write_text(
    json.dumps(summary, indent=2), encoding="utf-8"
)
print(json.dumps(summary, indent=2))
