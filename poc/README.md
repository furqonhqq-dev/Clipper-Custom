# OpenClipper Custom v0.2.0 — M0 Engine Comparison PoC

Status: **EXPERIMENTAL / NOT A RELEASE**. This branch is based on
`feat/openclipper-v0.1.0` and does not modify the installed v0.1.0 baseline.

## Goal

Compare the feasibility of:

- **A:** FFmpeg/FFprobe for media processing and rendering, with a custom realtime
  preview engine to be prototyped later.
- **B:** libopenshot for native timeline/compositing, accessed via an adapter
  to be prototyped later.

The initial M0 increment deliberately **does not claim** a completed
A-versus-B comparison. A has a synthetic offline composition/render smoke test.
B first had an availability probe, then successfully built and rendered with a
native Windows C++/libopenshot smoke harness in Checkpoint 1. Checkpoint 2
now experiments with two-layer frame extraction, warm native seek calls and
FFmpeg CLI offline baselines; **neither engine has a verified interactive
realtime preview or a Tauri/Rust adapter yet**. See `poc/checkpoint2/README.md`.

## Run A locally

Requires Python 3.11+, FFmpeg and FFprobe on PATH, with FFV1, libx264, AAC,
overlay, amix, and SSIM enabled:

```powershell
python poc/engine-a/ffmpeg_smoke.py --output poc-results/engine-a
```

It generates deterministic 4-second synthetic media, combines two video
sources (overlay) and two audio sources (mix), creates a lossless reference
and an H.264/AAC MP4, checks output streams/duration, and calculates SSIM
against the reference. Outputs `report.json` and media in `poc-results/`.
SSIM compares the *offline reference render* to the encoded MP4; it **does
not** prove that a custom realtime preview matches the export.

Run B feasibility probe:

```powershell
python poc/engine-b/libopenshot_probe.py
```

It reports whether Python bindings/native libraries can be discovered.
Missing Python bindings is not evidence that a C++ libopenshot integration
is impossible. A separate Checkpoint 1 Windows workflow subsequently built
libopenshot and completed a native render. The original probe remains a
historical feasibility check.

A separate GitHub Actions workflow, `PoC v0.2.0 engine comparison
(experimental)`, runs on pushes to this branch and can be invoked manually
once available. Its artifacts contain reports and generated test media.

## P0 gates — must pass before selecting an engine

1. Windows native integration with the existing Tauri/Rust application.
2. Two simultaneous video layers plus image/text overlay.
3. Two audio sources mixed with acceptable sync.
4. Timeline trim, split, move and deterministic timebase.
5. Real preview-to-export visual consistency, tested at reference frames.
6. H.264/AAC MP4 export, progress/cancel/error handling.
7. Licensing and distribution audit for FFmpeg/libopenshot dependencies.
8. No crash or project data corruption in repeat tests.

## P1 performance goals (provisional, same Windows machine)

- UI timeline interaction P95 <= 100 ms.
- 1080p preview seek P95 <= 1.5 s.
- Single-video preview near 30 FPS; two video layers >= 24 FPS with proxy.
- A/V drift <= 80 ms; CFR trim accuracy <= 1 output frame.
- Measure CPU, RAM, seek latency, export speed, and installer size.

All metrics need repeated measurements on the **same** Windows device and
source media. Do not compare a Linux FFmpeg run against an untested Windows
libopenshot implementation.

## Decision rule

All P0 gates pass, then weighted score >= 80/100. Weights: preview/render
consistency 25, preview/seek performance 20, Tauri/Rust integration 15,
multi-track/audio stability 15, Windows licensing/distribution 10,
maintainability 10, size/resources 5. A score cannot override failed P0.

## Next technical increments

1. Verify Windows workflow reports and fix any smoke-test failures.
2. Build a minimal native libopenshot C++/CMake Windows render adapter,
   pin dependencies, audit licensing, and capture the same synthetic output.
3. Prototype custom preview and libopenshot preview with two layers.
4. Add common frame comparison, audio alignment, and seek benchmarks.
5. Publish measured decision report before selecting a production engine.

Do not merge this PoC into `main` or release an installer based on it
without separate approval.
