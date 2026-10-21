# 08 — Alur Data End-to-End + Rencana 6 Hari

## Alur Data

```
1. POST /api/tasks                     → task dibuat, state=queued
2. POST /api/tasks/:id/orchestrate     → mulai
   ├─ askReadOnly(planPrompt)          → manajer mengembalikan JSON
   ├─ record(orchestration.started)
   ├─ for sub in subtasks:
   │   ├─ insertTask(subtask)
   │   ├─ record(task.delegated)       → event #1
   │   ├─ delegateTask(slug, task)     → Hermes → 9router → model
   │   ├─ record(task.completed)       → event #2
   │   └─ updateTask(state=completed)
   ├─ record(meeting.started)          → agen berjalan ke meja bundar
   └─ record(orchestration.completed)
3. POST /api/tasks/:id/meeting/end     → agen kembali ke meja
```

Frontend polling `/api/events` tiap 2 detik → karakter bereaksi.

## Rencana 6 Hari

### Hari 1 — Perbaiki Adapter Hermes
- [ ] Ganti `askReadOnly` + tambahkan `delegateTask`
- [ ] Hapus `--safe-mode` di jalur delegasi
- [ ] Uji manual delegasi
- [ ] Cek log Hermes: `agency_agents_delegate` dipanggil

### Hari 2 — Endpoint Orkestrasi
- [ ] Implementasi `POST /api/tasks/:id/orchestrate`
- [ ] Tambah kolom `parent_task_id`, `state`, `error`
- [ ] Uji 1 tugas; verifikasi subtugas di DB
- [ ] Verifikasi event `task.delegated` & `task.completed`

### Hari 3 — Endpoint Rapat
- [ ] Implementasi `POST /api/tasks/:id/meeting/end`
- [ ] Verifikasi `meeting.started` / `meeting.ended`
- [ ] Pastikan `isMeetingActive()` benar

### Hari 4 — Karakter 3D
- [ ] Buat `layout.ts`
- [ ] Buat `AgentAvatar.tsx`
- [ ] Uji satu agen bergerak saat event masuk

### Hari 5 — Rapat & Semua Agen
- [ ] Buat `MeetingTable.tsx`
- [ ] Render semua agen
- [ ] Uji siklus rapat penuh

### Hari 6 — Poles & Dokumentasi
- [ ] Speech bubble saat `task.completed`
- [ ] Tombol "Akhiri Rapat" di UI
- [ ] Update README
- [ ] Rekam demo
