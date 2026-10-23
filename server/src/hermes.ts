import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Variabel yang ada tapi kosong di .env ("HERMES_TIMEOUT_MS=") harus jatuh ke default,
// bukan jadi 0/NaN yang membuat execFile berjalan tanpa batas waktu.
function readTimeoutMs(): number {
  const raw = (process.env.HERMES_TIMEOUT_MS ?? "").trim();
  const value = raw === "" ? 900_000 : Number(raw);
  if (!Number.isFinite(value) || value < 1000) throw new Error("HERMES_TIMEOUT_MS must be a number >= 1000");
  return value;
}

const HERMES_TIMEOUT = readTimeoutMs();
const HERMES_MAX_BUFFER = 4 * 1024 * 1024;

// Nilai env selalu string, dan "0" itu truthy: `!process.env.X` justru MENGAKTIFKAN
// adapter saat .env menulis AI_OFFICE_ENABLE_HERMES_READONLY=0. Baca flag secara eksplisit.
function readOnlyEnabled(): boolean {
  const flag = (process.env.AI_OFFICE_ENABLE_HERMES_READONLY ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true";
}

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

export type HermesStatus = { configured: boolean; executable: string | null; mode: "read-only" | "no-tools" | "not-configured" };

// `hermes --version` butuh ~5 detik di mesin ini, jadi timeout 5 detik membuat status
// bolak-balik "not-configured". Naikkan dan cache 60 detik: spawn CLI tiap request mahal.
let statusCache: { at: number; value: HermesStatus } | null = null;

export async function hermesStatus(): Promise<HermesStatus> {
  const now = Date.now();
  if (statusCache && now - statusCache.at < 60_000) return statusCache.value;
  const executable = process.env.HERMES_BIN ?? "hermes";
  let value: HermesStatus;
  try {
    await execFileAsync(executable, ["--version"], { timeout: 15_000, windowsHide: true });
    value = { configured: true, executable, mode: process.env.HERMES_READONLY_STRICT === "1" ? "read-only" : "no-tools" };
  } catch {
    value = { configured: false, executable: null, mode: "not-configured" };
  }
  statusCache = { at: now, value };
  return value;
}

// Mode "read-only" tidak boleh bergantung pada --safe-mode: flag itu mematikan
// config.yaml, termasuk definisi provider kustom. Di instalasi dengan provider
// sendiri, `--safe-mode --provider <nama>` mati dengan "Execution outcome is unknown".
// Default sekarang: semua toolset bawaan dimatikan (-t "") dan proses dijalankan di
// folder sekali pakai, sehingga tidak ada perintah atau berkas proyek yang tersentuh.
// HERMES_READONLY_STRICT=1 memaksa --safe-mode (butuh HERMES_MODEL + HERMES_PROVIDER).
export async function askReadOnly(prompt: string): Promise<string> {
  if (!readOnlyEnabled()) throw new Error("Hermes read-only adapter disabled (set AI_OFFICE_ENABLE_HERMES_READONLY=1)");
  if (!prompt.trim() || prompt.length > 12000) throw new Error("Prompt length invalid");
  const executable = process.env.HERMES_BIN ?? "hermes";
  const strict = process.env.HERMES_READONLY_STRICT === "1";
  const sandbox = mkdtempSync(join(tmpdir(), "ai-office-plan-"));
  const args = ["--in", sandbox, "-z", prompt, "-t", "", strict ? "--safe-mode" : "--ignore-rules"];
  if (process.env.HERMES_MODEL) args.push("--model", process.env.HERMES_MODEL);
  if (process.env.HERMES_PROVIDER) args.push("--provider", process.env.HERMES_PROVIDER);
  try {
    const result = await execFileAsync(executable, args, {
      timeout: HERMES_TIMEOUT,
      maxBuffer: HERMES_MAX_BUFFER,
      windowsHide: true,
    });
    return result.stdout.trim();
  } catch (error) {
    throw explainFailure("hermes read-only", error);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
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
