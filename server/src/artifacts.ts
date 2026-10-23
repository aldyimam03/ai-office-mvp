import express from "express";
import { workspaceRoot } from "./projects.js";

// Artifact agent sengaja disajikan dari origin terpisah dari API (port sendiri).
// Kalau satu origin, HTML buatan agent bisa `fetch('/api/...')` tanpa halangan CORS —
// artinya output LLM otomatis punya kendali penuh atas API (hapus project, buat approval).
export function createArtifactApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    "/projects",
    express.static(workspaceRoot, {
      index: "index.html",
      dotfiles: "ignore",
      setHeaders(res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }),
  );
  return app;
}

// Default: port API + 1. Frontend menurunkan origin artifact dengan aturan yang sama,
// jadi tanpa konfigurasi tambahan tautan "Buka hasil di browser" tetap benar.
export function resolveArtifactPort(apiPort: number): number {
  const raw = (process.env.ARTIFACT_PORT ?? "").trim();
  const value = raw === "" ? apiPort + 1 : Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error("ARTIFACT_PORT must be valid");
  if (value === apiPort) throw new Error("ARTIFACT_PORT must differ from PORT");
  return value;
}

export function resolveArtifactHost(): string {
  const host = (process.env.ARTIFACT_HOST ?? process.env.HOST ?? "127.0.0.1").trim();
  if (!host) throw new Error("ARTIFACT_HOST must not be empty");
  return host;
}
