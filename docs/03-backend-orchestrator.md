# 03 — Endpoint Orkestrasi Manajer

## Tujuan

Satu tugas masuk → manajer memecah → spesialis bekerja.

## Kode Lengkap

Tambahkan di `server/src/index.ts`:

```ts
import { randomUUID } from "node:crypto";
import { askReadOnly, delegateTask } from "./hermes.js";
import { insertTask, updateTask, getTask, record } from "./db.js";

const ALLOWED_SLUGS = [
  "senior-project-manager",
  "backend-architect",
  "frontend-developer",
  "ui-designer",
  "code-reviewer",
  "copywriter",
  "seo-specialist",
];

app.post("/api/tasks/:id/orchestrate", async (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Tugas tidak ditemukan" });

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

  let plan: {
    subtasks: { slug: string; task: string }[];
    meeting?: { needed: boolean; topic: string };
  };

  try {
    const raw = await askReadOnly(planPrompt);
    plan = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch (err) {
    record("orchestration.failed", task.id, {
      error: err instanceof Error ? err.message : "parse error",
    });
    return res.status(502).json({ error: "Manajer gagal menyusun rencana" });
  }

  const invalid = plan.subtasks.filter((s) => !ALLOWED_SLUGS.includes(s.slug));
  if (invalid.length > 0) {
    return res.status(422).json({ error: "Slug tidak valid", invalid });
  }

  record("orchestration.started", task.id, { plan });

  const results: { subtaskId: string; slug: string; result?: string; error?: string }[] = [];

  for (const sub of plan.subtasks) {
    const subtaskId = randomUUID();
    insertTask({
      id: subtaskId,
      title: sub.task,
      description: sub.task,
      specialist: sub.slug,
      state: "queued",
      parentTaskId: task.id,
      createdAt: new Date().toISOString(),
    });
    record("task.delegated", subtaskId, {
      parentTaskId: task.id,
      specialist: sub.slug,
    });
    updateTask(subtaskId, { state: "working" });

    try {
      const result = await delegateTask(sub.slug, sub.task);
      updateTask(subtaskId, { state: "completed" });
      record("task.completed", subtaskId, {
        specialist: sub.slug,
        result,
      });
      results.push({ subtaskId, slug: sub.slug, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      updateTask(subtaskId, { state: "failed", error: message });
      record("task.failed", subtaskId, {
        specialist: sub.slug,
        error: message,
      });
      results.push({ subtaskId, slug: sub.slug, error: message });
    }
  }

  if (plan.meeting?.needed) {
    record("meeting.started", task.id, {
      topic: plan.meeting.topic,
      participants: plan.subtasks.map((s) => s.slug),
    });
  }

  record("orchestration.completed", task.id, { results });
  updateTask(task.id, { state: "completed" });

  res.json({ ok: true, plan, results });
});
```

## Catatan Penting

- `record("task.completed", ...)` **wajib menyertakan `specialist`** di payload.
- Validasi `ALLOWED_SLUGS` mencegah manajer mengarang slug.
- Eksekusi masih serial; paralel nanti bisa pakai `Promise.all`.

## Uji

```bash
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Buat landing page Flowdesk","description":"Halaman marketing"}'

curl -X POST http://localhost:3001/api/tasks/<ID>/orchestrate
```
