import express from "express";
import cors from "cors";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { ActionRequest } from "./actions.js";
import { askReadOnly, buildTaskPrompt, hermesStatus } from "./hermes.js";
import { addDocument, searchDocuments } from "./knowledge.js";
import { addEvent, decideApproval, getApproval, getTask, hasPendingApproval, insertApproval, insertTask, listEvents, listPendingApprovals, listTasks, updateTask } from "./db.js";

export const app = express();
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "");
const corsOrigins = (process.env.CORS_ORIGINS ?? "").split(",").map(value => value.trim()).filter(Boolean);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be valid");
if (corsOrigins.length === 0) throw new Error("CORS_ORIGINS must contain at least one origin");
if (!host.trim()) throw new Error("HOST must not be empty");

// Versi lokal. Jangan ikat ke 0.0.0.0 sebelum autentikasi tersedia.
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: "1mb" }));

type AgentState = "idle" | "working" | "waiting_approval" | "offline";
type Agent = {
  id: string;
  name: string;
  role: string;
  agencySlug: string;
  personality: string;
  catchphrase: string;
  specialty: string;
  color: string;
  state: AgentState;
  taskId?: string;
};

// Character layer maps visible employees to Agency Agents specialists.
const agents: Agent[] = [
  { id: "manager", name: "Mara Sol", role: "Manajer Kantor", agencySlug: "project-manager", personality: "tenang, tegas, menjaga pekerjaan tetap bergerak", catchphrase: "Satu langkah berikutnya yang jelas.", specialty: "mengubah tujuan yang kacau menjadi antrean kerja", color: "#e8b86c", state: "idle" },
  { id: "backend", name: "Bram Forge", role: "Arsitek Backend", agencySlug: "backend-architect", personality: "metodis, defensif, terobsesi pada batas sistem", catchphrase: "Buat kegagalan jadi biasa.", specialty: "API, kontrak data, dan layanan andal", color: "#6fa8dc", state: "idle" },
  { id: "frontend", name: "Nia Pixel", role: "Pengembang Frontend", agencySlug: "frontend-developer", personality: "presisi, cepat, mengutamakan pengguna", catchphrase: "Kalau terasa lambat, berarti lambat.", specialty: "antarmuka React responsif dan alur aksesibel", color: "#72d6c1", state: "idle" },
  { id: "designer", name: "Luma Vale", role: "Desainer UI/UX", agencySlug: "ui-ux-designer", personality: "ingin tahu, hangat, tegas soal kejelasan", catchphrase: "Hapus satu hal lagi.", specialty: "sistem visual, interaksi, dan kejelasan produk", color: "#c59be8", state: "idle" },
  { id: "reviewer", name: "Vera Check", role: "Peninjau Kode", agencySlug: "code-reviewer", personality: "baik, skeptis, berbasis bukti", catchphrase: "Tunjukkan kasus tepinya.", specialty: "menemukan risiko, menjaga kualitas, dan keyakinan rilis", color: "#f28f8f", state: "idle" },
];

app.get("/api/health", async (_req, res) => res.json({ ok: true, service: "ai-office-server", persistence: "sqlite", hermes: await hermesStatus() }));
app.get("/api/agents", (_req, res) => res.json(agents));
app.get("/api/tasks", (_req, res) => res.json(listTasks()));
app.get("/api/tasks/:id", (req, res) => { const task = getTask(req.params.id); if (!task) return res.status(404).json({ error: "Tugas tidak ditemukan" }); res.json(task); });
app.get("/api/tasks/:id/events", (req, res) => res.json(listEvents(req.params.id)));
app.post("/api/tasks/:id/analyze", async (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Tugas tidak ditemukan" });
  try {
    const analysis = await askReadOnly(buildTaskPrompt(task));
    record("task.analyzed", task.id, { provider: "hermes", mode: "read-only" });
    res.json({ taskId: task.id, provider: "hermes", mode: "read-only", analysis });
  } catch (error) {
    record("task.analysis_failed", task.id, { provider: "hermes", error: error instanceof Error ? error.message : "Kesalahan tidak diketahui" });
    res.status(503).json({ error: error instanceof Error ? error.message : "Analisis Hermes gagal" });
  }
});
app.get("/api/events", (_req, res) => res.json(listEvents()));
app.get("/api/approvals", (_req, res) => res.json(listPendingApprovals()));
app.get("/api/knowledge/search", (req, res) => {
  const query = z.string().trim().min(2).max(200).safeParse(req.query.q);
  const owner = z.string().trim().min(1).max(100).safeParse(req.query.owner ?? "local");
  if (!query.success || !owner.success) return res.status(400).json({ error: "q and owner are required" });
  res.json(searchDocuments(query.data, owner.data));
});
app.post("/api/knowledge/documents", (req, res) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(200), content: z.string().min(1).max(100000), owner: z.string().trim().min(1).max(100).default("local") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid document", details: parsed.error.flatten() });
  res.status(201).json(addDocument(parsed.data.title, parsed.data.content, parsed.data.owner));
});

function record(type: string, taskId: string | undefined, payload: unknown) { addEvent({ id: randomUUID(), taskId, type, payload }); }

const TaskInput = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(5000).default(""),
  specialist: z.string().trim().min(1).max(100).default("generalist"),
});

app.post("/api/tasks", (req, res) => {
  const parsed = TaskInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid task", details: parsed.error.flatten() });
  const task = insertTask({ id: randomUUID(), ...parsed.data, state: "queued", createdAt: new Date().toISOString() });
  record("task.created", task.id, { title: task.title, specialist: task.specialist });
  res.status(201).json(task);
});

// Demonstration only: create a proposed action that requires human review.
// No external action is executed when approved in this starter.
app.delete("/api/tasks/:id", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Tugas tidak ditemukan" });
  if (["completed", "failed", "cancelled"].includes(task.state)) return res.status(409).json({ error: "Tugas sudah selesai" });
  const cancelled = updateTask(task.id, "cancelled");
  record("task.cancelled", task.id, {});
  res.json(cancelled);
});
app.post("/api/tasks/:id/retry", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Tugas tidak ditemukan" });
  if (task.state !== "failed") return res.status(409).json({ error: "Hanya tugas gagal yang dapat diulang" });
  const retried = updateTask(task.id, "queued");
  record("task.retried", task.id, { attempts: retried?.attempts ?? 0 });
  res.json(retried);
});

app.post("/api/tasks/:id/request-approval", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Tugas tidak ditemukan" });
  if (hasPendingApproval(task.id)) return res.status(409).json({ error: "Tugas sudah memiliki persetujuan yang menunggu" });
  const parsed = ActionRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Ringkasan dan tindakan usulan yang valid wajib diisi", details: parsed.error.flatten() });
  const updated = updateTask(task.id, "waiting_approval");
  const approval = insertApproval({ id: randomUUID(), taskId: task.id, summary: parsed.data.summary, action: parsed.data.action, status: "pending", createdAt: new Date().toISOString() });
  record("approval.requested", task.id, { approvalId: approval.id, action: parsed.data.action });
  res.status(201).json({ approval, task: updated });
});

app.post("/api/approvals/:id/decision", (req, res) => {
  const decision = z.object({ decision: z.enum(["approved", "rejected"]) }).safeParse(req.body);
  if (!decision.success) return res.status(400).json({ error: "Keputusan harus berupa approved atau rejected" });
  const approval = getApproval(req.params.id);
  if (!approval) return res.status(404).json({ error: "Persetujuan tidak ditemukan" });
  if (approval.status !== "pending") return res.status(409).json({ error: "Persetujuan sudah diputuskan" });
  const decided = decideApproval(approval.id, decision.data.decision);
  const task = getTask(approval.taskId);
  if (task) updateTask(task.id, decision.data.decision === "approved" ? "queued" : "failed");
  record("approval.decided", approval.taskId, { approvalId: approval.id, decision: decision.data.decision });
  res.json({ approval: decided, task: getTask(approval.taskId), execution: "not-configured" });
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(port, host, () => {
    console.log(`AI Office API listening on http://${host}:${port}`);
  });
}
