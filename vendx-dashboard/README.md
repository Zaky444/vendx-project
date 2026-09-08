# VendX Monitoring Dashboard + Backend API

VendX adalah sistem vending machine IoT berbasis ESP32, Backend API Node.js/Express di Vercel, Firebase Realtime Database, Dashboard Web, dan Midtrans Sandbox dengan dukungan Snap dan QRIS.

Dashboard digunakan untuk monitoring admin/operator dan restock. Pembelian user tetap dilakukan dari ESP32/LCD pada mesin vending.

## 📋 Dokumen Project

- **[docs/PRD.md](../docs/PRD.md)** — Product Requirements Document: rencana pengembangan & daftar task aktif
- **[Issues](https://github.com/Zaky444/vendx-project/issues)** — daftar task yang sedang dikerjakan

## 🌿 Workflow Kontribusi

1. Setiap task punya GitHub Issue — diskusikan *implementation plan* di issue sebelum coding.
2. Buat branch dari `main` dengan format `task/<no>-<nama>`.
3. Push ke branch fitur (**jangan langsung ke `main`**), lalu buat Pull Request.
4. PR di-review & di-merge oleh owner.
5. Setelah merge, jalankan `git pull origin main` untuk sinkronisasi.

## Arsitektur

```text
ESP32/LCD -> Backend API -> Firebase Realtime Database
Dashboard -> Backend API -> Firebase Realtime Database
Midtrans -> Backend Webhook -> Firebase Realtime Database
```

Backend API final:

```text
https://api.vendx.site
```

Website dashboard:

```text
https://www.vendx.site
```

Backend diperlukan karena Midtrans Server Key dan Firebase Admin SDK tidak boleh berada di ESP32 atau frontend. Backend menjadi pusat validasi item, stok, harga, transaksi, payment timeout, webhook Midtrans, command untuk ESP32, dispense result, restock, dan audit log.

## Struktur Project

```text
vendx-dashboard/
|-- public/
|   |-- login.html
|   |-- index.html
|   |-- assets/
|   |   `-- vendx-logo.png
|   |-- css/
|   |   |-- auth.css
|   |   `-- dashboard.css
|   `-- js/
|       |-- auth.js
|       |-- auth-guard.js
|       |-- dashboard.js
|       |-- firebase-config.js
|       `-- utils.js
|-- backend/
|   |-- package.json
|   |-- vercel.json
|   |-- .env.example
|   |-- api/
|   |   `-- index.js
|   `-- src/
|       |-- app.js
|       |-- server.js
|       |-- config/
|       |   |-- firebaseAdmin.js
|       |   `-- midtrans.js
|       |-- controllers/
|       |-- routes/
|       |-- services/
|       `-- utils/
|-- database.json
|-- database.rules.json
`-- README.md
```

## Dashboard

Dashboard utama sudah mengambil data monitoring lewat Backend API, bukan Firebase Realtime Database listener langsung.

Endpoint yang dipakai dashboard:

```http
GET  /api/machines/:machineId/overview
GET  /api/machines/:machineId/items
GET  /api/machines/:machineId/status
GET  /api/machines/:machineId/current-order
GET  /api/transactions?machine_id=:machineId&limit=5
GET  /api/logs?machine_id=:machineId&limit=5
POST /api/machines/:machineId/items/:itemId/restock
```

`public/js/dashboard.js` menggunakan:

```js
const API_BASE_URL = "https://api.vendx.site";
```

Data dashboard dimuat dengan polling sederhana setiap 3 detik. Restock juga lewat Backend API, sehingga frontend tidak lagi mengubah stok atau menulis log langsung ke Firebase.

Catatan auth:

- Login masih memakai Firebase Authentication.
- `auth.js` dan `auth-guard.js` masih membaca `/users/{uid}` untuk validasi role, `is_active`, dan `assigned_machine`.
- Ini hanya untuk autentikasi dashboard. Data monitoring utama sudah lewat backend.

## Backend Environment

Buat file `.env` dari contoh:

```bash
cd vendx-dashboard/backend
npm install
copy .env.example .env
```

Isi utama:

```env
PORT=5000
FIREBASE_DATABASE_URL=https://your-project-id-default-rtdb.asia-southeast1.firebasedatabase.app
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"your-project-id","private_key":"-----BEGIN PRIVATE KEY-----\\nYOUR_PRIVATE_KEY\\n-----END PRIVATE KEY-----\\n","client_email":"firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com"}

MIDTRANS_IS_PRODUCTION=false
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxx
PAYMENT_TIMEOUT_MS=120000

CORS_ORIGIN=https://vendx.site,https://www.vendx.site,http://localhost:5500,http://127.0.0.1:5500
```

Jangan upload `.env`, service account JSON, atau Midtrans Server Key ke GitHub. Untuk Vercel, pasang environment variable yang sama di Project Settings. `FIREBASE_SERVICE_ACCOUNT_JSON` harus memakai newline escaped (`\\n`).

## Menjalankan Backend Lokal

```bash
cd vendx-dashboard/backend
npm install
npm run dev
```

Health check:

```http
GET http://localhost:5000/health
```

Response:

```json
{
  "success": true,
  "message": "VendX backend is healthy",
  "timestamp": 1778890000000
}
```

## Deploy Backend ke Vercel

Backend berjalan sebagai REST API serverless.

Entrypoint Vercel:

```text
backend/api/index.js
```

`src/app.js` mengekspor Express app. `src/server.js` hanya untuk development lokal. Backend tidak memakai Firebase listener permanen, worker, atau `setInterval` jangka panjang.

## Endpoint Backend

### Machine Data

```http
GET /api/machines/VM001/overview
GET /api/machines/VM001/items
GET /api/machines/VM001/items/cola
GET /api/machines/VM001/status
PATCH /api/machines/VM001/status
GET /api/machines/VM001/current-order
```

Update status mesin dari ESP32:

```http
PATCH /api/machines/VM001/status
Content-Type: application/json

{
  "connection": "ONLINE",
  "machine_state": "IDLE",
  "is_busy": false,
  "dispense_result": "NONE"
}
```

Backend otomatis menambahkan `last_update` dan `last_updated`.

### Machine Command untuk ESP32

ESP32 dapat polling:

```http
GET /api/machines/VM001/command
```

Command yang mungkin dikembalikan:

```text
IDLE
WAIT_PAYMENT
DISPENSE
PAYMENT_TIMEOUT
COMPLETED
DISPENSE_FAILED
NEEDS_REVIEW
DISPENSING
```

Contoh response saat siap dispense:

```json
{
  "success": true,
  "message": "Machine command fetched",
  "data": {
    "machine_id": "VM001",
    "command": "DISPENSE",
    "transaction_id": "TRX...",
    "item_id": "cola",
    "item_name": "Cola",
    "payment_state": "PAID",
    "order_state": "READY_TO_DISPENSE"
  }
}
```

Endpoint command tidak mengurangi stok dan tidak mengubah `dispense_result`.

### Machine Events dari ESP32

```http
POST /api/machines/VM001/events
Content-Type: application/json
```

Event yang didukung:

```json
{ "event": "ONLINE" }
```

```json
{ "event": "ITEM_SELECTED", "item_id": "cola" }
```

```json
{ "event": "QR_DISPLAYED", "transaction_id": "TRX..." }
```

```json
{ "event": "DISPENSE_STARTED", "transaction_id": "TRX..." }
```

```json
{ "event": "PAYMENT_TIMEOUT_ACK", "transaction_id": "TRX..." }
```

```json
{ "event": "ERROR", "message": "Sensor error" }
```

`DISPENSE_STARTED` hanya mengubah state menjadi `DISPENSING`. Hasil akhir dispense tetap dikirim ke endpoint `dispense-result`.

### Create Transaction

```http
POST /api/transactions
Content-Type: application/json

{
  "machine_id": "VM001",
  "item_id": "cola",
  "qty": 1,
  "payment_method": "qris"
}
```

`payment_method` mendukung:

```text
snap
qris
```

Jika `payment_method` tidak dikirim, default adalah `snap`.

Backend akan:

- validasi `machine_id`, `item_id`, `qty`, dan `payment_method`
- membaca item dari `/machines/{machine_id}/items/{item_id}`
- validasi `is_active`
- validasi stok cukup
- validasi harga valid
- menghitung `total_price`
- membuat `transaction_id`
- membuat payment Midtrans Snap atau QRIS
- menyimpan `/transactions/{transaction_id}`
- menyimpan `/machines/{machine_id}/current_order`
- menyimpan `payment_expired_at`

Stok tidak dikurangi saat transaksi dibuat.

Contoh response QRIS:

```json
{
  "success": true,
  "message": "QRIS payment created",
  "data": {
    "transaction_id": "TRX...",
    "machine_id": "VM001",
    "item_id": "cola",
    "item_name": "Cola",
    "qty": 1,
    "price": 5000,
    "total_price": 5000,
    "payment_method": "qris",
    "payment_url": "NONE",
    "qr_url": "https://...",
    "qr_string": "000201...",
    "snap_token": "NONE",
    "payment_state": "WAITING_PAYMENT",
    "order_state": "WAITING_PAYMENT",
    "payment_expired_at": 1778890120000
  }
}
```

Contoh response Snap:

```json
{
  "success": true,
  "message": "Transaction and Midtrans payment created",
  "data": {
    "transaction_id": "TRX...",
    "machine_id": "VM001",
    "item_id": "cola",
    "item_name": "Cola",
    "qty": 1,
    "price": 5000,
    "total_price": 5000,
    "payment_method": "snap",
    "payment_url": "https://app.sandbox.midtrans.com/snap/v4/redirection/...",
    "qr_url": "https://app.sandbox.midtrans.com/snap/v4/redirection/...",
    "qr_string": "NONE",
    "snap_token": "MIDTRANS_SNAP_TOKEN",
    "payment_state": "WAITING_PAYMENT",
    "order_state": "WAITING_PAYMENT",
    "payment_expired_at": 1778890120000
  }
}
```

Error validasi memakai `code`, misalnya:

```json
{
  "success": false,
  "code": "OUT_OF_STOCK",
  "message": "Insufficient stock",
  "details": {
    "machine_id": "VM001",
    "item_id": "cola",
    "item_name": "Cola",
    "stock": 0,
    "qty": 1
  }
}
```

Code yang dipakai:

```text
VALIDATION_ERROR
MACHINE_NOT_FOUND
ITEM_NOT_FOUND
ITEM_INACTIVE
OUT_OF_STOCK
INVALID_PRICE
MIDTRANS_ERROR
```

### Transaction Status

```http
GET /api/transactions/TRX.../status
```

Endpoint ini juga menjalankan payment timeout check. Jika transaksi melewati `payment_expired_at` dan masih `WAITING_PAYMENT`, backend mengubah:

```text
payment_state = PAYMENT_TIMEOUT
order_state = PAYMENT_TIMEOUT
status = PAYMENT_TIMEOUT
dispense_result tetap NONE
```

Payment timeout tidak pernah menjadi `DISPENSE_FAILED`.

### Midtrans Webhook

Endpoint utama:

```http
POST /midtrans/notification
```

Endpoint kompatibel:

```http
POST /api/payments/midtrans/notification
```

Webhook menggunakan `order_id` dari Midtrans untuk mencari `/transactions/{order_id}`.

Mapping normal:

```text
settlement -> PAID / READY_TO_DISPENSE
capture + fraud_status accept -> PAID / READY_TO_DISPENSE
pending -> WAITING_PAYMENT
expire -> EXPIRED / PAYMENT_EXPIRED
cancel/deny/failure -> FAILED / PAYMENT_FAILED
```

Late payment:

Jika transaksi sudah `PAYMENT_TIMEOUT`, lalu webhook settlement/capture datang, backend mengubah:

```text
payment_state = LATE_PAID
order_state = NEEDS_REVIEW
status = NEEDS_REVIEW
```

Late payment tidak memberi command `DISPENSE`, tidak mengurangi stok, dan tidak mengubah `dispense_result`.

### Dispense Result

```http
POST /api/transactions/TRX.../dispense-result
Content-Type: application/json

{
  "machine_id": "VM001",
  "dispense_result": "SUCCESS"
}
```

Jika `SUCCESS`:

- stok item dikurangi memakai Firebase transaction
- transaksi menjadi `COMPLETED`
- `current_order.order_state = COMPLETED`
- log `DISPENSE_SUCCESS`

Jika `FAILED`:

- stok tidak dikurangi
- transaksi menjadi `DISPENSE_FAILED`
- log `DISPENSE_FAILED`

Endpoint ini hanya boleh diproses jika `payment_state = PAID`.

### Restock

```http
POST /api/machines/VM001/items/cola/restock
Content-Type: application/json

{
  "amount": 10
}
```

Response:

```json
{
  "success": true,
  "message": "Item restocked",
  "data": {
    "machine_id": "VM001",
    "item_id": "cola",
    "added": 10,
    "stock_after": 20,
    "old_stock": 10,
    "added_stock": 10,
    "new_stock": 20
  }
}
```

Backend membuat log `STOCK_RESTOCK`. Dashboard tidak lagi menulis log langsung ke Firebase.

### Logs

```http
GET /api/logs?machine_id=VM001&limit=5
```

```http
POST /api/logs
Content-Type: application/json

{
  "machine_id": "VM001",
  "event": "SYSTEM_BOOT",
  "message": "ESP32 started successfully",
  "source": "ESP32"
}
```

### Transaction History

```http
GET /api/transactions?machine_id=VM001&limit=5
GET /api/transactions?machine_id=VM001&status=COMPLETED&limit=10
```

Data diurutkan dari `updated_at` atau `created_at` terbaru ke terlama.

## Alur Pembelian

```text
ESP32 menampilkan produk
User memilih produk di LCD/tombol ESP32
ESP32 POST /api/transactions
Backend validasi item, stok, harga, dan is_active
Backend membuat payment Snap/QRIS Midtrans
Backend menyimpan transaction dan current_order ke Firebase
ESP32 menampilkan payment_url / qr_url / qr_string
User membayar via Midtrans Sandbox
Midtrans webhook ke backend
Backend set PAID / READY_TO_DISPENSE
ESP32 polling /api/machines/{machineId}/command atau /api/transactions/{transactionId}/status
Jika command DISPENSE, ESP32 menjalankan servo
ESP32 membaca sensor barang
ESP32 POST /api/transactions/{transactionId}/dispense-result
Backend update transaksi, stok, current_order, status mesin, dan logs
Dashboard membaca data terbaru dari Backend API
```

## Cara Test Thunder Client

1. Health:

```http
GET https://api.vendx.site/health
```

2. Items:

```http
GET https://api.vendx.site/api/machines/VM001/items
```

3. Buat transaksi QRIS:

```http
POST https://api.vendx.site/api/transactions
Content-Type: application/json

{
  "machine_id": "VM001",
  "item_id": "cola",
  "qty": 1,
  "payment_method": "qris"
}
```

4. Cek command:

```http
GET https://api.vendx.site/api/machines/VM001/command
```

5. Cek status:

```http
GET https://api.vendx.site/api/transactions/TRX.../status
```

6. Kirim event dispense started:

```http
POST https://api.vendx.site/api/machines/VM001/events
Content-Type: application/json

{
  "event": "DISPENSE_STARTED",
  "transaction_id": "TRX..."
}
```

7. Kirim dispense success:

```http
POST https://api.vendx.site/api/transactions/TRX.../dispense-result
Content-Type: application/json

{
  "machine_id": "VM001",
  "dispense_result": "SUCCESS"
}
```

8. Restock:

```http
POST https://api.vendx.site/api/machines/VM001/items/cola/restock
Content-Type: application/json

{
  "amount": 5
}
```

9. Logs:

```http
GET https://api.vendx.site/api/logs?machine_id=VM001&limit=5
```

## Testing Dashboard

1. Buka `https://www.vendx.site`.
2. Login dengan akun admin/operator/viewer aktif.
3. Buka DevTools -> Network.
4. Pastikan dashboard memanggil:

```text
https://api.vendx.site/api/machines/VM001/items
https://api.vendx.site/api/machines/VM001/status
https://api.vendx.site/api/machines/VM001/current-order
https://api.vendx.site/api/transactions?machine_id=VM001&limit=5
https://api.vendx.site/api/logs?machine_id=VM001&limit=5
```

5. Restock harus memanggil:

```text
POST https://api.vendx.site/api/machines/VM001/items/{itemId}/restock
```

6. Tidak boleh ada error Firebase listener di console.

## Firebase Rules

Rules ada di `database.rules.json`.

Karena dashboard dan ESP32 mulai diarahkan ke Backend API, rules Firebase dapat diperketat bertahap. Pada tahap development/sandbox, beberapa write path mungkin masih longgar untuk kompatibilitas pengujian lama. Untuk production:

- Dashboard tidak boleh menulis stok langsung ke Firebase.
- ESP32 tidak perlu menulis transaksi langsung ke Firebase.
- Backend dengan Firebase Admin SDK menjadi jalur tulis utama.
- Firebase client dashboard cukup untuk Auth dan validasi user, atau nanti diganti dengan backend auth token.

## Catatan Keamanan

- Jangan taruh Midtrans Server Key di frontend dashboard.
- Jangan taruh Midtrans Server Key di ESP32.
- Jangan upload `.env`.
- Jangan upload Firebase service account JSON.
- Jangan menaruh Firebase Admin SDK di frontend.
- Stok hanya berkurang setelah pembayaran valid dan `dispense_result = SUCCESS`.
- Payment timeout tidak boleh dianggap dispense gagal.
- Late payment setelah timeout harus masuk `LATE_PAID / NEEDS_REVIEW`.
