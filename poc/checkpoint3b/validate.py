#!/usr/bin/env python3
"""Checkpoint 3B: validate two persistent native seek harnesses, no winner chosen."""
import json
import platform
import re
import subprocess
from pathlib import Path

SCENARIOS = ("640x360", "1920x1080")
SCRIPT = (60, 1, 118, 30, 90, 15, 105, 45, 75, 10, 110, 55)
SSIM_FRAMES = (1, 30, 60, 90, 118)


def ssim(path_a, path_b):
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-i", str(path_a),
         "-i", str(path_b), "-filter_complex", "[0:v][1:v]ssim",
         "-frames:v", "1", "-an", "-f", "null", "-"],
        capture_output=True, text=True, timeout=90,
    )
    if proc.returncode:
        raise RuntimeError("SSIM error: " + proc.stderr[-2500:])
    matches = re.findall(r"All:([0-9.]+)", proc.stderr)
    if not matches:
        raise RuntimeError("No SSIM result: " + proc.stderr[-1500:])
    return float(matches[-1])


def validate_engine(folder, key, resolution):
    result = json.loads((folder / f"{key}.json").read_text(encoding="utf-8"))
    measurements = result["measurements"]
    first, repeat = measurements[:len(SCRIPT)], measurements[len(SCRIPT):]
    check = {
        "correct_resolution": result["scenario"] == resolution,
        "persistent_process": result["persistent_process"] is True,
        "24_requests": len(measurements) == 2 * len(SCRIPT),
        "matching_frame_order": (
            [x["frame"] for x in first] == list(SCRIPT)
            and [x["frame"] for x in repeat] == list(SCRIPT)
        ),
        "all_nonnegative_latencies": all(x["latency_ms"] >= 0 for x in measurements),
        "repeat_pixel_hash_identical": (
            [x["pixel_hash"] for x in first]
            == [x["pixel_hash"] for x in repeat]
        ),
        "multiple_distinct_frames": len({x["pixel_hash"] for x in first}) >= 4,
        "all_ppm_samples_exist": all(
            (folder / f"frame_{n}.ppm").is_file() for n in SCRIPT
        ),
    }
    if key == "a":
        check["ffmpeg_frame_pts_within_one_frame"] = all(
            0 <= x["timestamp_error_ms"] <= 34.0 for x in measurements
        )
    return {
        "engine": result["engine"],
        "first_pass": result["passes"]["first"],
        "repeat_pass": result["passes"]["repeat"],
        "checks": check,
        "passed_integrity": all(check.values()),
        "sample_count": len(measurements),
    }


def main():
    root = Path("poc-results/checkpoint3b")
    report = {
        "checkpoint": "M0-C3B persistent native random seek and scrubbing",
        "platform": platform.platform(),
        "engine_selected": False,
        "benchmark_is_realtime_ui": False,
        "comparison_notes": [
            "Both run persistent native Windows processes on the same input files and same seek order.",
            "FFmpeg uses av_seek_frame, codec flush, decode, swscale RGB24 and CPU 50% blend.",
            "libopenshot uses persistent Timeline::GetFrame, RGBA to RGB conversion and its own caches.",
            "The first pass is not a cold-start benchmark; the repeat pass can benefit from caching.",
            "Different compositors, caches, and conversion paths still prevent a perfectly controlled comparison.",
            "Cross-engine SSIM is diagnostic, not an equivalence gate or engine selection.",
            "Audio playback, audio/video drift, GUI scrubbing, GPU and Rust/Tauri IPC are NOT tested.",
        ],
        "scenarios": {},
    }
    all_passed = True
    for resolution in SCENARIOS:
        folder = root / resolution
        engines = {
            key: validate_engine(folder / key, key, resolution)
            for key in ("a", "b")
        }
        for value in engines.values():
            all_passed &= value["passed_integrity"]
        comparison = {
            str(frame): round(
                ssim(folder / "a" / f"frame_{frame}.ppm",
                     folder / "b" / f"frame_{frame}.ppm"), 5
            )
            for frame in SSIM_FRAMES
        }
        report["scenarios"][resolution] = {
            "engines": engines,
            "cross_engine_ssim_diagnostic": comparison,
        }
    report["passed_data_integrity"] = bool(all_passed)
    report["passed_interactive_scrubbing"] = False
    report["engine_selected"] = False
    root.mkdir(parents=True, exist_ok=True)
    (root / "report.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, indent=2))
    if not all_passed:
        raise SystemExit("C3B data integrity failed; inspect report.json")


if __name__ == "__main__":
    main()
