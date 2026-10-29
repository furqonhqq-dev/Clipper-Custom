export const extensions = ["mp4", "webm", "mov", "mkv", "avi", "m4v"];
export function isVideoName(name) {
  return extensions.includes(name.split(".").pop().toLowerCase());
}
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}
export function fileName(path) {
  return path.split(/[\\/]/).pop();
}
