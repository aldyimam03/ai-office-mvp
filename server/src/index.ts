import express from "express";
import cors from "cors";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { ActionRequest } from "./actions.js";
import { askReadOnly, buildTaskPrompt, delegateTask, hermesStatus } from "./hermes.js";
import { addDocument, searchDocuments } from "./knowledge.js";
import { listProjects, projectDir, readProject, workspaceRoot } from "./projects.js";
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
  { id: "manager", name: "Mara Sol", role: "project manager", agencySlug: "senior-project-manager", personality: "tenang, tegas, menjaga pekerjaan tetap bergerak", catchphrase: "Satu langkah berikutnya yang jelas.", specialty: "mengubah tujuan yang kacau menjadi antrean kerja", color: "#e8b86c", state: "idle" },
  { id: "backend", name: "Bram Forge", role: "backend architect", agencySlug: "backend-architect", personality: "metodis, defensif, terobsesi pada batas sistem", catchphrase: "Buat kegagalan jadi biasa.", specialty: "API, kontrak data, dan layanan andal", color: "#6fa8dc", state: "idle" },
  { id: "frontend", name: "Nia Pixel", role: "frontend developer", agencySlug: "frontend-developer", personality: "presisi, cepat, mengutamakan pengguna", catchphrase: "Kalau terasa lambat, berarti lambat.", specialty: "antarmuka React responsif dan alur aksesibel", color: "#72d6c1", state: "idle" },
  { id: "designer", name: "Luma Vale", role: "UI/UX designer", agencySlug: "ui-designer", personality: "ingin tahu, hangat, tegas soal kejelasan", catchphrase: "Hapus satu hal lagi.", specialty: "sistem visual, interaksi, dan kejelasan produk", color: "#c59be8", state: "idle" },
  { id: "reviewer", name: "Vera Check", role: "code reviewer", agencySlug: "code-reviewer", personality: "baik, skeptis, berbasis bukti", catchphrase: "Tunjukkan kasus tepinya.", specialty: "menemukan risiko, menjaga kualitas, dan keyakinan rilis", color: "#f28f8f", state: "idle" },
];

app.get("/api/health", async (_req, res) => res.json({ ok: true, service: "ai-office-server", persistence: "sqlite", hermes: await hermesStatus() }));
app.get("/api/agents", (_req, res) => res.json(agents));
app.get("/api/tasks", (_req, res) => res.json(listTasks()));
app.get("/api/tasks/:id", (req, res) => { const task = getTask(req.params.id); if (!task) return res.status(404).json({ error: "Tugas tidak ditemukan" }); res.json(task); });
app.get("/api/tasks/:id/events", (req, res) => res.json(listEvents(req.params.id)));

const ALLOWED_SLUGS = [
  "senior-project-manager",
  "backend-architect",
  "frontend-developer",
  "ui-designer",
  "code-reviewer",
  "copywriter",
  "seo-specialist",
];

app.post("/api/tasks/:id/orchestrate", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Tugas tidak ditemukan" });

  void (async () => {
    const planPrompt = `
Kamu adalah senior project manager. Pecah tugas berikut menjadi subtugas.
Setiap subtugas harus punya "slug" dari daftar ini:
${ALLOWED_SLUGS.join(", ")}.

Kembalikan HANYA JSON valid, tanpa markdown:
{
  "subtasks": [
    { "slug": "frontend-developer", "task": "deskripsi tugas konkret" }
  ],
  "meeting": { "needed": true, "topic": "topik diskusi" }
}

Judul: ${task.title}
Deskripsi: ${task.description}
  `.trim();

    try {
      const raw = await askReadOnly(planPrompt);
      const plan: {
        subtasks: { slug: string; task: string }[];
        meeting?: { needed: boolean; topic: string };
      } = JSON.parse(raw.replace(/```json|```/g, "").trim());

      const invalid = plan.subtasks.filter((sub) => !ALLOWED_SLUGS.includes(sub.slug));
      if (invalid.length > 0) {
        updateTask(task.id, "failed", "Slug tidak valid");
        record("task.failed", task.id, { error: "Slug tidak valid", invalid });
        return;
      }

      record("orchestration.started", task.id, { plan });
      const dir = projectDir(task.id);
      const results: { subtaskId: string; slug: string; result?: string; error?: string }[] = [];

      for (const sub of plan.subtasks) {
        const subtaskId = randomUUID();
        insertTask({
          id: subtaskId,
          title: sub.task,
          description: sub.task,
          specialist: sub.slug,
          parentTaskId: task.id,
          state: "queued",
          createdAt: new Date().toISOString(),
        });
        record("task.delegated", subtaskId, { parentTaskId: task.id, specialist: sub.slug });
        updateTask(subtaskId, "in_progress");

        try {
          const existing = readProject(task.id)?.files.map(file => file.path) ?? [];
          const result = await delegateTask(sub.slug, sub.task, dir, existing);
          updateTask(subtaskId, "completed");
          record("task.completed", subtaskId, { specialist: sub.slug, result });
          results.push({ subtaskId, slug: sub.slug, result });
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown";
          updateTask(subtaskId, "failed", message);
          record("task.failed", subtaskId, { specialist: sub.slug, error: message });
          results.push({ subtaskId, slug: sub.slug, error: message });
        }
      }

      if (plan.meeting?.needed) {
        record("meeting.started", task.id, {
          topic: plan.meeting.topic,
          participants: plan.subtasks.map((sub) => sub.slug),
        });
      }

      record("orchestration.completed", task.id, { results, projectUrl: `/projects/${task.id}/` });
      updateTask(task.id, "completed");
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      updateTask(task.id, "failed", message);
      record("orchestration.failed", task.id, { error: message });
      record("task.failed", task.id, { error: message });
    }
  })();

  res.status(202).json({ ok: true, message: "Orkestrasi dimulai di background" });
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
app.get("/api/projects/:taskId", (req, res) => {
  const project = readProject(req.params.taskId);
  if (!project) return res.status(404).json({ error: "Project tidak ditemukan" });
  res.json(project);
});
// Hasil kerja agent bisa langsung dibuka di browser: /projects/<taskId>/
app.use("/projects", express.static(workspaceRoot, { index: "index.html" }));
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

app.post("/api/tasks/:id/demo-run", (req, res) => {
  const task = getTask(req.params.id);
  const agent = agents.find(item => item.agencySlug === task?.specialist);
  if (!task) return res.status(404).json({ error: "Tugas tidak ditemukan" });
  if (!agent) return res.status(400).json({ error: "Specialist Agency Agents tidak ditemukan" });
  if (task.state !== "queued") return res.status(409).json({ error: "Hanya tugas menunggu yang dapat dijalankan" });
  agent.state = "working";
  agent.taskId = task.id;
  const started = updateTask(task.id, "in_progress");
  record("task.demo_started", task.id, { specialist: agent.agencySlug });
  setTimeout(() => {
    agent.state = "idle";
    delete agent.taskId;
    updateTask(task.id, "completed");
    record("task.demo_completed", task.id, { specialist: agent.agencySlug });
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
