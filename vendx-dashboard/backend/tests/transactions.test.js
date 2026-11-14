const request = require("supertest");
const app = require("../src/app");
const firebaseMock = require("./mocks/firebase-admin");

const MACHINE_ID = "machine-01";
const ITEM_ID = "item-01";

function seedMachineData() {
  firebaseMock.__seed(`/machines/${MACHINE_ID}/info`, {
    id: MACHINE_ID,
    name: "VendX Test Machine",
    location: "Lab Test"
  });

  firebaseMock.__seed(`/machines/${MACHINE_ID}/items/${ITEM_ID}`, {
    id: ITEM_ID,
    name: "Air Mineral 600ml",
    price: 5000,
    stock: 10,
    is_active: true
  });
}

describe("POST /api/transactions", () => {
  beforeEach(() => {
    firebaseMock.__reset();
    seedMachineData();
  });

  test("payload tanpa item_id ditolak 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/api/transactions")
      .send({ machine_id: MACHINE_ID, qty: 1 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "item_id" })])
    );
  });

  test("payload dengan qty tidak valid ditolak 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/api/transactions")
      .send({ machine_id: MACHINE_ID, item_id: ITEM_ID, qty: 0 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  test("payload valid membuat transaksi (201) dan datanya tersimpan", async () => {
    const res = await request(app)
      .post("/api/transactions")
      .send({ machine_id: MACHINE_ID, item_id: ITEM_ID, qty: 1, payment_method: "snap" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.transaction_id).toMatch(/^TRX/);
    expect(data.machine_id).toBe(MACHINE_ID);
    expect(data.item_id).toBe(ITEM_ID);
    expect(data.qty).toBe(1);
    expect(data.total_price).toBe(5000);
    expect(data.payment_state).toBe("WAITING_PAYMENT");
    expect(data.order_state).toBe("WAITING_PAYMENT");

    // Cek datanya benar-benar tersimpan di database (mock)
    const savedTransaction = firebaseMock.__get(`/transactions/${data.transaction_id}`);
    expect(savedTransaction).toBeTruthy();
    expect(savedTransaction.status).toBe("WAITING_PAYMENT");
    expect(savedTransaction.total_price).toBe(5000);

    const machineStatus = firebaseMock.__get(`/machines/${MACHINE_ID}/status`);
    expect(machineStatus.machine_state).toBe("WAITING_PAYMENT");
    expect(machineStatus.is_busy).toBe(true);
  });

  test("order menggantung >25 detik otomatis di-expire & tak memblokir POST berikutnya", async () => {
    // 1) Buat order pertama (akan mengunci mesin).
    const first = await request(app)
      .post("/api/transactions")
      .send({ machine_id: MACHINE_ID, item_id: ITEM_ID, qty: 1, payment_method: "snap" });
    expect(first.status).toBe(201);

    const firstId = first.body.data.transaction_id;
    const stored = firebaseMock.__get(`/transactions/${firstId}`);

    // 2) Simulasikan waktu berjalan 30 detik (melebihi LOCK_TIMEOUT 25s) dengan
    //    memundurkan created_at & expired_at transaksi pengunci.
    const pastCreated = stored.created_at - 30000;
    const pastExpired = stored.expired_at - 30000;
    firebaseMock.__seed(`/transactions/${firstId}`, {
      ...stored,
      created_at: pastCreated,
      expired_at: pastExpired,
      payment_expired_at: pastExpired
    });

    // 3) POST kedua harus BERHASIL (bukan 409) karena pengunci sudah hangus.
    const second = await request(app)
      .post("/api/transactions")
      .send({ machine_id: MACHINE_ID, item_id: ITEM_ID, qty: 1, payment_method: "snap" });

    expect(second.status).toBe(201);
    expect(second.body.success).toBe(true);

    // 4) Transaksi pengunci lama di-expire.
    const oldTx = firebaseMock.__get(`/transactions/${firstId}`);
    expect(oldTx.status).toBe("EXPIRED");

    // 5) current_order kini memegang order baru (bukan yang lama).
    const currentOrder = firebaseMock.__get(`/machines/${MACHINE_ID}/current_order`);
    expect(currentOrder.transaction_id).toBe(second.body.data.transaction_id);
  });
});
