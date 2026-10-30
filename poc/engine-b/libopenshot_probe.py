#!/usr/bin/env python3
"""Engine B feasibility probe. This is NOT a libopenshot rendering benchmark.

The absence of a Python binding does not prove native libopenshot is unusable.
A separate native Windows C++/CMake adapter spike is required before selection.
"""
import ctypes.util
import importlib.util
import json
import platform
from pathlib import Path


def main():
    out = Path("poc-results/engine-b")
    out.mkdir(parents=True, exist_ok=True)
    binding = importlib.util.find_spec("openshot")
    native = ctypes.util.find_library("openshot")
    result = {
        "engine": "B — libopenshot",
        "platform": platform.platform(),
        "python_binding_discoverable": binding is not None,
        "native_library_discoverable": native is not None,
        "render_test_executed": False,
        "preview_test_executed": False,
        "status": "FEASIBILITY_ONLY_NOT_BENCHMARKED",
        "next_step": (
            "Build libopenshot on Windows with a pinned toolchain, "
            "run a native two-layer timeline/render test, validate audio "
            "and DLL deployment, and audit library/FFmpeg licensing."
        ),
        "caveat": (
            "Missing Python bindings or find_library results cannot establish "
            "native C++ integration feasibility or performance."
        ),
    }
    (out / "report.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
