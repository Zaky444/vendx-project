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
      .send({ machine_id: MACHINE_ID, item_id: ITEM_ID, qty: 2, payment_method: "snap" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.transaction_id).toMatch(/^TRX/);
    expect(data.machine_id).toBe(MACHINE_ID);
    expect(data.item_id).toBe(ITEM_ID);
    expect(data.qty).toBe(2);
    expect(data.total_price).toBe(10000);
    expect(data.payment_state).toBe("WAITING_PAYMENT");
    expect(data.order_state).toBe("WAITING_PAYMENT");

    // Cek datanya benar-benar tersimpan di database (mock)
    const savedTransaction = firebaseMock.__get(`/transactions/${data.transaction_id}`);
    expect(savedTransaction).toBeTruthy();
    expect(savedTransaction.status).toBe("WAITING_PAYMENT");
    expect(savedTransaction.total_price).toBe(10000);

    const machineStatus = firebaseMock.__get(`/machines/${MACHINE_ID}/status`);
    expect(machineStatus.machine_state).toBe("WAITING_PAYMENT");
    expect(machineStatus.is_busy).toBe(true);
  });
});
