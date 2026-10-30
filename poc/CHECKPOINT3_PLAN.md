# Checkpoint 3 — Preview and timeline responsiveness

## Status: C3A Windows passed; C3B submitted for Windows validation

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

### C3B — Native random seek/scrub prototype (implemented; CI pending)

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

### C3C — Playback, resources and Tauri/Rust integration (NOT implemented)

- Show real 1080p preview in an actual Windows window (not headless CI).
- Present 24/30 FPS target, dropped frames and A/V drift measurements.
- Monitor CPU, GPU, RAM and power on real laptop hardware.
- Connect timeline play/pause/seek commands to Tauri/Rust adapter.
- Check frame accuracy, preview/export parity and Windows packaging.
- Audit libopenshot, libopenshot-audio, Qt, FFmpeg and JUCE licensing
  before any redistribution.

### Gate

Checkpoint 3 is **not complete** until C3B/C3C tests are implemented,
executed and evaluated. C3A is only the first measurable milestone.
The final engine selection remains `NO_ENGINE_SELECTED`.
