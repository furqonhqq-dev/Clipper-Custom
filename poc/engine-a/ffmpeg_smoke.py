#!/usr/bin/env python3
"""M0 Engine A smoke PoC: deterministic 2-video/2-audio composite and MP4 validation.

Uses only Python standard library + FFmpeg/FFprobe on PATH.
Does NOT represent a realtime custom preview engine or Windows benchmark.
"""
import argparse
import json
import re
import shutil
import subprocess
import time
from pathlib import Path


def run(args, timeout=180):
    start = time.perf_counter()
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(
            f"Command failed ({result.returncode}): {' '.join(map(str, args))}\n"
            + result.stderr[-3500:]
        )
    return result, round(time.perf_counter() - start, 3)


def probe(path):
    result, _ = run([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate",
        "-of", "json", str(path),
    ])
    return json.loads(result.stdout)


def generate(outdir):
    specs = [
        ("background.mkv", "testsrc2=size=640x360:rate=30:duration=4", ["-c:v", "ffv1"]),
        ("overlay.mkv", "smptebars=size=320x180:rate=30:duration=4", ["-c:v", "ffv1"]),
        ("voice.wav", "sine=frequency=440:sample_rate=48000:duration=4", ["-c:a", "pcm_s16le"]),
        ("music.wav", "sine=frequency=660:sample_rate=48000:duration=4", ["-c:a", "pcm_s16le"]),
    ]
    for filename, source, codec in specs:
        run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
             "-f", "lavfi", "-i", source, *codec, str(outdir / filename)])


def compose(outdir, lossless=False):
    output = outdir / ("reference.mkv" if lossless else "composite.mp4")
    filters = (
        "[0:v]format=yuv420p[bg];"
        "[1:v]scale=200:112,format=yuv420p[ov];"
        "[bg][ov]overlay=x=400:y=24:shortest=1,format=yuv420p[v];"
        "[2:a][3:a]amix=inputs=2:duration=first:normalize=0[a]"
    )
    video_codec = ["-c:v", "ffv1"] if lossless else [
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    ]
    audio_codec = ["-c:a", "pcm_s16le"] if lossless else ["-c:a", "aac", "-b:a", "160k"]
    _, elapsed = run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(outdir / "background.mkv"),
        "-i", str(outdir / "overlay.mkv"),
        "-i", str(outdir / "voice.wav"),
        "-i", str(outdir / "music.wav"),
        "-filter_complex", filters, "-map", "[v]", "-map", "[a]",
        "-t", "4", *video_codec, *audio_codec, str(output),
    ])
    return output, elapsed


def measure_ssim(reference, encoded):
    result, _ = run([
        "ffmpeg", "-hide_banner", "-i", str(reference), "-i", str(encoded),
        "-filter_complex", "[0:v][1:v]ssim", "-an", "-f", "null", "-",
    ])
    matches = re.findall(r"All:([0-9.]+)", result.stderr)
    if not matches:
        raise RuntimeError("No SSIM value in FFmpeg output")
    return float(matches[-1])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="poc-results/engine-a")
    parser.add_argument("--min-ssim", type=float, default=0.95)
    args = parser.parse_args()
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            raise SystemExit(f"Missing required tool: {tool}")
    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    generate(output_dir)
    reference, ref_seconds = compose(output_dir, lossless=True)
    encoded, encode_seconds = compose(output_dir)
    metadata = probe(encoded)
    streams = metadata.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    duration = float(metadata.get("format", {}).get("duration", 0))
    ssim = measure_ssim(reference, encoded)
    checks = {
        "video_h264": bool(video and video.get("codec_name") == "h264"),
        "video_640x360": bool(video and video.get("width") == 640 and video.get("height") == 360),
        "audio_aac": bool(audio and audio.get("codec_name") == "aac"),
        "duration_4s": abs(duration - 4.0) <= 0.15,
        "ssim_threshold": ssim >= args.min_ssim,
    }
    report = {
        "engine": "A — FFmpeg composition/render only",
        "platform": __import__("platform").platform(),
        "scope": "Synthetic offline compositing; not a realtime preview benchmark",
        "reference_render_seconds": ref_seconds,
        "mp4_render_seconds": encode_seconds,
        "output_size_bytes": encoded.stat().st_size,
        "ssim_vs_lossless_reference": ssim,
        "duration_seconds": duration,
        "checks": checks,
        "passed": all(checks.values()),
    }
    (output_dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
