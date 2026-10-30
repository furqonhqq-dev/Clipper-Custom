# Checkpoint 3 — Preview and timeline responsiveness

## Status: C3A implementation submitted, Windows results pending

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

### C3B — Interactive seek/scrub harness (NOT implemented)

Required before claiming an interactive timeline:
- Persistent FFmpeg decoding and compositing without restarting a CLI
  process for every seek, comparable to native libopenshot timeline seeks.
- Matching random and sequential seek scripts, cold and warm runs,
  1080p assets, frame correctness and cache state.
- Explicitly record p50/p95 seek latency and frame delivery time after
  user scrubbing.

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
