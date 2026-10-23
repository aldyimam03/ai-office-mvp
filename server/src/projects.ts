import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { db } from "./db.js";

// Setiap tugas induk punya satu folder project sendiri di bawah root ini.
export const workspaceRoot = resolve(process.env.AI_OFFICE_WORKSPACE ?? "./workspace");

// id tugas selalu dibuat randomUUID() atau slug uji `sub-<timestamp>`; karakter di luar
// ini (".", "/", "\", ":") adalah upaya keluar dari workspaceRoot.
const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function safeTaskId(taskId: string): string | null {
  const id = String(taskId).trim();
  return TASK_ID_PATTERN.test(id) ? id : null;
}

// Satu-satunya jalan membentuk path folder project. Mengembalikan null bila id tidak
// valid atau hasil resolve() keluar dari workspaceRoot (mis. lewat "..").
function taskDir(taskId: string): string | null {
  const id = safeTaskId(taskId);
  if (!id) return null;
  const dir = resolve(workspaceRoot, id);
  const rel = relative(workspaceRoot, dir);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return dir;
}

export type Artifact = { path: string; size: number; mtime: number };
export type Project = { taskId: string; entry: string | null; files: Artifact[] };

// Delete project folder and DB records (tasks, subtasks, approvals, events).
// Mengembalikan jumlah task yang dihapus supaya route bisa membalas 404, bukan 200 palsu.
export function deleteProjectData(taskId: string): number {
  // Gather task IDs (root + subtasks)
  const rows = db.prepare("SELECT id FROM tasks WHERE id = ? OR parent_task_id = ?").all(taskId, taskId) as Record<string, unknown>[];
  const ids = rows.map(r => String(r.id));
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(",");
  // delete related rows
  db.prepare(`DELETE FROM events WHERE task_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM approvals WHERE task_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`).run(...ids);
  return ids.length;
}

export function deleteProjectFolder(taskId: string): boolean {
  const dir = taskDir(taskId);
  if (!dir || !existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  return true;
}
const MAX_FILES = 500;
const MAX_DEPTH = 5;

function walk(dir: string, base: string, depth: number, out: Artifact[]): Artifact[] {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return out;
  let names: string[];
  // Folder bisa dihapus di tengah walk (delete project bersamaan) — jangan sampai
  // satu ENOENT membuat seluruh request 500.
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    if (name === "node_modules" || name === ".git") continue;
    const full = join(dir, name);
    let info;
    try { info = lstatSync(full); } catch { continue; }
    // Symlink bisa menunjuk keluar workspace; statSync akan mengikutinya dan
    // membuat file di luar root ikut terdaftar (dan ikut disajikan).
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) walk(full, base, depth + 1, out);
    else out.push({ path: relative(base, full).split(sep).join("/"), size: info.size, mtime: info.mtimeMs });
    if (out.length >= MAX_FILES) break;
  }
  return out;
}

export function projectDir(taskId: string): string {
  const dir = taskDir(taskId);
  if (!dir) throw new Error(`taskId tidak valid: ${JSON.stringify(taskId)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function readProject(taskId: string): Project | null {
  const dir = taskDir(taskId);
  if (!dir) return null;
  let info;
  try { info = statSync(dir); } catch { return null; }
  if (!info.isDirectory()) return null;
  const files = walk(dir, dir, 0, []);
  return { taskId, entry: files.some(f => f.path === "index.html") ? "index.html" : null, files };
}

export function listProjects(): Project[] {
  if (!existsSync(workspaceRoot)) return [];
  let names: string[];
  try { names = readdirSync(workspaceRoot); } catch { return []; }
  return names
    .map(name => readProject(name))
    .filter((project): project is Project => Boolean(project));
}
