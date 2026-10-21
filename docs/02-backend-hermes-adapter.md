# 02 — Perbaikan `server/src/hermes.ts`

## Masalah

Fungsi `askReadOnly` saat ini memakai `--safe-mode`, yang **menonaktifkan tool use**. Akibatnya `agency_agents_delegate` tidak pernah dipanggil. Hermes hanya menjawab dengan teks biasa, tidak benar-benar mendelegasikan.

## Solusi

Pisahkan dua fungsi:
- `askReadOnly` — untuk planner (tidak butuh tool, boleh `--safe-mode`)
- `delegateTask` — untuk eksekutor (WAJIB mengizinkan tool use)

## Kode Lengkap

```ts
// server/src/hermes.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HERMES_BIN = process.env.HERMES_BIN ?? "hermes";
const HERMES_TIMEOUT = Number(process.env.HERMES_TIMEOUT_MS ?? 300_000);
const HERMES_MODEL = process.env.HERMES_MODEL;

/** Planner: tidak butuh tool, boleh safe-mode */
export async function askReadOnly(prompt: string): Promise<string> {
  const args = ["-z", prompt, "--safe-mode"];
  if (HERMES_MODEL) args.push("--model", HERMES_MODEL);

  const { stdout } = await execFileAsync(HERMES_BIN, args, {
    timeout: HERMES_TIMEOUT,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout.trim();
}

/** Eksekutor: WAJIB mengizinkan tool use agar delegate bisa dipanggil */
export async function delegateTask(slug: string, task: string): Promise<string> {
  const prompt = [
    "Use the agency-agents-router plugin.",
    `Delegate to specialist slug: ${slug}.`,
    `Task: ${task}`,
    "Return only the delegate result, tanpa preamble.",
  ].join("\n");

  // PENTING: tidak ada --safe-mode
  const args = ["-z", prompt];
  if (HERMES_MODEL) args.push("--model", HERMES_MODEL);

  const { stdout } = await execFileAsync(HERMES_BIN, args, {
    timeout: HERMES_TIMEOUT,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout.trim();
}
```

## Catatan Penting

Jika `hermes -z` **tetap** tidak memicu tool call di lingkunganmu (misalnya karena mode one-shot), ganti jalur `delegateTask` menjadi panggilan ke **Hermes Desktop API** (HTTP) yang sudah terbukti bisa delegate di GUI.

Struktur fungsi tetap sama; hanya transport-nya yang berubah:

```ts
async function delegateTask(slug: string, task: string): Promise<string> {
  const res = await fetch("http://localhost:PORT_HERMES/api/delegate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, task }),
  });
  const data = await res.json();
  return data.result;
}
```

## Uji Manual

```ts
import { delegateTask } from "./server/src/hermes.js";
const out = await delegateTask("frontend-developer", "buat struktur landing page");
console.log(out);
```

Yang diharapkan: output berisi hasil dari `frontend-developer` (bukan teks seperti "Saya akan mendelegasikan...").

## Cek Log Hermes

Buka log Hermes (biasanya di `~/.hermes/logs/`). Cari baris yang menyebut `agency_agents_delegate`.
