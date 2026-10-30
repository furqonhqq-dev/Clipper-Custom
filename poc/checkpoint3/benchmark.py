#!/usr/bin/env python3
"""C3A: Windows headless 30Hz pacing experiment (not interactive playback).
Engine A: persistent FFmpeg rawvideo pipe with two-layer compositing.
Engine B: native libopenshot Timeline::GetFrame, in separate C++ harness.
Audio streams exist in inputs but are NOT played or synchronized here.
"""
import argparse
import json
import math
import platform
import subprocess
import time
from pathlib import Path

FPS = 30
COUNT = 120
SCENARIOS = ((640, 360), (1920, 1080))


def run(*args, timeout=180):
    command = [str(x) for x in args]
    p = subprocess.run(command, text=True, capture_output=True, timeout=timeout)
    if p.returncode:
        raise RuntimeError(" ".join(command) + "\n" + p.stderr[-4000:])


def generate(root):
    for w, h in SCENARIOS:
        directory = root / f"{w}x{h}"
        directory.mkdir(parents=True, exist_ok=True)
        for name, visual, hz in (
            ("background.mp4", f"testsrc2=size={w}x{h}:rate=30:duration=4", 440),
            ("overlay.mp4", f"color=c=red:s={w}x{h}:r=30:d=4", 660),
        ):
            run("ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                "-f", "lavfi", "-i", visual,
                "-f", "lavfi", "-i", f"sine=frequency={hz}:sample_rate=48000:duration=4",
                "-t", "4", "-c:v", "mpeg4", "-q:v", "6",
                "-pix_fmt", "yuv420p", "-c:a", "aac",
                str(directory / name))


def pct(values, percent):
    data = sorted(values)
    idx = (len(data) - 1) * percent / 100
    lo, hi = math.floor(idx), math.ceil(idx)
    return round(data[lo] + (data[hi] - data[lo]) * (idx - lo), 4)


def read_exact(stream, size):
    chunks = []
    remaining = size
    while remaining:
        data = stream.read(remaining)
        if not data:
            raise RuntimeError(f"Truncated rawvideo stream, {remaining} bytes missing")
        chunks.append(data)
        remaining -= len(data)
    return b"".join(chunks)


def benchmark_ffmpeg(root, w, h):
    directory = root / f"{w}x{h}"
    filtergraph = (
        "[0:v]format=yuv420p[bg];"
        "[1:v]format=rgba,colorchannelmixer=aa=0.5[ov];"
        "[bg][ov]overlay=0:0:shortest=1:format=auto,format=yuv420p[v]"
    )
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
        "-i", str(directory / "background.mp4"),
        "-i", str(directory / "overlay.mp4"),
        "-filter_complex", filtergraph, "-map", "[v]", "-frames:v", str(COUNT),
        "-an", "-pix_fmt", "yuv420p", "-f", "rawvideo", "pipe:1"
    ]
    # Persistent FFmpeg process. First frame is pre-read as warmup.
    # FFmpeg stdout transfer and Python copy are included in timed work.
    size = w * h * 3 // 2
    with (directory / "ffmpeg-stderr.log").open("wb") as log:
        proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=log, bufsize=0)
        try:
            first = read_exact(proc.stdout, size)
            late, work = [], []
            missed, checksum = 0, 0
            period = 1 / FPS
            start = time.perf_counter()
            for i in range(COUNT):
                deadline = start + i * period
                remaining = deadline - time.perf_counter()
                if remaining > 0:
                    time.sleep(remaining)
                before = time.perf_counter()
                frame = first if i == 0 else read_exact(proc.stdout, size)
                if len(frame) != size:
                    raise RuntimeError("Wrong frame size")
                checksum += frame[0]
                end = time.perf_counter()
                work.append((end - before) * 1000)
                delay = max(0.0, (end - deadline) * 1000)
                late.append(delay)
                if delay > period * 1000:
                    missed += 1
            wall_ms = (time.perf_counter() - start) * 1000
            proc.stdout.close()
            exit_code = proc.wait(timeout=120)
            if exit_code:
                raise RuntimeError(f"FFmpeg returned {exit_code}; see ffmpeg-stderr.log")
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait(timeout=30)
    result = {
        "engine": "FFmpeg-persistent-CLI-rawvideo-pipe",
        "scenario": f"{w}x{h}",
        "frames_requested": COUNT,
        "frames_delivered": COUNT,
        "target_fps": FPS,
        "wall_ms": round(wall_ms, 4),
        "effective_fps": round(COUNT * 1000 / wall_ms, 4),
        "frame_decode_p50_ms": pct(work, 50),
        "frame_decode_p95_ms": pct(work, 95),
        "delivery_lateness_p95_ms": pct(late, 95),
        "late_deadlines_over_one_frame": missed,
        "pixel_checksum": checksum,
        "timing_scope": "headless persistent FFmpeg pipe + rawvideo transfer + Python copy; first frame pre-read; no UI/audio/GPU/IPC"
    }
    (directory / "a.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


def validate(root):
    report = {
        "checkpoint": "C3A: headless 30Hz pacing diagnostics",
        "platform": platform.platform(),
        "engine_selected": False,
        "not_proven": [
            "visible interactive realtime preview", "equivalent per-frame overhead",
            "equal seek/scrubbing implementation", "audio playback or A/V drift",
            "Tauri/Rust IPC", "GPU utilization", "production performance",
            "user laptop performance", "hardware-accelerated decoding"
        ],
        "comparison_caution": (
            "A transfers full YUV420p frames through a pipe to Python, "
            "B returns native frame pixels in-process. Pacing metrics are "
            "diagnostic only; do not rank engines as equivalent or select one."
        ),
        "scenarios": {},
    }
    all_complete = True
    for w, h in SCENARIOS:
        label = f"{w}x{h}"
        results = {}
        for key in ("a", "b"):
            path = root / label / f"{key}.json"
            result = json.loads(path.read_text(encoding="utf-8"))
            complete = (
                result["scenario"] == label
                and result["frames_requested"] == COUNT
                and result["frames_delivered"] == COUNT
                and result["wall_ms"] > 0
                and result["pixel_checksum"] >= 0
                and result["late_deadlines_over_one_frame"] >= 0
            )
            all_complete &= complete
            results[key] = {
                **result,
                "frames_complete": complete,
                "meets_24fps_delivery_proxy": (
                    result["effective_fps"] >= 24
                    and result["late_deadlines_over_one_frame"] <= COUNT // 10
                ),
            }
        report["scenarios"][label] = results
    report["passed_data_integrity"] = bool(all_complete)
    report["passed_realtime_preview"] = False
    root.mkdir(parents=True, exist_ok=True)
    (root / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    if not all_complete:
        raise SystemExit("C3A data integrity failed")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=("generate", "a", "validate"))
    parser.add_argument("--output", default="poc-results/checkpoint3")
    args = parser.parse_args()
    root = Path(args.output).resolve()
    if args.stage == "generate":
        generate(root)
    elif args.stage == "a":
        for w, h in SCENARIOS:
            benchmark_ffmpeg(root, w, h)
    else:
        validate(root)


if __name__ == "__main__":
    main()
