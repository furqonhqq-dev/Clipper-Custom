# M0 Checkpoint 2 — two-layer frame/seek experiment (Windows x64)

**EXPERIMENTAL ONLY. Not a production editor, not a full preview engine.**

Goal: exercise two simultaneous video sources and two audio sources
through the *same 640x360, 30fps, 2-second synthetic input media* on the
same Windows GitHub Actions runner.

- **Engine A:** FFmpeg CLI filtergraph, with a two-layer composite,
  60-frame offline decode/composition pass, 12 **cold-process** seek
  samples, PNG reference frames and MPEG-4/AAC export.
  **This is NOT the custom realtime preview implementation.**
- **Engine B:** libopenshot native C++ Timeline, 60 sequential
  `GetFrame()` calls, 12 **warm-timeline** random frame requests,
  PNG reference frames and MPEG-4/AAC export.
  **This is NOT a synchronized playback loop or Tauri/Rust adapter.**

Both capture frames 1, 15, 30, 45 and 60, then compare each engine's
PNG preview frame against its own exported MP4 frame using FFmpeg SSIM.
The initial smoke gate is SSIM >= 0.80 for all five samples. This
is a permissive regression gate, not proof of visually perfect parity.
Cross-engine SSIM is reported but not used to select a winner.

**Important:** A's CLI seeks include starting new FFmpeg processes,
whereas B's seeks reuse a warm native timeline and caches. The seek
numbers are **not apples-to-apples**, and neither demonstrates 24 FPS
realtime playback, low-latency UI interaction, or audio-video drift.
Offline sequential processing is likewise not realtime playback.

Native sources are pinned to the same commits as Checkpoint 1, with
the temporary `Exceptions.h` compatibility fix only in CI.

## Run

Open GitHub Actions workflow
`PoC M0-C2 two-layer frame and seek experiment` and inspect the newest
run. Download artifact `poc-checkpoint2-windows-results`; read
`report.json`, `a/timings.json`, `b/timings.json` and sample PNGs.

## What follows this experiment

1. Fix any C2 failures without touching `main` or the working v0.1.0.
2. Compare actual reference frames and SSIM results.
3. Build persistent **Engine A custom preview decoder/compositor** and
   comparable seek harnesses for A and B.
4. Measure playback clock, 24+ FPS proxy, 1080p media, audio drift,
   GPU/CPU/RAM, and preview-to-export parity before selecting an engine.

No final engine selection or production release is authorized by this test.
