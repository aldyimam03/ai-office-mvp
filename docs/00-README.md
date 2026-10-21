# AI Office MVP — Dokumentasi Implementasi

Kumpulan dokumen untuk mengubah `ai-office-mvp` dari kantor 3D statis menjadi kantor AI yang hidup.

## Daftar File

| File | Isi |
|------|-----|
| `00-README.md` | Overview (file ini) |
| `01-arsitektur.md` | Arsitektur sistem, prasyarat, environment |
| `02-backend-hermes-adapter.md` | Perbaikan `hermes.ts` (adapter delegasi) |
| `03-backend-orchestrator.md` | Endpoint orkestrasi manajer |
| `04-backend-meeting.md` | Endpoint rapat + skema database |
| `05-event-schema.md` | Skema event lengkap |
| `06-frontend-layout.md` | Layout koordinat + derivasi state |
| `07-frontend-komponen.md` | Komponen 3D (AgentAvatar, MeetingTable, App) |
| `08-alur-dan-eksekusi.md` | Alur data end-to-end + rencana 6 hari |
| `09-testing-troubleshooting.md` | Checklist tes, troubleshooting, roadmap |

## Status Repo

**60–70% jadi.** Fondasi 3D, CRUD tugas, event log, dan SQLite sudah ada.

Yang kurang:
- Adapter Hermes masih `--safe-mode` (tool delegation tidak pernah dipanggil)
- Belum ada endpoint orkestrasi manajer
- Belum ada state ruang rapat (di DB, API, maupun scene 3D)

## Cara Pakai

1. Baca `01-arsitektur.md` untuk paham gambaran besar
2. Ikuti urutan `02` → `03` → `04` (backend dulu)
3. Lanjut `05` → `06` → `07` (frontend)
4. Eksekusi mengikuti `08`
5. Validasi dengan `09`

## Prinsip Kunci

- **9router hanya menyediakan model.** Hermes yang memegang plugin dan agen.
- **Frontend hanya membaca event.** Semua state berasal dari DB, bukan state internal React.
- **Manajer adalah Hermes.** Tidak perlu framework orkestrasi tambahan untuk MVP.
