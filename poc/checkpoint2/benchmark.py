#!/usr/bin/env python3
"""C2: deterministic 2-layer inputs, offline FFmpeg baseline, and honest checks.
NOT a custom realtime preview. FFmpeg timings include subprocess startup.
"""
import argparse
import json
import math
import re
import subprocess
import time
from pathlib import Path

FRAMES = (1, 15, 30, 45, 60)
SEEK_FRAMES = (30, 1, 60, 15, 45, 5, 55, 20, 40, 10, 50, 25)


def run(cmd, timeout=180):
    t0 = time.perf_counter()
    r = subprocess.run([str(x) for x in cmd], capture_output=True, text=True,
                       timeout=timeout)
    elapsed = (time.perf_counter() - t0) * 1000
    if r.returncode:
        raise RuntimeError("Failed: " + " ".join(map(str, cmd)) +
                           "\n" + r.stderr[-4000:])
    return r, round(elapsed, 3)


def ffmpeg(*args):
    return ["ffmpeg", "-hide_banner", "-nostdin", "-y", *args]


def inputs(root):
    return ["-i", str(root / "background.mp4"),
            "-i", str(root / "overlay.mp4")]


def filters(include_audio=False, select=False):
    # Same full-frame video dimensions and 50% alpha as native Clip B.
    v = ("[0:v]format=yuv420p[bg];"
         "[1:v]format=rgba,colorchannelmixer=aa=0.5[ov];"
         "[bg][ov]overlay=0:0:shortest=1:format=auto,"
         "format=yuv420p")
    if select:
        numbers = "+".join(f"eq(n\\,{n-1})" for n in FRAMES)
        v += ",select='" + numbers + "'"
    v += "[v]"
    if include_audio:
        v += ";[0:a][1:a]amix=inputs=2:duration=first:normalize=0[a]"
    return v


def generate(root):
    root.mkdir(parents=True, exist_ok=True)
    for name, source, tone in [
        ("background.mp4", "testsrc2=size=640x360:rate=30:duration=2", "440"),
        ("overlay.mp4", "color=c=red:s=640x360:r=30:d=2", "660"),
    ]:
        run(ffmpeg("-loglevel", "error", "-f", "lavfi", "-i", source,
                   "-f", "lavfi", "-i",
                   f"sine=frequency={tone}:sample_rate=48000:duration=2",
                   "-t", "2", "-c:v", "mpeg4", "-q:v", "4",
                   "-pix_fmt", "yuv420p", "-c:a", "aac",
                   str(root / name)))


def a_baseline(root):
    out = root / "a"
    out.mkdir(parents=True, exist_ok=True)
    _, sequential_ms = run(ffmpeg("-loglevel", "error", *inputs(root),
                                "-filter_complex", filters(),
                                "-map", "[v]", "-frames:v", "60",
                                "-an", "-f", "null", "-"))
    _, export_ms = run(ffmpeg("-loglevel", "error", *inputs(root),
                            "-filter_complex", filters(include_audio=True),
                            "-map", "[v]", "-map", "[a]", "-t", "2",
                            "-c:v", "mpeg4", "-q:v", "4",
                            "-pix_fmt", "yuv420p",
                            "-c:a", "aac", "-b:a", "128k",
                            str(out / "export.mp4")))
    run(ffmpeg("-loglevel", "error", *inputs(root),
               "-filter_complex", filters(select=True),
               "-map", "[v]", "-frames:v", str(len(FRAMES)),
               "-fps_mode", "vfr", "-start_number", "1",
               str(out / "selected_%02d.png")))
    for i, frame in enumerate(FRAMES, 1):
        (out / f"selected_{i:02d}.png").rename(out / f"preview_{frame}.png")

    # FFmpeg CLI starts a NEW process for each seek. Not comparable with
    # libopenshot's warm persistent Timeline::GetFrame timings.
    seek_ms = []
    for n in SEEK_FRAMES:
        at = (n - 1) / 30.0
        _, elapsed = run(ffmpeg("-loglevel", "error",
                                "-ss", f"{at:.6f}", "-i",
                                str(root / "background.mp4"),
                                "-ss", f"{at:.6f}", "-i",
                                str(root / "overlay.mp4"),
                                "-filter_complex", filters(),
                                "-map", "[v]", "-frames:v", "1",
                                str(out / f"seek_{n}.png")))
        seek_ms.append(elapsed)
    metrics = {
        "engine": "FFmpeg filtergraph CLI baseline (NOT custom preview)",
        "resolution": "640x360", "frame_count": 60,
        "sequential_wall_ms": sequential_ms,
        "export_ms": export_ms,
        "seek_frame_numbers": list(SEEK_FRAMES),
        "seek_ms": seek_ms,
        "seek_type": "cold CLI process startup + input seek + composite",
    }
    (out / "timings.json").write_text(json.dumps(metrics, indent=2),
                                      encoding="utf-8")


def probe(path):
    r, _ = run(["ffprobe", "-v", "error", "-show_entries",
                "format=duration:stream=codec_type,codec_name,width,height",
                "-of", "json", str(path)])
    return json.loads(r.stdout)


def ssim(first, second):
    r, _ = run(ffmpeg("-loglevel", "info", "-i", str(first), "-i", str(second),
                      "-filter_complex", "[0:v][1:v]ssim",
                      "-an", "-f", "null", "-"))
    values = re.findall(r"All:([0-9.]+)", r.stderr)
    if not values:
        raise RuntimeError("No SSIM metric in FFmpeg output")
    return float(values[-1])


def extract_export_frames(folder):
    for n in FRAMES:
        run(ffmpeg("-loglevel", "error", "-i", str(folder / "export.mp4"),
                   "-vf", f"select=eq(n\\,{n-1})",
                   "-frames:v", "1", str(folder / f"export_{n}.png")))


def percentile(values, p):
    sorted_values = sorted(values)
    rank = (len(sorted_values) - 1) * p / 100
    low = int(math.floor(rank))
    high = int(math.ceil(rank))
    return round(sorted_values[low] * (high - rank) +
                 sorted_values[high] * (rank - low), 3) if low != high else round(sorted_values[low], 3)


def validate(root):
    result = {
        "checkpoint": "M0-C2: offline two-layer frame extraction and seek",
        "platform": __import__("platform").platform(),
        "scope": "CI Windows x64, 640x360, 30fps, 2 seconds, two video/audio sources",
        "not_proven": [
            "interactive realtime playback", "A custom preview engine",
            "hardware GPU acceleration", "1080p preview", "Rust/Tauri integration",
            "audio-video synchronization drift", "equivalent A/B seek timing",
            "production readiness"
        ],
        "comparability_note": "A uses cold FFmpeg CLI process seeks; B uses a warm persistent native timeline. Do not rank seek times as equal conditions.",
        "engines": {},
        "cross_engine_preview_ssim": {},
    }
    for engine in ("a", "b"):
        folder = root / engine
        timings = json.loads((folder / "timings.json").read_text(encoding="utf-8"))
        extract_export_frames(folder)
        metadata = probe(folder / "export.mp4")
        streams = metadata.get("streams", [])
        video = next((x for x in streams if x.get("codec_type") == "video"), None)
        audio = next((x for x in streams if x.get("codec_type") == "audio"), None)
        duration = float(metadata.get("format", {}).get("duration", 0))
        parity = {str(n): round(ssim(folder / f"preview_{n}.png",
                                     folder / f"export_{n}.png"), 5)
                  for n in FRAMES}
        checks = {
            "video_640x360": bool(video and video.get("width") == 640 and
                                  video.get("height") == 360),
            "audio_stream": audio is not None,
            "duration_2s": 1.8 <= duration <= 2.2,
            "all_preview_images": all((folder / f"preview_{n}.png").is_file()
                                      for n in FRAMES),
            "all_preview_export_ssim_ge_0_80": all(x >= 0.80 for x in parity.values()),
            "60_frame_benchmark": timings.get("frame_count") == 60,
            "12_seek_samples": len(timings.get("seek_ms", [])) == 12,
        }
        result["engines"][engine] = {
            "engine": timings["engine"],
            "video_codec": video.get("codec_name") if video else None,
            "audio_codec": audio.get("codec_name") if audio else None,
            "duration_seconds": duration,
            "offline_sequential_wall_ms": timings["sequential_wall_ms"],
            "offline_export_ms": timings["export_ms"],
            "seek_p50_ms": percentile(timings["seek_ms"], 50),
            "seek_p95_ms": percentile(timings["seek_ms"], 95),
            "seek_method": timings.get("seek_type",
                                     "warm native Timeline::GetFrame"),
            "preview_vs_export_ssim": parity,
            "checks": checks,
            "passed": all(checks.values()),
        }
    for n in FRAMES:
        result["cross_engine_preview_ssim"][str(n)] = round(
            ssim(root / "a" / f"preview_{n}.png",
                 root / "b" / f"preview_{n}.png"), 5)
    result["passed"] = all(x["passed"] for x in result["engines"].values())
    result["engine_selected"] = False
    (root / "report.json").write_text(json.dumps(result, indent=2),
                                      encoding="utf-8")
    print(json.dumps(result, indent=2))
    if not result["passed"]:
        raise SystemExit("Checkpoint 2 offline tests failed; see report.json")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=["generate", "a", "validate"])
    parser.add_argument("--output", default="poc-results/checkpoint2")
    args = parser.parse_args()
    root = Path(args.output).resolve()
    if args.stage == "generate":
        generate(root)
    elif args.stage == "a":
        a_baseline(root)
    else:
        validate(root)


if __name__ == "__main__":
    main()
