const request = require("supertest");
const app = require("../src/app");
const firebaseMock = require("./mocks/firebase-admin");

// Harus sama dengan ADMIN_API_KEY di tests/setup-env.js
const ADMIN_KEY = "test-admin-key";

describe("Health check", () => {
  beforeEach(() => {
    firebaseMock.__reset();
  });

  test("GET /health mengembalikan 200 dan struktur response yang benar", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.timestamp).toBe("number");
  });

  test("GET /health/detail tanpa X-Admin-Key ditolak 401", async () => {
    const res = await request(app).get("/health/detail");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("GET /health/detail dengan X-Admin-Key benar mengembalikan detail", async () => {
    const res = await request(app)
      .get("/health/detail")
      .set("X-Admin-Key", ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptime).toBe("number");
    expect(res.body.version).toBe("1.0.0");
    expect(res.body.dependencies.firebase).toBe("ok");
  });
});
