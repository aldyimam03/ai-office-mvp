import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { db } from "./db.js";

// Setiap tugas induk punya satu folder project sendiri di bawah root ini.
export const workspaceRoot = resolve(process.env.AI_OFFICE_WORKSPACE ?? "./workspace");

export type Artifact = { path: string; size: number; mtime: number };
export type Project = { taskId: string; entry: string | null; files: Artifact[] };

// Delete project folder and DB records (tasks, subtasks, approvals, events)
export function deleteProjectData(taskId: string): void {
  // Gather task IDs (root + subtasks)
  const rows = db.prepare("SELECT id FROM tasks WHERE id = ? OR parent_task_id = ?").all(taskId, taskId) as Record<string, unknown>[];
  const ids = rows.map(r => String(r.id));
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  // delete related rows
  db.prepare(`DELETE FROM events WHERE task_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM approvals WHERE task_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`).run(...ids);
}

export function deleteProjectFolder(taskId: string): void {
  const dir = join(workspaceRoot, taskId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
const MAX_FILES = 500;
const MAX_DEPTH = 5;

function walk(dir: string, base: string, depth: number, out: Artifact[]): Artifact[] {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const full = join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) walk(full, base, depth + 1, out);
    else out.push({ path: relative(base, full).split(sep).join("/"), size: info.size, mtime: info.mtimeMs });
    if (out.length >= MAX_FILES) break;
  }
  return out;
}

export function projectDir(taskId: string): string {
  const dir = join(workspaceRoot, taskId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function readProject(taskId: string): Project | null {
  const dir = join(workspaceRoot, taskId);
  if (!existsSync(dir)) return null;
  const files = walk(dir, dir, 0, []);
  return { taskId, entry: files.some(f => f.path === "index.html") ? "index.html" : null, files };
}

export function listProjects(): Project[] {
  if (!existsSync(workspaceRoot)) return [];
  return readdirSync(workspaceRoot)
    .filter(name => statSync(join(workspaceRoot, name)).isDirectory())
    .map(readProject)
    .filter((project): project is Project => Boolean(project));
}
