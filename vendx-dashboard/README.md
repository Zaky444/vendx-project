# VendX Monitoring Dashboard + Backend API

VendX adalah sistem vending machine IoT berbasis ESP32, Firebase Realtime Database, dashboard monitoring admin, dan backend Node.js + Express untuk transaksi dan Midtrans Sandbox.

Dashboard tetap hanya untuk monitoring dan restock admin/operator. Pembelian user tetap dilakukan dari ESP32/LCD.

## Arsitektur Target

```text
ESP32/LCD
-> Backend Node.js + Express
-> Midtrans Sandbox
-> Firebase Realtime Database
-> Dashboard Monitoring
```

Backend diperlukan karena Midtrans Server Key dan Firebase Admin SDK tidak boleh berada di ESP32 atau frontend. Backend juga menjadi tempat validasi stok, pembuatan transaksi, callback pembayaran, dispense result, restock aman, dan audit log.

## Struktur Project

```text
vendx-dashboard/
├── public/
│   ├── login.html
│   ├── index.html
│   ├── css/
│   └── js/
├── backend/
│   ├── package.json
│   ├── vercel.json
│   ├── .env.example
│   ├── api/
│   │   └── index.js
│   └── src/
│       ├── app.js
│       ├── server.js
│       ├── config/
│       │   ├── firebaseAdmin.js
│       │   └── midtrans.js
│       ├── routes/
│       ├── controllers/
│       ├── services/
│       └── utils/
├── database.json
├── database.rules.json
└── README.md
```

## Firebase Rules

Rules baru ada di `database.rules.json`.

Ringkasan:

- `users`: user login hanya membaca dirinya sendiri. `last_login` boleh diupdate oleh user sendiri. Field asing ditolak.
- `machines/info`: admin login boleh update metadata mesin. Field wajib divalidasi.
- `machines/status`: ESP32 development masih boleh menulis status, tetapi field dan enum divalidasi.
- `machines/items`: admin/operator boleh restock/update item. `stock`, `price`, dan `slot_number` tidak boleh minus.
- `machines/current_order`: ESP32/backend development boleh update order aktif, termasuk `qr_url`, `payment_url`, dan `expired_at`, dengan validasi.
- `transactions`: write per transaksi masih dibuka untuk sandbox/dev, tetapi tidak bebas root dan semua field divalidasi, termasuk Midtrans fields.
- `logs`: write per log masih dibuka untuk sandbox/dev, tetapi wajib punya `machine_id`, `event`, `message`, `source`, dan `timestamp`.

Bagian yang masih development/sandbox:

- `machines/status`, `machines/current_order`, `transactions/$transactionId`, dan `logs/$logId` masih mengizinkan write tanpa Firebase Auth agar ESP32 lama tetap bisa testing.
- Untuk production, ESP32 sebaiknya menulis lewat backend API atau token khusus. Firebase client write langsung harus dipersempit.

## Menjalankan Backend

```bash
cd vendx-dashboard/backend
npm install
copy .env.example .env
npm run dev
```

Isi `.env`:

```env
PORT=5000
FIREBASE_DATABASE_URL=https://your-project-id-default-rtdb.asia-southeast1.firebasedatabase.app
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"your-project-id","private_key":"-----BEGIN PRIVATE KEY-----\\nYOUR_PRIVATE_KEY\\n-----END PRIVATE KEY-----\\n","client_email":"firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com"}

MIDTRANS_IS_PRODUCTION=false
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxx
PAYMENT_TIMEOUT_MS=900000

CORS_ORIGIN=http://localhost:5500,http://localhost:5501
```

Untuk Vercel, pasang environment variable yang sama di Project Settings. Jangan upload `.env`, `serviceAccountKey.json`, `firebase-service-account.json`, atau Midtrans Server Key ke GitHub. Firebase private key di `FIREBASE_SERVICE_ACCOUNT_JSON` harus memakai newline escaped (`\\n`), dan backend akan mengubahnya menjadi newline asli.

Health check:

```http
GET http://localhost:5000/health
```

## Endpoint API

### Machine Overview

```http
GET /api/machines/VM001/overview
```

Response:

```json
{
  "success": true,
  "message": "Machine overview retrieved",
  "data": {
    "info": {},
    "status": {},
    "items": {},
    "current_order": {}
  }
}
```

### Machine Items

```http
GET /api/machines/VM001/items
```

### Create Transaction

```http
POST /api/transactions
Content-Type: application/json

{
  "machine_id": "VM001",
  "item_id": "cola",
  "qty": 1
}
```

Backend akan validasi mesin, item aktif, stok cukup, hitung harga, membuat transaksi Firebase, membuat Midtrans Snap payment, dan update `/machines/{machineId}/current_order`. Stok belum dikurangi.

Response:

```json
{
  "success": true,
  "message": "Transaction and Midtrans payment created",
  "data": {
    "transaction_id": "TRX001",
    "snap_token": "MIDTRANS_SNAP_TOKEN",
    "payment_url": "https://app.sandbox.midtrans.com/snap/v2/vtweb/...",
    "qr_url": "https://app.sandbox.midtrans.com/snap/v2/vtweb/...",
    "payment_state": "WAITING_PAYMENT"
  }
}
```

### Polling Payment Status

```http
GET /api/transactions/TRX001/status
```

ESP32 memakai endpoint ini untuk polling. Jika pembayaran sudah melewati `expired_at`, backend akan menandai `payment_state` dan `order_state` sebagai `PAYMENT_TIMEOUT` tanpa mengubah `dispense_result`.

### Midtrans Notification

```http
POST /api/payments/midtrans/notification
```

URL ini didaftarkan di dashboard Midtrans Sandbox sebagai Payment Notification URL. Backend memverifikasi notification lewat Midtrans client, lalu update transaksi dan `current_order`.

Endpoint Vercel-friendly:

```http
POST /midtrans/notification
```

### Dispense Result

```http
POST /api/transactions/TRX001/dispense-result
Content-Type: application/json

{
  "machine_id": "VM001",
  "dispense_result": "SUCCESS"
}
```

Jika `SUCCESS`, backend mengurangi stok, set transaksi `COMPLETED`, set `current_order.order_state = COMPLETED`, update status mesin, dan membuat log `DISPENSE_SUCCESS`.

Jika `FAILED`, backend set transaksi `DISPENSE_FAILED`, set `current_order.order_state = DISPENSE_FAILED`, stok tidak dikurangi, dan log `DISPENSE_FAILED` dibuat.

## Deploy ke Vercel

Backend memakai REST API serverless. Vercel entrypoint ada di:

```text
backend/api/index.js
```

`src/app.js` hanya export Express app. `src/server.js` hanya untuk local development dan tidak dipakai Vercel.

Environment variables di Vercel:

```text
FIREBASE_DATABASE_URL
FIREBASE_SERVICE_ACCOUNT_JSON
MIDTRANS_SERVER_KEY
MIDTRANS_CLIENT_KEY
PAYMENT_TIMEOUT_MS
MIDTRANS_IS_PRODUCTION=false
```

Tidak ada Firebase listener permanen, worker, atau `setInterval` jangka panjang di backend.

### Restock

```http
POST /api/machines/VM001/items/cola/restock
Content-Type: application/json

{
  "qty": 10,
  "admin_id": "admin001"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "item_id": "cola",
    "old_stock": 10,
    "added_stock": 10,
    "new_stock": 20
  }
}
```

### Logs

```http
GET /api/logs?machine_id=VM001&limit=10
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

## Cara Test Postman / Thunder Client

1. Jalankan backend: `npm run dev`.
2. Test `GET /health`.
3. Test `GET /api/machines/VM001/overview`.
4. Test `POST /api/transactions` dengan `machine_id`, `item_id`, dan `qty`.
5. Copy `transaction_id` dari response.
6. Test `POST /api/payments/midtrans/create`.
7. Buka `payment_url` dari response untuk simulasi pembayaran Sandbox.
8. Test callback manual dengan payload Midtrans Sandbox atau gunakan notification URL dari Midtrans.
9. Test `POST /api/transactions/:transactionId/dispense-result`.
10. Cek Firebase dan dashboard.

## Menghubungkan ESP32 ke Backend

ESP32 tidak perlu menulis transaksi langsung ke Firebase lagi. Gunakan HTTP request:

```text
POST http://BACKEND_HOST:5000/api/transactions
POST http://BACKEND_HOST:5000/api/payments/midtrans/create
POST http://BACKEND_HOST:5000/api/transactions/{transactionId}/dispense-result
POST http://BACKEND_HOST:5000/api/logs
```

Untuk development lokal dari ESP32 fisik, backend harus memakai IP laptop di jaringan yang sama, contoh:

```text
http://192.168.1.10:5000/api/transactions
```

## Dashboard dan Backend

Tahap sekarang dashboard masih boleh membaca Firebase realtime untuk monitoring. Setelah backend stabil:

- Restock dashboard sebaiknya diarahkan ke `POST /api/machines/:machineId/items/:itemId/restock`.
- Monitoring boleh tetap realtime dari Firebase.
- Untuk production, dashboard bisa memakai API + auth middleware agar akses lebih terkendali.

## Alur Pembelian Target

```text
ESP32 memilih produk
POST /api/transactions
POST /api/payments/midtrans/create
ESP32 menampilkan payment_url / qr_url
User membayar via Midtrans Sandbox
Midtrans callback ke backend
Backend set payment_state = PAID dan status = READY_TO_DISPENSE
ESP32 menjalankan servo
ESP32 kirim dispense result
Backend update stok, transaksi, current_order, status mesin, dan logs
Dashboard melihat perubahan
```
