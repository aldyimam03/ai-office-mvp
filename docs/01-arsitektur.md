# 01 — Arsitektur Sistem

## Tujuan Akhir

Ketika pengguna membuat satu tugas besar (misal: "Buat landing page Flowdesk"), sistem harus:

1. **Manajer AI** (`senior-project-manager`) menerima tugas dan memecahnya menjadi subtugas terstruktur.
2. Setiap subtugas **didelegasikan** ke spesialis dari katalog `agency-agents`.
3. Jika manajer memutuskan perlu diskusi, **rapat** dimulai: beberapa agen berkumpul di meja bundar.
4. Semua kejadian tercatat sebagai **event** dan menggerakkan **karakter 3D**.
5. Setelah rapat selesai, agen kembali ke meja dan hasil dikumpulkan.

## Diagram Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│                     USER (browser)                          │
│  React + Three.js (Vite, port 5173)                         │
│  - Peta kantor 3D, meja, ruang rapat                        │
│  - Karakter agen yang bergerak                              │
│  - Panel tugas, event log, status approval                  │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (fetch /api/*)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         Node.js + Express (server, port 3001)               │
│  - /api/tasks, /api/events, /api/agents                     │
│  - /api/tasks/:id/orchestrate    ← BARU                     │
│  - /api/tasks/:id/meeting/end    ← BARU                     │
│  - SQLite (tasks, events, approvals)                        │
│  - hermes.ts (adapter)           ← DIRUBAH                  │
└────────────────────────┬────────────────────────────────────┘
                         │ child_process (hermes -z ...)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Hermes GUI / CLI                           │
│  - Plugin: agency-agents-router (4 tools)                   │
│  - 282 agen di data/agents.json                             │
│  - Model provider → 9router                                 │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (OpenAI-compatible)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   9router (gateway)                         │
│  - Routing ke OpenAI, Claude, Gemini, Ollama, dll.          │
└─────────────────────────────────────────────────────────────┘
```

## Prinsip Kunci

- **9router hanya menyediakan model.** Hermes memegang plugin dan agen. MVP tidak perlu bicara ke 9router secara langsung.
- **Frontend hanya membaca event.** Karakter bergerak karena ada event baru, bukan karena state internal React.
- **Manajer = Hermes itu sendiri.** Tidak perlu CrewAI/LangGraph untuk MVP.

## Prasyarat (Harus Sudah Berjalan)

- [ ] Hermes terinstal dan bisa dijalankan via CLI (`hermes -z "..."`)
- [ ] Plugin `agency-agents-router` aktif (4 tools: `search`, `inspect`, `load`, `delegate`)
- [ ] `data/agents.json` berisi 282 agen
- [ ] 9router berjalan sebagai gateway model
- [ ] Hermes dikonfigurasi memakai 9router (`~/.hermes/config.yaml`)

## Variabel `.env` di Server

```env
# server/.env
PORT=3001
HERMES_BIN=hermes
HERMES_MODEL=claude-3-5-sonnet
HERMES_TIMEOUT_MS=300000
```

## Verifikasi Cepat Sebelum Ngoding

```powershell
# 1. Hermes jalan
hermes --version

# 2. Plugin terdaftar
hermes plugin list | Select-String agency-agents-router

# 3. Delegasi bekerja (harus keluar hasil terstruktur)
hermes -z "Use agency-agents-router. Delegate to frontend-developer: buat struktur landing page."
```

Jika langkah 3 gagal, **jangan lanjut** ke kode. Perbaiki konfigurasi Hermes dulu.
