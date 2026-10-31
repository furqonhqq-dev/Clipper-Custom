// P0-01 interactive candidate review. No remote APIs, uploads or simulated AI.
import { formatDuration } from "./video.js";
import { parseCaptions, rankCaptionClips, P0_SCORING_METHOD } from "./p0-candidate-engine.js";

export function mountP0({ isTauri = false, invoke = null, open = null } = {}) {
  const $ = (id) => document.getElementById(id);
  const status = $("p0-status");
  const preview = $("p0-preview");
  const results = $("p0-results");
  const selectedCount = $("p0-selected");
  const state = { segments: [], clips: [], sourceUrl: null, selected: new Set(), until: null };
  const setStatus = (message) => { status.textContent = message; };
  function updateSelection() {
    selectedCount.textContent = state.selected.size + " kandidat dipilih (hanya sesi ini; belum dapat dirender)";
  }
  $("p0-video-file").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|webm|m4v|mov|mkv|avi)$/i.test(file.name)) {
      setStatus("Pilih file video yang valid."); return;
    }
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
    state.sourceUrl = URL.createObjectURL(file);
    preview.src = state.sourceUrl;
    preview.load();
    preview.hidden = false;
    $("p0-video-name").textContent = file.name;
    setStatus("Video dipilih. Pilih transkrip SRT/VTT dengan waktu yang sesuai.");
  });
  preview.addEventListener("error", () => {
    setStatus("Video tidak dapat diputar. Coba MP4 H.264/AAC atau WebM.");
  });
  preview.addEventListener("timeupdate", () => {
    if (state.until !== null && preview.currentTime >= state.until - 0.06) {
      preview.pause();
      state.until = null;
    }
  });
  $("p0-caption-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.(srt|vtt)$/i.test(file.name)) {
      setStatus("Gunakan transkrip bertimestamp SRT atau VTT."); return;
    }
    if (file.size > 3_000_000) {
      setStatus("Ukuran transkrip maksimal 3 MB."); return;
    }
    try {
      state.segments = parseCaptions(await file.text());
      $("p0-caption-name").textContent = file.name + " · " + state.segments.length + " baris bertimestamp";
      setStatus("Transkrip dibaca. Klik Cari Kandidat untuk menghitung ranking awal.");
      $("p0-analyze").disabled = false;
      state.clips = [];
      state.selected.clear();
      results.replaceChildren();
      updateSelection();
    } catch (error) {
      state.segments = [];
      state.clips = [];
      state.selected.clear();
      results.replaceChildren();
      updateSelection();
      $("p0-caption-name").textContent = "Transkrip gagal dibaca";
      $("p0-analyze").disabled = true;
      setStatus("Transkrip belum bisa diproses: " + String(error.message || error));
    }
  });
  function previewClip(item) {
    if (!state.sourceUrl) {
      setStatus("Pilih video sumber terlebih dahulu untuk melihat potongannya.");
      return;
    }
    if (!Number.isFinite(preview.duration) || item.start >= preview.duration) {
      setStatus("Waktu kandidat berada di luar durasi video. Periksa kecocokan transkrip.");
      return;
    }
    state.until = Math.min(item.end, preview.duration);
    preview.pause();
    preview.currentTime = item.start;
    preview.play().then(() => {
      setStatus("Preview klip " + formatDuration(item.start) + "–" + formatDuration(state.until)
        + ". Ini belum file hasil render.");
    }).catch(() => setStatus("Pemutaran gagal. Periksa codec video atau tekan Play pada pemutar."));
  }
  function render() {
    results.replaceChildren();
    for (const [index,item] of state.clips.entries()) {
      const card = document.createElement("article");
      card.className = "p0-result";
      const top = document.createElement("div");
      top.className = "p0-result-top";
      const score = document.createElement("strong");
      score.textContent = "#" + (index+1) + " · Skor teks " + item.score + "/100";
      const timerange = document.createElement("span");
      timerange.textContent = formatDuration(item.start) + " – " + formatDuration(item.end);
      top.append(score,timerange);
      const title = document.createElement("input");
      title.type = "text";
      title.value = item.title;
      title.maxLength = 120;
      title.setAttribute("aria-label", "Judul kandidat " + (index+1));
      title.addEventListener("input", () => { item.title = title.value; });
      const reason = document.createElement("p");
      reason.className = "hint";
      reason.textContent = item.reason;
      const excerpt = document.createElement("p");
      excerpt.className = "p0-excerpt";
      excerpt.textContent = item.excerpt;
      const actions = document.createElement("div");
      actions.className = "p0-row";
      const play = document.createElement("button");
      play.textContent = "▶ Preview bagian ini";
      play.onclick = () => previewClip(item);
      const pick = document.createElement("label");
      pick.className = "p0-pick";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = state.selected.has(item.id);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.selected.add(item.id);
        else state.selected.delete(item.id);
        updateSelection();
      });
      pick.append(checkbox,document.createTextNode(" Pilih kandidat"));
      actions.append(play,pick);
      card.append(top,title,reason,excerpt,actions);
      results.append(card);
    }
  }
  $("p0-analyze").addEventListener("click", () => {
    if (!state.segments.length) return;
    state.clips = rankCaptionClips(state.segments, {
      count:Number($("p0-count").value) || 8,
    });
    state.selected.clear();
    updateSelection();
    render();
    setStatus(state.clips.length
      ? "Ditemukan " + state.clips.length + " kandidat berdasarkan aturan analisis transkrip. Periksa dan edit judul sebelum dipakai."
      : "Belum ada rentang transkrip yang cukup panjang (minimal 15 detik). Gunakan video/transkrip yang lebih panjang.");
  });
  // Optional real local speech recognition. The user explicitly selects
  // every executable and model; this PoC does not silently download tools.
  const native = { video: null, ffmpeg: null, whisper: null, model: null };
  const nativeStatus = $("p0-native-status");
  const nativeButton = $("p0-transcribe");
  const nativeFilters = {
    video: [{name:"Video",extensions:["mp4","mov","webm","mkv","avi","m4v"]}],
    ffmpeg: [{name:"Program FFmpeg",extensions:["exe"]}],
    whisper: [{name:"Program Whisper",extensions:["exe"]}],
    model: [{name:"Model Whisper",extensions:["bin"]}],
  };
  function nativeReady() {
    nativeButton.disabled = !isTauri || !Object.values(native).every(Boolean);
  }
  for (const button of document.querySelectorAll("[data-p0-pick]")) {
    const kind = button.dataset.p0Pick;
    button.disabled = !isTauri;
    button.addEventListener("click", async () => {
      if (!isTauri || !open) return;
      try {
        const selected = await open({
          multiple:false,directory:false,filters:nativeFilters[kind],
        });
        if (typeof selected !== "string") return;
        native[kind] = selected;
        $("p0-native-" + kind).textContent = selected.split(/[\\/]/).pop();
        nativeReady();
      } catch (error) {
        nativeStatus.textContent = "Gagal memilih file: " + String(error);
      }
    });
  }
  if (!isTauri) nativeStatus.textContent =
    "Transkripsi lokal memerlukan aplikasi Windows. Analisis SRT/VTT tetap dapat dicoba di browser.";
  nativeButton.addEventListener("click", async () => {
    if (!isTauri || !invoke || !Object.values(native).every(Boolean)) return;
    nativeButton.disabled = true;
    nativeButton.textContent = "Sedang melakukan transkripsi…";
    nativeStatus.textContent = "Ekstraksi audio dan pengenalan ucapan sedang berjalan di laptop. Jangan tutup aplikasi. Hasil tidak dikirim ke cloud.";
    try {
      const output = await invoke("p0_transcribe_video", {
        videoPath:native.video,ffmpegPath:native.ffmpeg,
        whisperPath:native.whisper,modelPath:native.model,
      });
      state.segments = parseCaptions(output);
      state.clips = [];
      state.selected.clear();
      $("p0-caption-name").textContent = "Dihasilkan AI lokal · " + state.segments.length + " segmen";
      $("p0-analyze").disabled = false;
      nativeStatus.textContent = "Transkripsi selesai. Kandidat sedang dihitung dari transkrip nyata.";
      $("p0-analyze").click();
      nativeStatus.textContent = "Selesai. Periksa ranking, judul, dan preview kandidat di bawah.";
    } catch (error) {
      nativeStatus.textContent = "Transkripsi gagal: " + String(error);
      setStatus("P0 AI lokal belum berhasil. Kamu masih bisa menggunakan file SRT/VTT.");
    } finally {
      nativeButton.textContent = "Mulai Transkripsi AI Lokal";
      nativeReady();
    }
  });
  $("p0-method").textContent = P0_SCORING_METHOD;
  window.addEventListener("beforeunload", () => {
    preview.pause();
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  });
  updateSelection();
}
