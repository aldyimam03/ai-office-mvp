import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ALLOWED_SLUGS } from "./agents.js";
import type { Task } from "./db.js";
import { insertTask, updateTask } from "./db.js";
import { record } from "./events.js";
import { askReadOnly, delegateTask } from "./hermes.js";
import { projectDir, readProject } from "./projects.js";

// Output LLM divalidasi, bukan dipercaya: sebelumnya `plan.subtasks.filter` dipanggil
// mentah sehingga balasan prosa menghasilkan "Cannot read properties of undefined".
const PlanSchema = z.object({
  subtasks: z
    .array(
      z.object({
        slug: z.string().trim().min(1),
        task: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20),
  meeting: z
    .object({
      needed: z.boolean(),
      topic: z.string().trim().max(200).default(""),
    })
    .optional(),
});

export type Plan = z.infer<typeof PlanSchema>;

export function buildPlanPrompt(task: Pick<Task, "title" | "description">): string {
  return `
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
}

export function parsePlan(raw: string): Plan {
  const cleaned = raw.replace(/```json|```/gi, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Rencana dari Hermes bukan JSON valid");
  }
  const result = PlanSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map(issue => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    throw new Error(`Rencana dari Hermes tidak valid: ${issues.join("; ")}`);
  }
  const invalid = result.data.subtasks.filter(sub => !ALLOWED_SLUGS.includes(sub.slug));
  if (invalid.length > 0) {
    throw new Error(`Slug tidak valid: ${invalid.map(sub => sub.slug).join(", ")} (pilihan: ${ALLOWED_SLUGS.join(", ")})`);
  }
  return result.data;
}

// Satu subtugas = satu delegasi Hermes di folder project induk. Dipakai orkestrasi
// dan tombol "Coba lagi" supaya jalur sukses/gagal tidak terduplikasi.
export async function delegateSubtask(subtaskId: string, slug: string, description: string, projectTaskId: string) {
  updateTask(subtaskId, "in_progress");
  try {
    const existing = readProject(projectTaskId)?.files.map(file => file.path) ?? [];
    const result = await delegateTask(slug, description, projectDir(projectTaskId), existing);
    updateTask(subtaskId, "completed");
    record("task.completed", subtaskId, { specialist: slug, result });
    return { subtaskId, slug, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    updateTask(subtaskId, "failed", message);
    record("task.failed", subtaskId, { specialist: slug, error: message });
    return { subtaskId, slug, error: message };
  }
}

// Pemanggil WAJIB sudah menandai task in_progress secara sinkron sebelum memanggil ini;
// itulah yang membuat dua POST /orchestrate beruntun tidak menjalankan rencana dua kali.
export async function startOrchestration(task: Task): Promise<void> {
  try {
    const raw = await askReadOnly(buildPlanPrompt(task));
    const plan = parsePlan(raw);

    record("orchestration.started", task.id, { plan });
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
      results.push(await delegateSubtask(subtaskId, sub.slug, sub.task, task.id));
    }

    if (plan.meeting?.needed) {
      record("meeting.started", task.id, {
        topic: plan.meeting.topic,
        participants: plan.subtasks.map(sub => sub.slug),
      });
      // Rapat dianggap selesai di akhir orkestrasi; tanpa ini UI menampilkan
      // agen "berdiskusi" selamanya walau semua langkah sudah selesai/gagal.
      record("meeting.ended", task.id, { topic: plan.meeting.topic });
    }

    record("orchestration.completed", task.id, { results, projectPath: `/projects/${task.id}/` });
    updateTask(task.id, "completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    updateTask(task.id, "failed", message);
    record("orchestration.failed", task.id, { error: message });
    record("task.failed", task.id, { error: message });
  }
}
