# Checkpoint 3 — Preview and timeline responsiveness

## Status: C3A/C3B Windows passed; C3C1 experimental UI submitted, Windows CI pending

The user approved proceeding after Checkpoint 2. Changes are confined to
`poc/v0.2.0-engine-comparison`. No merge into `main`, no replacement of
the v0.1.0 Windows application, and no final engine decision.

### C3A — Headless paced frame delivery (implemented)

Workflow: `.github/workflows/poc-checkpoint3.yml`.

For each of 640x360 and 1920x1080:
- Generate identical 4-second, 30 FPS synthetic MP4 inputs with two video
  tracks and distinct AAC audio streams.
- Engine A: launch one persistent FFmpeg filtergraph and stream composed
  YUV420p frames through a pipe into a Python 30 Hz paced consumer.
- Engine B: native libopenshot C++ timeline with two layers, 30 Hz paced
  `GetFrame` / `GetPixels` calls.
- Record delivered frame count, effective FPS, per-frame work p50/p95,
  p95 deadline lateness, and deadlines missed by more than one frame.
- Produce `poc-results/checkpoint3/report.json` in the workflow artifact.

**Green GitHub Actions means the harness ran and returned all 120 frames
for both engines and resolutions. It does NOT automatically mean 24+ FPS.**
The report separately contains `meets_24fps_delivery_proxy`, which may
be false without failing the workflow. Inspect this field explicitly.

**Not an apples-to-apples performance ranking:** A pays the cost of
transferring complete YUV frames over stdout and copying them in Python,
while B returns in-process native pixels. A also pre-reads its first
frame; B warms up the timeline. Both are CPU-oriented and offscreen.
They do not display video to a user. Both input files contain AAC
audio, but neither harness plays or synchronizes audio.

### C3B — Native random seek/scrub prototype (implemented; Windows CI passed)

Workflow: `.github/workflows/poc-checkpoint3b.yml`.

- Reuse C3A's identical 4-second, 30 FPS synthetic inputs at 640x360
  and 1920x1080.
- Engine A: **persistent native FFmpeg C++ libavformat/libavcodec**
  contexts; seek with `av_seek_frame`, flush, decode until requested
  timestamp, convert both frames to RGB24 and blend 50% on CPU.
  This is a new prototype, not the finished custom preview engine.
- Engine B: **persistent libopenshot C++ Timeline**, request the same
  frame indices, convert RGBA to RGB24, and compute a sampled pixel hash.
- Both run identical 12-frame random scripts twice in one process.
  The first pass is **not a cold-cache benchmark**; the repeat pass
  measures behavior with caches and filesystem state already warmed.
- Record p50/p95/max request latency for each pass, repeat hash
  determinism, FFmpeg PTS accuracy, and sample PPM images.
- Compare a subset of images with SSIM as a **diagnostic**, not a
  cross-engine visual equivalence claim.

**Green CI means data-integrity gates passed**, not that interactive
scrubbing is ready or that either engine meets a UI responsiveness target.
The engines still have different compositors, decoder caches and memory
paths; results must be interpreted with these caveats.

Still not implemented: real UI seek interaction, user-triggered request
cancellation, true cold-cache runs, equal cache-policy experiments,
A/V playback sync, GPU/CPU/RAM profiling, Tauri/Rust adapter, Windows
installer and a final engine selection.

### C3C1 — Interactive Tauri/WebView2 preview lab (implemented; CI pending)

See `poc/checkpoint3c/README.md` for scope and Windows manual QA.

- Isolated navigation page with two browser-decoded video layers, playback,
  pause, timeline scrubbing, overlay opacity and visibility.
- UI reports browser frame counts/drops, seek P50/P95 and video-to-video
  clock drift, not actual audio/video drift.
- Windows-only Tauri/Rust IPC reports **host process** CPU and RAM.
- A separate experimental NSIS identity avoids replacing working v0.1.
- Windows CI builds installer and runs JS/browser tests. Manual WebView2
  playback at 1080p is still unverified.

**Not native Engine A/B:** FFmpeg and libopenshot remain unconnected to
the UI. Browser video is only a temporary prototyping path. No engine
has been selected.

### C3C2 — Native preview, profiling and licensing (NOT implemented)

- Connect native FFmpeg and libopenshot preview adapters to Tauri/Rust.
- Present 24/30 FPS target, dropped frames and actual A/V drift.
- Measure CPU, GPU, RAM and power on the user's real laptop.
- Validate responsive seek cancellation, two-layer frame correctness,
  preview/export parity, Windows packaging and dependency licenses.

### Gate

Checkpoint 3 is **not complete** until C3C2 tests are implemented,
executed and evaluated. C3A is only the first measurable milestone.
The final engine selection remains `NO_ENGINE_SELECTED`.
