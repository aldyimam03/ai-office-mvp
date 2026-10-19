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

## Tahap Implementasi Berikutnya
1. Jalankan perintah penemuan PowerShell dari rencana implementasi.
2. Verifikasi CLI Hermes dan HERMES_HOME tanpa mengasumsikan lokasi konfigurasi.
3. Verifikasi alat Agency Agents Router di dalam Hermes.
4. Sempurnakan adapter Hermes sesuai versi yang terpasang.
5. Tambahkan autentikasi, log audit, dan kebijakan daftar izin sebelum mengaktifkan eksekusi otonom.
