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
- Adapter Hermes tetap read-only, memakai `execFile` dan `--safe-mode`.

## Tahap Implementasi Berikutnya
1. Tambahkan autentikasi pengguna dan session management.
2. Perketat audit log agar payload sensitif tidak tersimpan.
3. Tambahkan allowlist tool sebelum mengaktifkan eksekusi otonom.
4. Tambahkan integrasi knowledge base dengan sitasi di UI.
5. Pecah bundle frontend besar dengan `manualChunks` atau lazy loading.
