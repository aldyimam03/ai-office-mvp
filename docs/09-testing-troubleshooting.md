# 09 — Checklist Tes, Troubleshooting, Roadmap

## Checklist Pengujian

- [ ] `GET /api/events` mengembalikan list event terurut naik
- [ ] `POST /api/tasks/:id/orchestrate` menghasilkan minimal 2 subtugas
- [ ] `parent_task_id` subtugas = id tugas induk
- [ ] Event `task.delegated` berisi `specialist` valid
- [ ] Karakter bergerak saat event masuk
- [ ] `meeting.started` memicu karakter ke meja bundar
- [ ] `meeting.ended` memicu karakter kembali ke meja
- [ ] Task gagal menampilkan indikator merah
- [ ] Reload browser tidak menghilangkan state

## Troubleshooting

| Gejala | Penyebab | Solusi |
|--------|----------|--------|
| Subtugas tidak muncul | `askReadOnly` mengembalikan teks non-JSON | Perkuat prompt: "Kembalikan HANYA JSON" |
| Hermes tidak memanggil `delegate` | Masih ada `--safe-mode` | Hapus flag tersebut |
| Karakter diam saja | Event tidak masuk polling | Cek Network tab, pastikan `/api/events` dipanggil |
| Rapat tidak muncul | `meeting.needed = false` | Perkuat prompt, atau paksa `true` untuk 2+ subtugas |
| Delegasi timeout | Model lambat via 9router | Naikkan `HERMES_TIMEOUT_MS` |
| Semua agen di meja sama | `MEETING_SPOTS` kurang | Pastikan jumlah spot ≥ jumlah agen |
| State tidak berubah setelah `task.completed` | Payload tanpa `specialist` | Tambahkan `specialist` di payload |
| `meeting.ended` tidak memicu kembali | `isMeetingActive` belum dipakai | Cek `06-frontend-layout.md` |

## Peningkatan Selanjutnya

- **Paralel delegasi**: `Promise.all(subtasks.map(...))`
- **WebSocket**: ganti polling dengan `socket.io`
- **Speech bubble**: tampilkan `task.completed.result` di atas karakter
- **Approval flow**: hubungkan tabel `approvals` ke UI
- **Persistensi state agen**: simpan di tabel `agents`
- **Multi-ruangan**: pisahkan ruangan per divisi
- **Cost guard**: batasi jumlah subtugas (max 5)
- **Speech synthesis**: Web Speech API untuk membacakan hasil rapat

## Referensi

- Repo plugin: `msitarzewski/agency-agents`
- React Three Fiber: https://r3f.docs.pmnd.rs/
- Drei: https://drei.docs.pmnd.rs/
- 9router: `~/.hermes/config.yaml`
