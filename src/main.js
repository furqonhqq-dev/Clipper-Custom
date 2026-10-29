import "./style.css";
import { isTauri, convertFileSrc } from "@tauri-apps/api/core";
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
