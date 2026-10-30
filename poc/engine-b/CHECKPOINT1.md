# Checkpoint 1 — native libopenshot Windows x64

**Scope:** isolated build feasibility and offline render, NOT a preview
benchmark, NOT a production engine choice, and NOT a Windows installer.

## Source and toolchain

- libopenshot commit: `6f63ecae5037ce598acf6a67c4d00d1eea842bb1`
- libopenshot-audio commit: `c6d226643ef1fdf9d5e00921eebf3ede0e838a7e`
- GitHub Actions: `PoC M0-C1 libopenshot native Windows build`
- Windows x64 runner; MSYS2 MINGW64, GCC C++17, Ninja, CMake, Qt6,
  FFmpeg development libraries, Zlib, JsonCpp
- Builds and installs both libraries into an isolated CI directory,
  then compiles a C++ executable linked against the actual native DLLs.

## What the native executable does

1. Create two synthetic 320x180 MP4 sources with distinct video and audio.
2. Open them as native `openshot::Clip` instances on two layers.
3. Generate a composite frame using `openshot::Timeline::GetFrame`.
4. Export 60 frames using `openshot::FFmpegWriter` to an MP4 file
   (MPEG-4 Part 2 video + AAC audio for broad test availability).
5. Validate that the native output contains video/audio streams, lasts
   about 2 seconds, and includes a generated composite PNG.

**Not tested:** H.264 output, realtime preview, Rust/Tauri IPC,
synchronized playback, production packaging, clean-machine DLL deployment,
and licensing compliance. Success in this workflow is only C1 success.

## Where to read the result

GitHub -> Clipper-Custom -> Actions ->
`PoC M0-C1 libopenshot native Windows build` -> newest run.
Artifact: `poc-engine-b-native-windows-checkpoint1`.

If it fails, inspect the failed job's step and upload the report/log.
Do not assume the library is fundamentally unusable: upstream's
own CI previously disabled Windows x64 builds and may require
toolchain-specific adjustments.

## Licensing blocker to review before distribution

The libopenshot repository identifies libopenshot as
LGPL-3.0-or-later. The checked libopenshot-audio CMake source
contains GPL license language. The transitive JUCE, FFmpeg, Qt, codec,
and other obligations must be audited, including whether a proprietary
application or closed-source distribution is compatible with the chosen
linking model. **Do not redistribute native binaries from this PoC as
an OpenClipper release before legal review.**

Upstream docs:
- https://github.com/OpenShot/libopenshot/blob/develop/doc/INSTALL-WINDOWS.md
- https://github.com/OpenShot/libopenshot/blob/develop/INSTALL.md
- https://github.com/OpenShot/libopenshot-audio
