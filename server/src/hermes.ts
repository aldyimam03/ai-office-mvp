import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type HermesStatus = { configured: boolean; executable: string | null; mode: "read-only" | "not-configured" };

export async function hermesStatus(): Promise<HermesStatus> {
  const executable = process.env.HERMES_BIN ?? "hermes";
  try {
    await execFileAsync(executable, ["--version"], { timeout: 5000, windowsHide: true });
    return { configured: true, executable, mode: "read-only" };
  } catch {
    return { configured: false, executable: null, mode: "not-configured" };
  }
}

export async function askReadOnly(prompt: string): Promise<string> {
  if (!process.env.AI_OFFICE_ENABLE_HERMES_READONLY) throw new Error("Hermes read-only adapter disabled");
  if (!prompt.trim() || prompt.length > 12000) throw new Error("Prompt length invalid");
  const executable = process.env.HERMES_BIN ?? "hermes";
  const args = ["-z", prompt, "--safe-mode"];
  if (process.env.HERMES_MODEL) args.push("--model", process.env.HERMES_MODEL);
  const result = await execFileAsync(executable, args, { timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 });
  return result.stdout.trim();
}

export function buildTaskPrompt(task: { title: string; description: string; specialist: string }): string {
  return [
    "Anda merencanakan pekerjaan untuk AI Office.",
    "Kembalikan analisis saja. Jangan menjalankan perintah, mengubah berkas, mengirim pesan, atau memanggil layanan eksternal.",
    "Berikan: rencana singkat, risiko, dan tindakan yang diusulkan. Tandai setiap tindakan dengan tool, risiko, allowlistKey, dan input.",
    `Slug spesialis Agency Agents: ${task.specialist}`,
    `Judul: ${task.title}`,
    `Deskripsi: ${task.description || "(tidak ada)"}`,
  ].join("\\n");
}
