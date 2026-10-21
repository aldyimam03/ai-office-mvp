# 05 — Skema Event Lengkap

## Tabel Event

| `type` | Kapan muncul | `payload` contoh |
|--------|--------------|------------------|
| `orchestration.started` | Manajer mulai memecah tugas | `{ plan }` |
| `orchestration.completed` | Semua subtugas selesai | `{ results }` |
| `orchestration.failed` | Manajer gagal membuat rencana | `{ error }` |
| `task.delegated` | Subtugas dibuat & dikirim | `{ parentTaskId, specialist }` |
| `task.completed` | Spesialis selesai | `{ specialist, result }` |
| `task.failed` | Spesialis gagal | `{ specialist, error }` |
| `meeting.started` | Rapat dimulai | `{ topic, participants: string[] }` |
| `meeting.ended` | Rapat selesai | `{ topic }` |

## Aturan Konsumsi di Frontend

1. Events terurut naik (terlama → terbaru). Backend harus `ORDER BY id ASC`.
2. State agen = hasil iterasi semua event yang melibatkan slug tersebut, ambil yang terakhir.
3. `meeting.active` = `meeting.started` terakhir lebih baru dari `meeting.ended` terakhir.
4. Payload `task.completed` WAJIB punya `specialist`.

## Endpoint Baca

```ts
app.get("/api/events", (req, res) => {
  const rows = db.prepare(
    "SELECT id, type, task_id, payload, created_at FROM events ORDER BY id ASC LIMIT 500"
  ).all();
  const events = rows.map((r) => ({
    ...r,
    payload: r.payload ? JSON.parse(r.payload) : {},
  }));
  res.json({ events });
});
```
