#!/usr/bin/env python3
"""Checkpoint 1 report. Never report a green build without native render proof."""
import argparse
import json
import subprocess
from pathlib import Path


def inspect_media(path):
    if not path.is_file():
        return {"exists": False}
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries",
             "format=duration:stream=codec_type,codec_name,width,height",
             "-of", "json", str(path)],
            check=True, capture_output=True, text=True, timeout=30)
        return {"exists": True, "bytes": path.stat().st_size,
                **json.loads(result.stdout)}
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        return {"exists": True, "error": str(exc)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default="poc-results/engine-b-native")
    parser.add_argument("--audio-build", default="unknown")
    parser.add_argument("--library-build", default="unknown")
    parser.add_argument("--smoke-build", default="unknown")
    parser.add_argument("--smoke-run", default="unknown")
    parser.add_argument("--assert-pass", action="store_true")
    args = parser.parse_args()
    root = Path(args.dir)
    root.mkdir(parents=True, exist_ok=True)
    video = inspect_media(root / "output.mp4")
    frame = root / "frame.png"
    streams = video.get("streams", [])
    has_video = any(s.get("codec_type") == "video" for s in streams)
    has_audio = any(s.get("codec_type") == "audio" for s in streams)
    duration = float(video.get("format", {}).get("duration", 0))
    checks = {
        "audio_library_built": args.audio_build == "success",
        "libopenshot_built": args.library_build == "success",
        "native_smoke_compiled": args.smoke_build == "success",
        "native_smoke_ran": args.smoke_run == "success",
        "video_stream": has_video,
        "audio_stream": has_audio,
        "duration_approximately_2s": 1.8 <= duration <= 2.2,
        "native_frame_image": frame.is_file() and frame.stat().st_size > 100,
    }
    report = {
        "checkpoint": "M0-C1 native libopenshot Windows build and offline render",
        "not_tested": ["realtime preview", "Tauri/Rust adapter",
                       "H.264 encoding", "clean Windows deployment",
                       "license compliance"],
        "upstream": {
            "libopenshot": "6f63ecae5037ce598acf6a67c4d00d1eea842bb1",
            "libopenshot-audio": "c6d226643ef1fdf9d5e00921eebf3ede0e838a7e"
        },
        "build_steps": {
            "audio": args.audio_build, "libopenshot": args.library_build,
            "native_smoke": args.smoke_build, "render": args.smoke_run,
        },
        "media": video,
        "checks": checks,
        "passed": all(checks.values()),
        "note": "Native render feasibility only; not a production engine decision",
    }
    (root / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    if args.assert_pass and not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
