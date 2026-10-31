# Checkpoint 3C1 — Interactive Windows Preview Lab (experimental)

## Scope

This milestone adds a **separately installable Windows Tauri/WebView2 preview
prototype**, based on the v0.1 application but built ONLY on branch
`poc/v0.2.0-engine-comparison`.

**Do not merge into main or replace v0.1.** The installer uses a distinct
product name and application identifier
(`OpenClipper C3C Preview Lab` / `dev.openclipper.custom.previewlab`).

### Implemented

- A separate navigation page **Preview Lab C3C**; the existing v0.1
  "Buat Klip" import screen is preserved.
- Two independent local video import controls; two HTML video elements
  visually composited using a 50% overlay with a user-controlled opacity
  slider. Source audio is from **video dasar only**; overlay is muted.
- Play, pause, range-slider seek/scrub, timeline position and duration.
- Overlay-to-base **video clock difference**, with best-effort correction
  when >80 ms. This is NOT measured audio/video synchronization.
- Browser-reported frame counts/drops and a rough requestVideoFrameCallback
  FPS estimate. Browser quality counters are not hardware profiler data.
- Session seek P50/P95 from UI seek requests whose two seeked events
  completed. Superseded requests are not counted; results are not
  comparable with native C3B timings.
- Tauri/Rust command `c3c_process_metrics` reads the Windows host
  **application process** CPU and working-set RAM. The first CPU sample
  is zero. It does not aggregate WebView2 child processes, GPU or power.
- JS unit tests, browser UI smoke, Rust Windows compile and isolated
  NSIS installer build via GitHub Actions workflow
  `.github/workflows/poc-checkpoint3c.yml`.

### NOT implemented or proven

- Neither native FFmpeg Engine A nor native libopenshot Engine B is
  connected to this preview. The WebView2/HTMLMediaElement decoder
  is a third, **temporary UI prototyping path**, not an engine selection.
- No audio mixing, audio timeline, A/V drift measurement, waveform,
  cancellation queue, timeline clips/trims, editor canvas editing,
  export, native frame-to-UI transport or project persistence.
- No automated real-user Windows desktop playback validation.
  Browser tests run in Chromium; real WebView2 testing requires
  installing the separate Windows prototype.
- No GPU/power profiling, no real laptop CPU/RAM characterization,
  no validated 1080p playback FPS, no preview/export parity, no
  libopenshot distribution or license audit completion.

### Windows manual test checklist

1. Install the **experimental C3C Preview Lab** artifact, not the old
   v0.1 installer. Both should be independently installed.
2. Navigate to **Preview Lab C3C** and import two local 1080p H.264 MP4
   files of equal or similar duration.
3. Play for 30 seconds; note browser dropped frames, approximate FPS,
   CPU/RAM, video clock drift and correction count.
4. Pause and drag the timeline to new and repeated positions. Note
   P50/P95 and visually confirm frame correctness.
5. Change overlay opacity 0–100% and toggle overlay visibility.
6. Repeat with 640x360 clips. Report playback failures or media
   protocol errors; do not assume all codecs/paths work in WebView2.

### Next: C3C2 (not started)

Implement a native frame adapter behind Tauri/Rust, with persistent
FFmpeg and libopenshot backends, matching frame transport, bounded
request queue and cancellation, actual 1080p visible playback, A/V
clocking, CPU/RAM/GPU profiling and licensing review.

**Final engine selection remains NO_ENGINE_SELECTED.**
