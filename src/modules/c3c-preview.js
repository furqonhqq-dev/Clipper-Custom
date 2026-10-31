// Checkpoint 3C1 — experimental two-video WebView2 preview.
// This is an interactive browser-decoder UI prototype, not FFmpeg/libopenshot integration.
// Overlay is muted; only background audio is heard. Do not interpret clock drift as A/V sync.
import { extensions, fileName, formatDuration } from "./video.js";
import { displayNumber, driftMs, needsResync, seekSummary } from "./c3c-metrics.js";

export function mountC3C({ isTauri, open, convertFileSrc, invoke }) {
  const $ = (id) => document.getElementById(id);
  const master = $("c3c-base");
  const overlay = $("c3c-overlay");
  const slider = $("c3c-scrub");
  const status = $("c3c-status");
  const names = [$("c3c-base-name"), $("c3c-overlay-name")];
  const videos = [master, overlay];
  const urls = [null, null];
  const samples = [];
  let pendingSeek = null;
  let lastPresented = null;
  let frameCount = 0;
  let dropped = 0;
  let playStarted = 0;
  let syncCorrections = 0;
  let frameCallbackActive = false;

  function ready() {
    return videos.every((v) => v.readyState >= HTMLMediaElement.HAVE_METADATA);
  }
  function duration() {
    if (!ready()) return 0;
    return Math.min(master.duration, overlay.duration);
  }
  function updateControls() {
    const valid = ready() && Number.isFinite(duration()) && duration() > 0;
    $("c3c-play").disabled = !valid;
    $("c3c-pause").disabled = !valid;
    slider.disabled = !valid;
    slider.max = valid ? String(duration()) : "0";
    $("c3c-duration").textContent = valid ? formatDuration(duration()) : "—";
    if (valid) {
      $("c3c-play").textContent = master.paused ? "▶ Play" : "▶ Memutar";
      if (master.currentTime > duration()) master.pause();
    }
  }
  function reportStatus(message) {
    status.textContent = message;
  }
  function resetCounters() {
    samples.length = 0;
    pendingSeek = null;
    frameCount = 0;
    dropped = 0;
    syncCorrections = 0;
    playStarted = 0;
    lastPresented = null;
    $("c3c-seek").textContent = "—";
    $("c3c-frames").textContent = "0";
    $("c3c-dropped").textContent = "0";
  }
  function load(index, url, name, objectUrl = null) {
    master.pause();
    overlay.pause();
    const oldUrl = urls[index];
    urls[index] = objectUrl;
    videos[index].src = url;
    videos[index].load();
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    names[index].textContent = name;
    resetCounters();
    updateControls();
    reportStatus("Membaca metadata video…");
  }
  async function choose(index) {
    try {
      if (isTauri) {
        const path = await open({
          multiple: false,
          directory: false,
          filters: [{ name: "Video", extensions }],
        });
        if (typeof path === "string") load(index, convertFileSrc(path), fileName(path));
      } else {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = extensions.map((ext) => "." + ext).join(",");
        input.onchange = () => {
          const file = input.files?.[0];
          if (file) load(index, URL.createObjectURL(file), file.name, null);
        };
        // Browser-created blob URLs must be tracked for cleanup.
        input.onchange = () => {
          const file = input.files?.[0];
          if (file) {
            const url = URL.createObjectURL(file);
            load(index, url, file.name, url);
          }
        };
        input.click();
      }
    } catch (error) {
      reportStatus("Tidak dapat membuka video: " + String(error));
    }
  }
  $("c3c-import-base").onclick = () => choose(0);
  $("c3c-import-overlay").onclick = () => choose(1);

  function finishSeek() {
    if (!pendingSeek || !pendingSeek.done.every(Boolean)) return;
    const elapsed = performance.now() - pendingSeek.started;
    samples.push(elapsed);
    if (samples.length > 100) samples.shift();
    pendingSeek = null;
    const stats = seekSummary(samples);
    $("c3c-seek").textContent =
      displayNumber(stats.p50Ms) + " / " + displayNumber(stats.p95Ms) + " ms";
  }
  videos.forEach((video, index) => {
    video.addEventListener("loadedmetadata", () => {
      updateControls();
      if (ready()) {
        overlay.muted = true;
        reportStatus("Dua video siap. Tekan Play atau geser timeline.");
      }
    });
    video.addEventListener("error", () => {
      reportStatus("Video gagal dibaca oleh WebView2. Coba MP4 H.264/AAC.");
    });
    video.addEventListener("seeked", () => {
      if (!pendingSeek) return;
      if (Math.abs(video.currentTime - pendingSeek.target) <= 0.06) {
        pendingSeek.done[index] = true;
        finishSeek();
      }
    });
  });
  function seekTo(target) {
    if (!ready()) return;
    const position = Math.max(0, Math.min(Number(target), duration()));
    if (!Number.isFinite(position)) return;
    pendingSeek = { target: position, started: performance.now(), done: [false, false] };
    for (let i = 0; i < 2; i++) {
      if (Math.abs(videos[i].currentTime - position) <= 0.005) {
        pendingSeek.done[i] = true;
      } else {
        videos[i].currentTime = position;
      }
    }
    finishSeek();
    $("c3c-time").textContent = formatDuration(position);
  }
  slider.addEventListener("input", () => seekTo(slider.value));

  $("c3c-play").onclick = async () => {
    if (!ready()) return;
    if (master.currentTime >= duration() - 0.05) seekTo(0);
    overlay.muted = true;
    overlay.currentTime = master.currentTime;
    try {
      await Promise.all([master.play(), overlay.play()]);
      playStarted = performance.now();
      reportStatus("Memutar dua layer. Audio hanya dari video dasar.");
      updateControls();
    } catch (error) {
      master.pause();
      overlay.pause();
      reportStatus("Playback gagal: " + String(error));
    }
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
  $("c3c-opacity").addEventListener("input", (event) => {
    overlay.style.opacity = String(Number(event.target.value) / 100);
    $("c3c-opacity-value").textContent = event.target.value + "%";
  });
  $("c3c-toggle-overlay").addEventListener("change", (event) => {
    overlay.style.visibility = event.target.checked ? "visible" : "hidden";
  });

  function frameCallback(_now, metadata) {
    if (!frameCallbackActive) return;
    frameCount++;
    if (lastPresented !== null && metadata.presentedFrames > lastPresented + 1) {
      dropped += metadata.presentedFrames - lastPresented - 1;
    }
    lastPresented = metadata.presentedFrames;
    master.requestVideoFrameCallback(frameCallback);
  }
  if (typeof master.requestVideoFrameCallback === "function") {
    frameCallbackActive = true;
    master.requestVideoFrameCallback(frameCallback);
  }
  function refresh() {
    if (ready()) {
      const time = master.currentTime;
      if (!slider.matches(":active")) slider.value = String(time);
      $("c3c-time").textContent = formatDuration(time);
      const drift = driftMs(time, overlay.currentTime);
      $("c3c-drift").textContent = drift === null ? "—" : drift + " ms";
      if (!master.paused && needsResync(time, overlay.currentTime)) {
        overlay.currentTime = time;
        syncCorrections++;
      }
    }
    const quality = typeof master.getVideoPlaybackQuality === "function"
      ? master.getVideoPlaybackQuality() : null;
    $("c3c-frames").textContent = String(quality?.totalVideoFrames ?? frameCount);
    $("c3c-dropped").textContent = String(quality?.droppedVideoFrames ?? dropped);
    $("c3c-corrections").textContent = String(syncCorrections);
    if (playStarted && !master.paused) {
      const elapsed = (performance.now() - playStarted) / 1000;
      $("c3c-fps").textContent = elapsed > 0
        ? displayNumber(frameCount / elapsed) : "—";
    } else {
      $("c3c-fps").textContent = "—";
    }
  }
  const refreshTimer = setInterval(refresh, 300);
  const metricsTimer = setInterval(async () => {
    if (!isTauri) return;
    try {
      const metrics = await invoke("c3c_process_metrics");
      $("c3c-cpu").textContent = displayNumber(metrics.cpu_percent) + "%";
      $("c3c-ram").textContent = displayNumber(metrics.memory_mb) + " MB";
    } catch {
      $("c3c-cpu").textContent = "—";
      $("c3c-ram").textContent = "—";
    }
  }, 2000);
  window.addEventListener("beforeunload", () => {
    clearInterval(refreshTimer);
    clearInterval(metricsTimer);
    frameCallbackActive = false;
    videos.forEach((v) => v.pause());
    for (const url of urls) if (url) URL.revokeObjectURL(url);
  });
  updateControls();
}
