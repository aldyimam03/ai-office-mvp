# 04 — Endpoint Rapat + Skema Database

## Skema `tasks` yang Diperlukan

```sql
ALTER TABLE tasks ADD COLUMN parent_task_id TEXT;
ALTER TABLE tasks ADD COLUMN state TEXT DEFAULT 'queued';
ALTER TABLE tasks ADD COLUMN error TEXT;
```

## Skema `events`

```sql
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  task_id TEXT,
  payload TEXT,
  created_at TEXT NOT NULL
);
```

## Endpoint Rapat

```ts
app.post("/api/tasks/:id/meeting/end", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Tugas tidak ditemukan" });

  record("meeting.ended", task.id, {
    topic: req.body.topic ?? "rapat",
  });
  res.json({ ok: true });
});
```

> `meeting.started` dipicu otomatis oleh `/orchestrate` ketika `plan.meeting.needed = true`.

## Siklus Rapat

```
meeting.started  →  agen berkumpul di meja bundar
meeting.ended    →  agen kembali ke meja
```
