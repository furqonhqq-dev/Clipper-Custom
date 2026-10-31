// Checkpoint C3C2: accessible browser/WebView2 preview prototype, NOT a native engine.
// V1 is independently usable. V2 is optional, muted and composited visually.
import { extensions, formatDuration } from "./video.js";
import { displayNumber, driftMs, needsResync, seekSummary } from "./c3c-metrics.js";

export function mountC3C({ isTauri, invoke }) {
  const $ = (id) => document.getElementById(id);
  const master = $("c3c-base");
  const overlay = $("c3c-overlay");
  const stage = $("c3c-stage");
  const slider = $("c3c-scrub");
  const names = [$("c3c-base-name"), $("c3c-overlay-name")];
  const videos = [master, overlay];
  const urls = [null, null];
  const samples = [];
  let pendingSeek = null;
  let lastPresented = null;
  let frameCount = 0;
  let dropped = 0;
  let playStarted = 0;
  let playFrameStart = 0;
  let syncCorrections = 0;
  let frameCallbackActive = false;

  const baseReady = () => master.readyState >= HTMLMediaElement.HAVE_METADATA &&
    Number.isFinite(master.duration) && master.duration > 0;
  const overlayReady = () => overlay.readyState >= HTMLMediaElement.HAVE_METADATA &&
    Number.isFinite(overlay.duration) && overlay.duration > 0;
  const overlayEnabled = () => overlayReady() && $("c3c-toggle-overlay").checked;
  const total = () => baseReady() ? master.duration : 0;

  function reportStatus(message) {
    $("c3c-status").textContent = message;
  }
  function updateLayout() {
    const layout = $("c3c-layout").value;
    stage.dataset.layout = layout;
    stage.dataset.overlay = overlayEnabled() ? "on" : "off";
    const ratio = $("c3c-ratio").value;
    stage.style.aspectRatio = ratio.replace(":", " / ");
    // Keep portrait/square canvases usable on typical laptop screens.
    stage.style.maxWidth = ratio === "9:16" ? "320px" : ratio === "1:1" ? "520px" : "none";
    const opacity = Number($("c3c-opacity").value) / 100;
    // PiP and split modes should always be legible; transparency is for stacking.
    const stacked = layout === "overlay";
    overlay.style.opacity = stacked ? String(opacity) : "1";
    $("c3c-opacity").disabled = !stacked;
    $("c3c-opacity-value").textContent = stacked ? Math.round(opacity * 100) + "%" : "mode bertumpuk saja";
    $("c3c-layer-tip").textContent = !overlayReady()
      ? "Video tambahan belum dipilih. Video utama tetap bisa diputar."
      : !overlayEnabled()
        ? "Video tambahan disembunyikan; hanya video utama ditampilkan."
        : layout === "pip"
          ? "Video tambahan tampil kecil di sudut agar video utama tetap terlihat."
          : layout === "side" ? "Dua video ditampilkan berdampingan."
          : layout === "stack" ? "Dua video ditampilkan atas dan bawah."
          : "Dua video ditumpuk; atur transparansi untuk melihat video di belakang.";
  }
  function updateControls() {
    const valid = baseReady();
    $("c3c-play").disabled = !valid;
    $("c3c-pause").disabled = !valid;
    slider.disabled = !valid;
    slider.max = valid ? String(total()) : "0";
    $("c3c-duration").textContent = valid ? formatDuration(total()) : "—";
    $("c3c-play").textContent = master.paused ? "▶ Putar" : "▶ Memutar";
    updateLayout();
  }
  function resetCounters() {
    samples.length = 0;
    pendingSeek = null;
    frameCount = 0;
    dropped = 0;
    playStarted = 0;
    playFrameStart = 0;
    syncCorrections = 0;
    lastPresented = null;
    $("c3c-seek").textContent = "—";
    $("c3c-frames").textContent = "0";
    $("c3c-dropped").textContent = "0";
    $("c3c-drift").textContent = "—";
  }
  function load(index, file) {
    master.pause();
    overlay.pause();
    const old = urls[index];
    const url = URL.createObjectURL(file);
    urls[index] = url;
    videos[index].src = url;
    videos[index].load();
    // Revoke the prior user-selected blob only after replacement.
    if (old) URL.revokeObjectURL(old);
    names[index].textContent = file.name;
    resetCounters();
    updateControls();
    reportStatus("Membaca video " + (index === 0 ? "utama" : "tambahan") + "…");
  }
  function choose(index) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = extensions.map((ext) => "." + ext).join(",");
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!extensions.some((ext) => file.name.toLowerCase().endsWith("." + ext))) {
        reportStatus("Format tidak didukung. Pilih video MP4 atau WebM.");
        return;
      }
      load(index, file);
    };
    input.click();
  }
  $("c3c-import-base").onclick = () => choose(0);
  $("c3c-import-overlay").onclick = () => choose(1);

  function finishSeek() {
    if (!pendingSeek || !pendingSeek.done.every(Boolean)) return;
    samples.push(performance.now() - pendingSeek.started);
    if (samples.length > 100) samples.shift();
    pendingSeek = null;
    const stats = seekSummary(samples);
    $("c3c-seek").textContent =
      displayNumber(stats.p50Ms) + " / " + displayNumber(stats.p95Ms) + " ms";
  }

  function seekTo(rawTarget) {
    if (!baseReady()) return;
    const target = Number(rawTarget);
    if (!Number.isFinite(target)) return;
    const position = Math.min(Math.max(0, target), total());
    const seekOverlay = overlayEnabled() && position < overlay.duration;
    pendingSeek = { started: performance.now(), done: [false, !seekOverlay], targets: [position, position] };
    if (Math.abs(master.currentTime - position) < 0.005) pendingSeek.done[0] = true;
    else master.currentTime = position;
    if (seekOverlay) {
      if (Math.abs(overlay.currentTime - position) < 0.005) pendingSeek.done[1] = true;
      else overlay.currentTime = position;
    } else if (overlayReady()) {
      overlay.pause();
    }
    $("c3c-time").textContent = formatDuration(position);
    finishSeek();
  }

  videos.forEach((video, index) => {
    video.addEventListener("loadedmetadata", () => {
      updateControls();
      if (index === 0) reportStatus("Video utama siap. Tekan Putar; video tambahan tidak wajib.");
      else reportStatus("Kedua video siap. Silakan pilih tata letak dan tekan Putar.");
    });
    video.addEventListener("durationchange", updateControls);
    video.addEventListener("error", () => {
      updateControls();
      reportStatus(index === 0
        ? "Video utama tidak dapat dibaca. Coba MP4 H.264/AAC atau WebM."
        : "Video tambahan gagal dibaca. Video utama tetap dapat digunakan.");
    });
    video.addEventListener("seeked", () => {
      if (!pendingSeek || pendingSeek.done[index]) return;
      if (Math.abs(video.currentTime - pendingSeek.targets[index]) <= 0.06) {
        pendingSeek.done[index] = true;
        finishSeek();
      }
    });
  });
  slider.addEventListener("input", () => seekTo(slider.value));

  $("c3c-play").onclick = async () => {
    if (!baseReady()) return;
    if (master.currentTime >= total() - 0.05) seekTo(0);
    overlay.muted = true;
    // Call play() within the click event (user activation) for WebView2.
    const masterPromise = master.play();
    let overlayPromise = null;
    if (overlayEnabled() && master.currentTime < overlay.duration - 0.05) {
      overlay.currentTime = master.currentTime;
      overlayPromise = overlay.play();
    } else overlay.pause();
    try {
      await masterPromise;
      if (overlayPromise) {
        try { await overlayPromise; }
        catch { reportStatus("Video utama diputar; video tambahan gagal diputar."); }
      }
      playStarted = performance.now();
      playFrameStart = frameCount;
      if (!overlayPromise || !overlay.paused)
        reportStatus(overlayPromise ? "Memutar dua video; audio hanya dari video utama." : "Memutar video utama.");
    } catch (error) {
      master.pause();
      overlay.pause();
      reportStatus("Video utama gagal diputar: " + String(error));
    }
    updateControls();
  };
  $("c3c-pause").onclick = () => {
    master.pause();
    overlay.pause();
    updateControls();
    reportStatus("Preview dijeda.");
  };
  master.addEventListener("pause", () => {
    overlay.pause();
    updateControls();
  });
  master.addEventListener("ended", () => {
    overlay.pause();
    updateControls();
    reportStatus("Preview selesai.");
  });
  $("c3c-layout").addEventListener("change", updateLayout);
  $("c3c-ratio").addEventListener("change", updateLayout);
  $("c3c-opacity").addEventListener("input", updateLayout);
  $("c3c-toggle-overlay").addEventListener("change", () => {
    if (!overlayEnabled()) overlay.pause();
    else if (!master.paused && master.currentTime < overlay.duration - 0.05) {
      overlay.currentTime = master.currentTime;
      overlay.play().catch(() => reportStatus("Video tambahan tidak bisa dimainkan."));
    }
    updateLayout();
  });
  // Dashboard settings change defaults for this lab, not the source files.
  window.addEventListener("openclipper:preset", (event) => {
    const { ratio, layout } = event.detail || {};
    if (ratio) $("c3c-ratio").value = ratio;
    if (layout) $("c3c-layout").value = layout;
    updateLayout();
  });

  function frameCallback(_now, metadata) {
    if (!frameCallbackActive) return;
    frameCount++;
    if (lastPresented !== null && metadata.presentedFrames > lastPresented + 1)
      dropped += metadata.presentedFrames - lastPresented - 1;
    lastPresented = metadata.presentedFrames;
    master.requestVideoFrameCallback(frameCallback);
  }
  if (typeof master.requestVideoFrameCallback === "function") {
    frameCallbackActive = true;
    master.requestVideoFrameCallback(frameCallback);
  }
  function refresh() {
    if (baseReady()) {
      const current = master.currentTime;
      if (!slider.matches(":active")) slider.value = String(current);
      $("c3c-time").textContent = formatDuration(current);
      if (overlayEnabled() && current < overlay.duration - 0.05) {
        const delta = driftMs(current, overlay.currentTime);
        $("c3c-drift").textContent = delta === null ? "—" : delta + " ms";
        if (!master.paused && needsResync(current, overlay.currentTime)) {
          overlay.currentTime = current;
          syncCorrections++;
        }
        if (!master.paused && overlay.paused) overlay.play().catch(() => {});
      } else {
        $("c3c-drift").textContent = "—";
        if (!overlay.paused) overlay.pause();
      }
    }
    const quality = typeof master.getVideoPlaybackQuality === "function"
      ? master.getVideoPlaybackQuality() : null;
    $("c3c-frames").textContent = String(quality?.totalVideoFrames ?? frameCount);
    $("c3c-dropped").textContent = String(quality?.droppedVideoFrames ?? dropped);
    $("c3c-corrections").textContent = String(syncCorrections);
    $("c3c-fps").textContent = playStarted && !master.paused
      ? displayNumber((frameCount - playFrameStart) / Math.max(0.001, (performance.now() - playStarted) / 1000))
      : "—";
  }
  const refreshTimer = setInterval(refresh, 300);
  const metricsTimer = setInterval(async () => {
    if (!isTauri) return;
    try {
      // The existing Rust IPC contract returns [cpuPercent, workingSetMb].
      const metrics = await invoke("c3c_process_metrics");
      $("c3c-cpu").textContent = displayNumber(metrics[0]) + "%";
      $("c3c-ram").textContent = displayNumber(metrics[1]) + " MB";
    } catch {
      $("c3c-cpu").textContent = "—";
      $("c3c-ram").textContent = "—";
    }
  }, 2000);
  window.addEventListener("openclipper:navigate", (event) => {
    if (event.detail?.page !== "c3c") {
      master.pause();
      overlay.pause();
    }
  });
  window.addEventListener("beforeunload", () => {
    clearInterval(refreshTimer);
    clearInterval(metricsTimer);
    frameCallbackActive = false;
    videos.forEach((v) => v.pause());
    urls.forEach((url) => { if (url) URL.revokeObjectURL(url); });
  });
  updateControls();
}
