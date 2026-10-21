import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type TaskState = "queued" | "in_progress" | "waiting_approval" | "completed" | "failed" | "cancelled";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type Approval = { id: string; taskId: string; summary: string; action?: ProposedAction; status: ApprovalStatus; createdAt: string; decidedAt?: string };
export type Task = { id: string; title: string; description: string; specialist: string; state: TaskState; createdAt: string; updatedAt: string; attempts: number; parentTaskId?: string; error?: string };
export type ProposedAction = { tool: string; input?: unknown; risk: "low" | "medium" | "high"; allowlistKey: string };
export type Event = { id: string; taskId?: string; type: string; payload: unknown; createdAt: string };

const databasePath = resolve(process.env.AI_OFFICE_DB ?? "./data/ai-office.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });
export const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    specialist TEXT NOT NULL, parent_task_id TEXT, state TEXT NOT NULL DEFAULT 'queued',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, error TEXT
  );
  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), summary TEXT NOT NULL,
    action_json TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, decided_at TEXT
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, task_id TEXT, type TEXT NOT NULL, payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
  CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id);
`);
for (const column of [
  "ALTER TABLE tasks ADD COLUMN parent_task_id TEXT",
  "ALTER TABLE tasks ADD COLUMN state TEXT NOT NULL DEFAULT 'queued'",
  "ALTER TABLE tasks ADD COLUMN error TEXT",
]) {
  try { db.exec(column); } catch { /* column exists */ }
}
try { db.exec("ALTER TABLE approvals ADD COLUMN action_json TEXT"); } catch { /* column exists */ }

function task(row: Record<string, unknown>): Task { return { id: String(row.id), title: String(row.title), description: String(row.description), specialist: String(row.specialist), state: row.state as TaskState, createdAt: String(row.created_at), updatedAt: String(row.updated_at), attempts: Number(row.attempts), ...(row.parent_task_id ? { parentTaskId: String(row.parent_task_id) } : {}), ...(row.error ? { error: String(row.error) } : {}) }; }
function approval(row: Record<string, unknown>): Approval { return { id: String(row.id), taskId: String(row.task_id), summary: String(row.summary), ...(row.action_json ? { action: JSON.parse(String(row.action_json)) } : {}), status: row.status as ApprovalStatus, createdAt: String(row.created_at), ...(row.decided_at ? { decidedAt: String(row.decided_at) } : {}) }; }

export function listTasks(): Task[] { return db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all().map(task); }
export function getTask(id: string): Task | undefined { const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id); return row ? task(row) : undefined; }
export function insertTask(input: Omit<Task, "updatedAt" | "attempts">): Task { const now = new Date().toISOString(); db.prepare("INSERT INTO tasks (id,title,description,specialist,parent_task_id,state,created_at,updated_at,attempts,error) VALUES (?,?,?,?,?,?,?, ?,0,NULL)").run(input.id, input.title, input.description, input.specialist, input.parentTaskId ?? null, input.state, input.createdAt, now); return getTask(input.id)!; }
export function updateTask(id: string, state: TaskState, error?: string): Task | undefined { db.prepare("UPDATE tasks SET state = ?, error = ?, updated_at = ?, attempts = attempts + CASE WHEN state = 'failed' AND ? = 'queued' THEN 1 ELSE 0 END WHERE id = ?").run(state, error ?? null, new Date().toISOString(), state, id); return getTask(id); }
export function listPendingApprovals(): Approval[] { return db.prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at DESC").all().map(approval); }
export function getApproval(id: string): Approval | undefined { const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id); return row ? approval(row) : undefined; }
export function hasPendingApproval(taskId: string): boolean { return Boolean(db.prepare("SELECT 1 FROM approvals WHERE task_id = ? AND status = 'pending'").get(taskId)); }
export function insertApproval(input: Omit<Approval, "decidedAt"> & { action?: ProposedAction }): Approval { db.prepare("INSERT INTO approvals (id,task_id,summary,action_json,status,created_at,decided_at) VALUES (?,?,?,?,?,?,NULL)").run(input.id, input.taskId, input.summary, input.action ? JSON.stringify(input.action) : null, input.status, input.createdAt); return getApproval(input.id)!; }
export function decideApproval(id: string, status: ApprovalStatus): Approval | undefined { db.prepare("UPDATE approvals SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'").run(status, new Date().toISOString(), id); return getApproval(id); }
export function addEvent(input: Omit<Event, "createdAt">): Event { const createdAt = new Date().toISOString(); db.prepare("INSERT INTO events (id,task_id,type,payload,created_at) VALUES (?,?,?,?,?)").run(input.id, input.taskId ?? null, input.type, JSON.stringify(input.payload), createdAt); return { ...input, createdAt }; }
export function listEvents(taskId?: string): Event[] { const rows = taskId ? db.prepare("SELECT * FROM events WHERE task_id = ? ORDER BY created_at ASC").all(taskId) : db.prepare("SELECT * FROM events ORDER BY created_at DESC").all(); return rows.map(row => ({ id: String(row.id), ...(row.task_id ? { taskId: String(row.task_id) } : {}), type: String(row.type), payload: JSON.parse(String(row.payload)), createdAt: String(row.created_at) })); }
