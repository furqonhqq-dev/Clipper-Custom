import "./style.css";
import { isTauri, convertFileSrc, invoke } from "@tauri-apps/api/core";
import { mountC3C } from "./modules/c3c-preview.js";
import { mountP0 } from "./modules/p0-clip-workspace.js";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import {
  extensions,
  isVideoName,
  formatDuration,
  fileName,
} from "./modules/video.js";
import { features } from "./modules/features.js";

const $ = (id) => document.getElementById(id);
function navigate(page) {
  for (const section of document.querySelectorAll("main > section"))
    section.hidden = section.id !== page;
  for (const button of document.querySelectorAll("nav button")) {
    if (button.dataset.page === page)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  window.dispatchEvent(new CustomEvent("openclipper:navigate", { detail: { page } }));
}
for (const button of document.querySelectorAll("nav button"))
  button.onclick = () => navigate(button.dataset.page);
$("begin").onclick = $("project-create").onclick = () => navigate("create");
for (const feature of features) {
  const card = document.createElement("article");
  const heading = document.createElement("h2");
  heading.textContent = feature.title;
  const description = document.createElement("p");
  description.textContent = feature.description;
  const badge = document.createElement("small");
  badge.textContent = "Direncanakan · belum aktif";
  card.append(heading, description, badge);
  $("features").append(card);
}
let objectUrl;
function loadVideo(url, name) {
  if (!isVideoName(name)) {
    $("status").textContent = "Pilih file video dengan format yang didukung.";
    return;
  }
  const oldUrl = objectUrl;
  objectUrl = url.startsWith("blob:") ? url : undefined;
  $("video").src = url;
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  $("filename").textContent = name;
  $("duration").textContent = "—";
  $("placeholder").hidden = true;
  $("status").textContent = "Membaca video…";
  navigate("create");
}
function loadFile(file) {
  if (!isVideoName(file.name)) {
    $("status").textContent = "Format file tidak didukung.";
    return;
  }
  loadVideo(URL.createObjectURL(file), file.name);
}
$("video").onloadedmetadata = () => {
  $("duration").textContent = formatDuration($("video").duration);
  $("status").textContent =
    "Video siap dipreview. Pemotongan dan ekspor belum tersedia.";
};
$("video").onerror = () => {
  $("status").textContent =
    "Video tidak dapat diputar. Coba MP4 dengan codec H.264/AAC yang didukung WebView2.";
};
$("import").onclick = async () => {
  try {
    if (isTauri()) {
      const path = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Video", extensions }],
      });
      if (typeof path === "string")
        loadVideo(convertFileSrc(path), fileName(path));
    } else {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = extensions.map((ext) => `.${ext}`).join(",");
      input.onchange = () => {
        if (input.files[0]) loadFile(input.files[0]);
      };
      input.click();
    }
  } catch {
    $("status").textContent = "Tidak dapat membuka video. Silakan coba lagi.";
  }
};
$("ratio").onchange = () => {
  $("preview-frame").className =
    `preview ratio-${$("ratio").value.replace(":", "-")}`;
};
const zone = $("drop-zone");
if (isTauri()) {
  getCurrentWebview()
    .onDragDropEvent(({ payload }) => {
      zone.classList.toggle(
        "dragging",
        payload.type === "over" || payload.type === "enter",
      );
      if (payload.type === "drop" && payload.paths.length) {
        const path = payload.paths[0];
        loadVideo(convertFileSrc(path), fileName(path));
      }
    })
    .catch(() => {
      $("status").textContent =
        "Drag-and-drop tidak tersedia. Gunakan tombol Pilih video.";
    });
} else {
  window.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("dragging");
  });
  window.addEventListener("dragleave", () => zone.classList.remove("dragging"));
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("dragging");
    if (event.dataTransfer.files[0]) loadFile(event.dataTransfer.files[0]);
  });
}
window.addEventListener("beforeunload", () => {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});

// Isolated C3C1 prototype; does not modify the working v0.1 import/preview flow.
mountC3C({ isTauri: isTauri(), invoke });

// C3C2 dashboard/navigation UX. UI controls are real; unimplemented features
// are explicitly shown as future plans instead of pretending to work.
const app = $("app");
function toggleSidebar() {
  const collapsed = app.classList.toggle("sidebar-collapsed");
  for (const id of ["sidebar-toggle", "mobile-menu"]) {
    $(id).setAttribute("aria-expanded", String(!collapsed));
    $(id).setAttribute("aria-label", collapsed ? "Buka menu samping" : "Tutup menu samping");
  }
}
$("sidebar-toggle").onclick = toggleSidebar;
$("mobile-menu").onclick = toggleSidebar;
for (const button of document.querySelectorAll("[data-goto]"))
  button.onclick = () => navigate(button.dataset.goto);
for (const button of document.querySelectorAll("[data-mode]")) {
  button.onclick = () => {
    const pro = button.dataset.mode === "pro";
    app.classList.toggle("mode-easy", !pro);
    for (const item of document.querySelectorAll("[data-mode]"))
      item.setAttribute("aria-pressed", String(item === button));
  };
}
app.classList.add("mode-easy");
$("dashboard-preview").onclick = () => navigate("c3c");
$("dash-font").addEventListener("change", () => {
  $("subtitle-sample").dataset.font = $("dash-font").value;
});
$("apply-quick").onclick = () => {
  const ratio = $("dash-ratio").value;
  const layout = $("dash-layout").value;
  window.dispatchEvent(new CustomEvent("openclipper:preset", {
    detail: { ratio, layout },
  }));
  $("dash-feedback").textContent =
    "Pengaturan layout dan rasio diterapkan ke Preview Dua Video. Gaya font hanya contoh tampilan.";
  navigate("c3c");
};

// P0-01 local candidate review. Does not invoke a remote AI service.
mountP0({ isTauri: isTauri(), invoke, open });
