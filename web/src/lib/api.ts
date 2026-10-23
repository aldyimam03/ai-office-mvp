// Default membuat `vite build` tetap jalan tanpa .env (mis. di CI).
export const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4317/api";
const TOKEN = import.meta.env.VITE_API_TOKEN;

// Artifact agent disajikan server terpisah (port API + 1) supaya HTML buatan agent
// tidak satu origin dengan API. Isi VITE_PROJECTS_URL bila port artifact diubah.
export const PROJECT_BASE = (() => {
  const explicit = import.meta.env.VITE_PROJECTS_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const url = new URL(API_URL);
  url.port = String(Number(url.port) + 1);
  return url.origin;
})();

// Satu pintu untuk semua panggilan API: menyisipkan Bearer token bila server
// dijalankan dengan AI_OFFICE_TOKEN, dan menghapus sembilan salinan `${API_URL}`.
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (TOKEN) headers.set("authorization", `Bearer ${TOKEN}`);
  return fetch(`${API_URL}${path}`, { ...init, headers });
}
