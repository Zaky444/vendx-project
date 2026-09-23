// Env dummy untuk test: test harus jalan tanpa file .env dan tanpa kredensial asli.
process.env.NODE_ENV = "test";

process.env.FIREBASE_DATABASE_URL = "https://vendx-test-default-rtdb.firebaseio.com";
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  project_id: "vendx-test",
  private_key: "test-private-key",
  client_email: "test@vendx.local"
});

process.env.ADMIN_API_KEY = "test-admin-key";
process.env.PAYMENT_TIMEOUT_MS = "120000";

// Dikosongkan (bukan dihapus) supaya dotenv tidak mengisi dari .env asli:
// controller memakai jalur fallback dan tidak memanggil Midtrans.
process.env.MIDTRANS_SERVER_KEY = "";
process.env.MIDTRANS_CLIENT_KEY = "";
