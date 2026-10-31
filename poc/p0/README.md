# OpenClipper Custom P0 — Clip Finder (Windows experimental)

## Product goal (locked)

**One long video in -> local AI transcribes -> candidate moments -> ranked cuts -> suggested titles -> preview and selection.** Longer-term: automatic framing, subtitles, batch rendering and publication. Those longer-term items are NOT done by this P0-01 milestone.

**Branch:** `feat/p0-clip-finder-mvp`, branched from C3C2 experimental code. `main` and `feat/openclipper-v0.1.0` remain unchanged.  
**Installer identity:** `dev.openclipper.custom.p0lab`, version 0.3.0 experimental.  
**Code acceptance is not Windows validation.** Run the dedicated GitHub Actions workflow and perform Windows manual tests.

## What P0-01 *actually* implements

1. Parse real timestamped SRT and WebVTT files locally, including simple multiline subtitles.
2. Generate 15–65 second candidate windows from actual subtitle segments and their source timestamps. Rank the windows with a deterministic, inspectable **rule-based text score** (not a trained model, not an AI confidence score or a virality prediction).
3. Suggest a title using a phrase from the source transcript; allow the user to edit it. Show actual caption excerpt, score, reason and start/end timestamps. Suppress heavy overlap across suggestions.
4. Select candidate checkboxes (in-session only) and preview the actual range inside a user-chosen local video. No output clips are rendered.
5. Optional **real offline automatic transcription adapter** on Windows: user explicitly picks a long video, `ffmpeg.exe`, `whisper-cli.exe`, and a compatible multilingual ggml `.bin` model, then clicks Start. Rust asynchronously converts audio to mono 16 kHz WAV, runs whisper.cpp locally to produce a real SRT file, deletes temporary WAV/SRT, and loads the transcript into the ranking engine.
6. No upload or remote API. Tool executables are launched without a shell; model and tools must be provided by the user and are not downloaded by this build.
7. Unit tests for parser/ranking, Chromium browser smoke for transcribed-file workflow, and isolated Windows Tauri NSIS build workflow.

## What remains before P0 can be marked complete

- Beginner-ready **one-click dependency/model setup and verification** with pinned, verified releases, licensing and safe updates (no manual executable selection).
- Real Windows validation of `ffmpeg.exe` and `whisper-cli.exe` integration with Indonesian podcasts across 10/30/120 minute input files. Progress reporting, cancellation, retry, resume and source storage.
- Smarter semantic ranking using a tested **local multilingual LLM** plus topical boundaries/hook detection, clip quality evaluation, diarization, language detection accuracy and deduplication beyond text heuristics.
- Ensure **one input video is enough** without separately uploading caption files or selecting external tools. SRT import can remain an advanced fallback.
- Source YouTube workflow (authorization, terms, rights), quality/privacy defaults, and cross-device safe performance.
- Editing, Smart Framing, batch render, downloadable video files and publication are P1+; NOT claimed here.

## Windows manual QA

1. Start P0 experiment from its own installer; no need to uninstall v0.1 or C3C2.
2. Open **Cari Kandidat**. Pick a sample SRT/VTT of at least ~1 minute, matched to a long local video.
3. Click **Cari Kandidat**. Verify returned cards contain real source excerpts, nonoverlapping timestamps, score, reasons and editable titles. No fabricated candidate counts when the file is malformed.
4. Open a candidate in the preview; verify playback jumps to its start and stops near the selected end. Candidate times must match the actual source video.
5. If `ffmpeg.exe`, `whisper-cli.exe` and a valid Whisper ggml multilingual model are installed, expand the **Transkripsi Otomatis AI Lokal** panel. Select the source video and all three tool files. Click **Mulai Transkripsi AI Lokal**, inspect SRT-derived candidates. Start with a short video, then longer videos.
6. Verify the application remains responsive during AI processing. This first adapter is NOT cancellable; do not test with an hours-long video until short transcription succeeds.
7. No data should be sent to a cloud service; temporary extracted WAV should be removed at the end of the command. Check %TEMP% for exceptional cleanup failures.

## Implementation design

`src/modules/p0-candidate-engine.js`: pure parser and ranking; no external AI, no video processing or I/O.  
`src/modules/p0-clip-workspace.js`: click-based desktop/browser UI and user-selected temporary blob URLs.  
`src-tauri/src/p0_local_transcription.rs`: Windows Rust backend shell-free FFmpeg/whisper adapter.  
`.github/workflows/p0-clip-finder.yml`: Windows CI, browser regressions and experimental NSIS artifact.

**Score limitations:** Text-rich or question-like passages may rank high even if they are boring to watch; this early ranker is a deterministic starting point for QA, not the intended final semantic AI Clip Finder.

**Provenance:** whisper-cli output options `-osrt`, `-of`, `-l auto`, and input requirements follow upstream `ggml-org/whisper.cpp` documentation. FFmpeg's mono 16 kHz 16-bit WAV conversion is the supported input preparation route.

**Never merge P0 into main automatically.** Native FFmpeg vs libopenshot preview engine comparison is still unresolved, and current preview is temporary WebView2.
