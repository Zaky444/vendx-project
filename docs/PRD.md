# PRD — VendX: Tahap Pengembangan Selanjutnya

> **Status**: Disetujui ✅ (8 Sep 2026)
> **Owner**: @Zaky444 | **Developer**: CodeBuddy
> **Workflow**: Setiap task = 1 Issue → diskusi implementation plan → kerja di branch `task/x-nama` → Pull Request → Owner review & merge → sinkron `git pull` ke main.

---

## 1. Latar Belakang

VendX sudah memiliki fondasi kuat: Backend API Node.js/Express (deployed di `api.vendx.site`), Dashboard Web (`www.vendx.site`), integrasi Firebase Realtime Database dan Midtrans Sandbox, serta firmware ESP32 untuk mesin vending.

Sebelum menambah fitur besar, tahap ini fokus memperkuat **keandalan, keamanan, kualitas kode**, ditambah **dua fitur bernilai bisnis**: laporan transaksi dan notifikasi real-time.

## 2. Tujuan

1. Repository rapi dan mudah di-maintain (branch bersih, `.gitignore` lengkap, docs akurat).
2. Masalah sistem terdeteksi dini lewat health check yang informatif.
3. API tahan terhadap input tidak valid (validasi terpusat).
4. Perubahan kode aman dilakukan karena ada automated testing.
5. Owner bisa export laporan transaksi (CSV) untuk pembukuan.
6. Owner mendapat notifikasi Telegram untuk kejadian penting (transaksi sukses, stok habis).

## 3. Ruang Lingkup (Daftar Task)

| Issue | Task | Kategori | Kriteria Selesai (ringkas) |
|---|---|---|---|
| #1 | Bersih-bersih repo | Housekeeping | Branch lama terhapus, `.gitignore` lengkap, README sinkron dengan kondisi terkini |
| #2 | Health check & monitoring | Reliability | `GET /health` memeriksa koneksi Firebase & melaporkan versi, uptime, status dependency |
| #3 | Validasi input API | Security | Semua endpoint POST/PATCH tervalidasi (express-validator), error 400 dengan pesan jelas |
| #4 | Setup testing | Quality | Jest + supertest terpasang, `npm test` jalan, minimal endpoint health + 1 flow transaksi ter-cover |
| #5 | Export CSV transaksi | Fitur | Endpoint `GET /api/transactions/export.csv` + tombol download di dashboard |
| #6 | Notifikasi Telegram | Fitur | Notif terkirim saat transaksi sukses & stok item habis; konfigurasi via env |

## 4. Di Luar Ruang Lingkup (Out of Scope)

- Migrasi Midtrans Sandbox → Production
- Perubahan firmware ESP32
- Redesign UI/UX dashboard besar-besaran
- Multi-machine management UI

## 5. Teknologi

Tetap mengikuti stack existing: **Node.js, Express, Firebase Admin, Midtrans Client**. Tambahan: `express-validator` (Task #3), `jest` + `supertest` (Task #4), `node-fetch`/axios untuk Telegram Bot API (Task #6).

## 6. Alur Kerja per Task (Wajib)

1. Issue dibuat → Owner menyetujui *implementation plan* di komentar issue.
2. `git pull origin main` → buat branch `task/<no>-<nama>`.
3. Implementasi + commit berpesan jelas → push branch (TIDAK pernah langsung ke `main`).
4. Buat Pull Request → Owner review kode → Owner merge.
5. Developer `git pull origin main` untuk sinkronisasi sebelum task berikutnya.

## 7. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Testing butuh kredensial Firebase | Gunakan mock firebase-admin di unit test |
| Token Telegram bocor | Simpan di `.env` / Vercel env, masuk `.gitignore` (Task #1) |
| Perubahan validasi merusak ESP32 | Uji kontrak request ESP32 di Task #3 sebelum PR |
