# AI Office MVP

Prototipe lokal kantor AI 3D dengan gerbang persetujuan manusia.

## Tumpukan Teknologi
- Frontend: Vite + React + TypeScript + React Three Fiber / Drei
- Backend: Node.js + Express + TypeScript
- Penyimpanan: SQLite lokal
- Integrasi agen: adapter Agency Agents melalui Hermes read-only; tanpa eksekusi shell

## Persyaratan
- Node.js 22+ disarankan
- npm
- Hermes Desktop/CLI terpasang
- Agency Agents Router terkonfigurasi di direktori Hermes

## Menjalankan
Buka dua terminal.

### Backend
```powershell
cd server
npm install
npm run dev
```

### Frontend
```powershell
cd web
npm install
npm run dev
```

Buka URL Vite yang tampil di terminal frontend.

## Fitur
- Ruang kantor 3D dan meja agen
- Daftar agen dengan status
- Pembuatan tugas dan penugasan spesialis
- Antrean persetujuan dan endpoint demo
- Batas API backend lokal

## Dua Port
Backend menjalankan dua listener:

| Port | Isi |
|---|---|
| `PORT` (4317) | API `/api/*` |
| `ARTIFACT_PORT` (default `PORT + 1`) | Hasil kerja agent di `/projects/<taskId>/` |

Hasil kerja agent **sengaja** dipisah ke origin sendiri. Kalau satu origin, HTML buatan
agent bisa memanggil `/api/*` sebagai same-origin (melewati CORS) dan mengendalikan API.
Ubah `ARTIFACT_PORT` hanya bila `VITE_PROJECTS_URL` di frontend ikut disesuaikan.

## Keamanan Lokal
- Artifact agent disajikan dari origin terpisah (`ARTIFACT_PORT`) sehingga HTML buatan
  agent tidak bisa memanggil `/api/*` sebagai same-origin.
- Isi `AI_OFFICE_TOKEN` di `server/.env` untuk mewajibkan `Authorization: Bearer <token>`
  pada semua `/api/*`, lalu samakan `VITE_API_TOKEN` di `web/.env`. Tanpa token, server
  menolak bind ke host non-loopback.
- `id` project divalidasi sebagai slug aman sebelum menyentuh filesystem.

## Batasan Sengaja
- Prototipe ini tidak mengklaim terhubung ke sesi Hermes aktif.
- Adapter Hermes tetap stub sampai CLI, versi, dan mekanisme pemanggilan terpasang terverifikasi.
- Tombol persetujuan hanya mendemonstrasikan alur; tidak menjalankan tindakan eksternal.
- Jangan membuka backend ke LAN atau internet sebelum eksekusi alat memiliki autentikasi dan daftar izin.
- Nilai rahasia harus disimpan di `.env`, bukan di source code. Jangan masukkan secret ke `VITE_*`.

## Status Implementasi
- CLI Hermes terverifikasi: `v0.22.2`.
- Plugin `agency-agents-router` terpasang, aktif, dan lulus `hermes plugins doctor`.
- Roster memakai slug Agency Agents yang valid: `senior-project-manager`, `backend-architect`, `frontend-developer`, `ui-designer`, dan `code-reviewer`.
- Adapter perencanaan Hermes memakai `execFile` tanpa shell, dengan semua toolset
  dimatikan (`-t ""`) dan dijalankan di folder sekali pakai. `--safe-mode` tersedia
  lewat `HERMES_READONLY_STRICT=1`, tetapi tidak bisa dipakai bersama provider kustom
  karena flag itu mengabaikan `config.yaml`.

## Tahap Implementasi Berikutnya
1. Perketat audit log agar payload sensitif tidak tersimpan.
2. Tambahkan allowlist tool sebelum mengaktifkan eksekusi otonom.
3. Tambahkan integrasi knowledge base dengan sitasi di UI.
4. Ganti polling 2 detik dengan SSE agar UI reaktif tanpa jitter.
5. Tambahkan lint (eslint) dan unit test frontend (vitest).
