import express from "express";
import cors from "cors";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { ActionRequest } from "./actions.js";
import { AGENTS, findAgent } from "./agents.js";
import { authEnabled, isLoopbackHost, requireToken } from "./auth.js";
import { askReadOnly, buildTaskPrompt, hermesStatus } from "./hermes.js";
import { addDocument, searchDocuments } from "./knowledge.js";
import { deleteProjectData, deleteProjectFolder, listProjects, readProject } from "./projects.js";
import { createArtifactApp, resolveArtifactHost, resolveArtifactPort } from "./artifacts.js";
import { decideApproval, failInterruptedTasks, getApproval, getTask, hasActiveSubtasks, hasPendingApproval, insertApproval, insertTask, listEvents, listEventsSince, listPendingApprovals, listTasks, updateTask } from "./db.js";
import { record } from "./events.js";
import { delegateSubtask, startOrchestration } from "./orchestrator.js";

export const app = express();
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "");
const corsOrigins = (process.env.CORS_ORIGINS ?? "").split(",").map(value => value.trim()).filter(Boolean);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be valid");
if (corsOrigins.length === 0) throw new Error("CORS_ORIGINS must contain at least one origin");
if (!host.trim()) throw new Error("HOST must not be empty");
// Tanpa token, API hanya boleh hidup di loopback. CORS bukan autentikasi: `curl` tembus.
if (!authEnabled() && !isLoopbackHost(host)) throw new Error("AI_OFFICE_TOKEN wajib diisi bila HOST bukan loopback");

// Versi lokal. Tanpa AI_OFFICE_TOKEN, API hanya boleh hidup di loopback.
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: "1mb" }));
app.use("/api", requireToken);

const agents = AGENTS;

app.get("/api/health", async (_req, res) => res.json({ ok: true, service: "ai-office-server", persistence: "sqlite", auth: authEnabled() ? "token" : "off", hermes: await hermesStatus() }));
app.get("/api/agents", (_req, res) => {
  // State diturunkan dari task yang sedang berjalan, bukan field mutable di memori
  // yang hanya berubah lewat endpoint demo.
  const active = new Set(listTasks().filter(task => task.state === "in_progress").map(task => task.specialist));
  res.json(agents.map(agent => ({ ...agent, state: active.has(agent.slug) ? "working" : "idle" })));
});

// Polling inkremental: satu request menggantikan empat (tasks, approvals, events).
app.get("/api/state", (req, res) => {
  const since = z.string().datetime().optional().safeParse(req.query.since);
  if (!since.success) return res.status(400).json({ error: "since harus ISO datetime" });
  res.json({
    serverTime: new Date().toISOString(),
    tasks: listTasks(),
    approvals: listPendingApprovals(),
    events: listEventsSince(since.data),
  });
});
app.get("/api/tasks", (_req, res) => res.json(listTasks()));
app.get("/api/tasks/:id", (req, res) => { const task = getTask(req.params.id); if (!task) return res.status(404).json({ error: "Tugas tidak ditemukan" }); res.json(task); });
app.get("/api/tasks/:id/events", (req, res) => res.json(listEvents(req.params.id)));

app.post("/api/tasks/:id/orchestrate", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Tugas tidak ditemukan" });
  if (task.parentTaskId) return res.status(409).json({ error: "Subtugas tidak bisa di-orchestrate" });
  if (task.state !== "queued") return res.status(409).json({ error: `Hanya tugas berstatus queued yang bisa di-orchestrate (sekarang ${task.state})` });
  if (hasActiveSubtasks(task.id)) return res.status(409).json({ error: "Masih ada subtugas berjalan untuk tugas ini" });

  // Ditandai sinkron sebelum kerja async dimulai: tanpa ini dua POST beruntun
  // sama-sama lolos guard dan rencananya dijalankan dua kali.
  const started = updateTask(task.id, "in_progress");
  void startOrchestration(task);
  res.status(202).json({ ok: true, task: started, message: "Orkestrasi dimulai di background" });
});

app.post("/api/tasks/:id/meeting/end", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Tugas tidak ditemukan" });

  record("meeting.ended", task.id, {
    topic: req.body.topic ?? "rapat",
  });
  res.json({ ok: true });
});

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
app.get("/api/projects", (_req, res) => res.json(listProjects()));
app.delete("/api/projects/:taskId", (req, res) => {
  const { taskId } = req.params;
  // Cek keberadaan task dulu: tanpa ini, id sembarang tetap membalas 200 dan
  // folder apa pun yang namanya cocok ikut terhapus.
  const removed = deleteProjectData(taskId);
  if (removed === 0) return res.status(404).json({ error: "Project tidak ditemukan" });
  deleteProjectFolder(taskId);
  record("project.deleted", taskId, { tasks: removed });
  res.json({ ok: true, taskId, tasks: removed });
});
app.get("/api/projects/:taskId", (req, res) => {
  const project = readProject(req.params.taskId);
  if (!project) return res.status(404).json({ error: "Project tidak ditemukan" });
  res.json(project);
});
app.post("/api/events/meeting/start", (req, res) => {
  const parsed = z.object({
    topic: z.string().trim().min(1).max(200),
    participants: z.array(z.string().trim().min(1).max(100)).max(20),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid meeting event", details: parsed.error.flatten() });

  record("meeting.started", undefined, parsed.data);
  res.status(200).json({ ok: true });
});
app.get("/api/approvals", (_req, res) => res.json(listPendingApprovals()));
app.get("/api/knowledge/search", (req, res) => {
  const query = z.string().trim().min(2).max(200).safeParse(req.query.q);
  if (!query.success) return res.status(400).json({ error: "q wajib diisi (2-200 karakter)" });
  // Owner tidak diambil dari query: pemanggil tidak boleh memilih arsip siapa yang dibaca.
  res.json(searchDocuments(query.data));
});
app.post("/api/knowledge/documents", (req, res) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(200), content: z.string().min(1).max(100000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid document", details: parsed.error.flatten() });
  res.status(201).json(addDocument(parsed.data.title, parsed.data.content));
});


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

// Endpoint demo memalsukan penyelesaian task tanpa menjalankan agen; hanya untuk dev.
// Dibaca per request (bukan saat modul dimuat) supaya bisa diuji dan dimatikan tanpa restart.
function demoEnabled(): boolean {
  return process.env.AI_OFFICE_ENABLE_DEMO === "1";
}

app.post("/api/tasks/:id/demo-run", (req, res) => {
  if (!demoEnabled()) return res.status(404).json({ error: "Endpoint demo nonaktif (set AI_OFFICE_ENABLE_DEMO=1)" });
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Tugas tidak ditemukan" });
  const agent = findAgent(task.specialist);
  if (!agent) return res.status(400).json({ error: "Specialist Agency Agents tidak ditemukan" });
  if (task.state !== "queued") return res.status(409).json({ error: "Hanya tugas menunggu yang dapat dijalankan" });
  const started = updateTask(task.id, "in_progress");
  record("task.demo_started", task.id, { specialist: agent.slug });
  setTimeout(() => {
    updateTask(task.id, "completed");
    record("task.demo_completed", task.id, { specialist: agent.slug });
  }, 8000);
  res.status(202).json(started);
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

  // Subtugas diulang langsung oleh spesialis yang sama; task induk hanya kembali ke antrean
  // karena perencanaannya harus dijalankan ulang lewat /orchestrate.
  if (!task.parentTaskId) return res.json(retried);
  const parentTaskId = task.parentTaskId;
  const description = task.description || task.title;
  void delegateSubtask(task.id, task.specialist, description, parentTaskId);
  return res.status(202).json(retried);
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

  // Orkestrasi dijalankan di server, bukan oleh frontend: klien lain (curl, mobile)
  // tidak boleh tertinggal di state queued hanya karena tidak memanggil /orchestrate.
  const task = getTask(approval.taskId);
  let orchestration: "started" | "skipped" = "skipped";
  if (task) {
    const approved = decision.data.decision === "approved";
    const updated = updateTask(task.id, approved ? "queued" : "failed");
    if (approved && updated && !updated.parentTaskId && !hasActiveSubtasks(updated.id)) {
      updateTask(updated.id, "in_progress");
      void startOrchestration(updated);
      orchestration = "started";
    }
  }
  record("approval.decided", approval.taskId, { approvalId: approval.id, decision: decision.data.decision, orchestration });
  res.json({ approval: decided, task: getTask(approval.taskId), orchestration, execution: "not-configured" });
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const interrupted = failInterruptedTasks();
  if (interrupted > 0) console.log(`[ai-office] ${interrupted} subtugas ditandai gagal: server restart saat masih berjalan`);
  const artifactHost = resolveArtifactHost();
  const artifactPort = resolveArtifactPort(port);
  app.listen(port, host, () => {
    console.log(`AI Office API listening on http://${host}:${port}`);
  });
  createArtifactApp().listen(artifactPort, artifactHost, () => {
    console.log(`AI Office artifacts listening on http://${artifactHost}:${artifactPort}/projects/<taskId>/`);
  });
}
