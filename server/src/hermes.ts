import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HERMES_TIMEOUT = Number(process.env.HERMES_TIMEOUT_MS ?? 900_000);
const HERMES_MAX_BUFFER = 4 * 1024 * 1024;

type ExecFailure = Error & { code?: number | string; signal?: string; killed?: boolean; stderr?: string; stdout?: string };

// execFile hanya memberi "Command failed: hermes -z <prompt>"; stderr asli harus diselipkan
// supaya panel bisa menampilkan sebab kegagalan yang sebenarnya.
function explainFailure(what: string, error: unknown): Error {
  const e = error as ExecFailure;
  const lines = [`${what} gagal`];
  if (e.killed) lines.push(`timeout ${HERMES_TIMEOUT} ms`);
  if (e.code !== undefined) lines.push(`exit ${String(e.code)}`);
  if (typeof e.signal === "string" && e.signal) lines.push(`signal ${e.signal}`);
  const stderr = e.stderr?.trim();
  const stdout = e.stdout?.trim();
  if (stderr) lines.push(`stderr:\n${stderr.slice(-4000)}`);
  if (stdout) lines.push(`stdout (akhir):\n${stdout.slice(-1500)}`);
  if (!stderr && !stdout) lines.push(e.message);
  return new Error(lines.join("\n"));
}

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
  try {
    const result = await execFileAsync(executable, args, {
      timeout: HERMES_TIMEOUT,
      maxBuffer: HERMES_MAX_BUFFER,
      windowsHide: true,
    });
    return result.stdout.trim();
  } catch (error) {
    throw explainFailure("hermes read-only", error);
  }
}

export async function delegateTask(slug: string, task: string, cwd: string, files: string[] = []): Promise<string> {
  const prompt = [
    "Use the agency-agents-router plugin.",
    `Delegate to specialist slug: ${slug}.`,
    `Task: ${task}`,
    `Working directory: ${cwd}`,
    files.length > 0
      ? `File yang sudah ada: ${files.slice(0, 40).join(", ")}`
      : "Working directory masih kosong.",
    "Simpan SEMUA file hasil kerja di dalam working directory itu, jangan di home directory. Hasil harus project nyata yang bisa dijalankan.",
    "Balas daftar path file yang kamu buat atau ubah, tanpa preamble.",
  ].join("\n");

  const executable = process.env.HERMES_BIN ?? "hermes";
  // --in wajib: tanpa itu Hermes menulis ke cwd default pemanggil, bukan folder project.
  const args = ["--in", cwd, "-z", prompt];
  if (process.env.HERMES_MODEL) args.push("--model", process.env.HERMES_MODEL);
  try {
    const result = await execFileAsync(executable, args, {
      timeout: HERMES_TIMEOUT,
      maxBuffer: HERMES_MAX_BUFFER,
      windowsHide: true,
    });
    return result.stdout.trim();
  } catch (error) {
    throw explainFailure(`delegate ${slug}`, error);
  }
}

export function buildTaskPrompt(task: { title: string; description: string; specialist: string }): string {
  return [
    "Anda merencanakan pekerjaan untuk AI Office.",
    "Kembalikan analisis saja. Jangan menjalankan perintah, mengubah berkas, mengirim pesan, atau memanggil layanan eksternal.",
    "Berikan: rencana singkat, risiko, dan tindakan yang diusulkan. Tandai setiap tindakan dengan tool, risiko, allowlistKey, dan input.",
    `Slug spesialis Agency Agents: ${task.specialist}`,
    `Judul: ${task.title}`,
    `Deskripsi: ${task.description || "(tidak ada)"}`,
  ].join("\n");
}
