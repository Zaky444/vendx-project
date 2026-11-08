require("dotenv").config();

const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const machineRoutes = require("./routes/machineRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const restockRoutes = require("./routes/restockRoutes");
const logRoutes = require("./routes/logRoutes");
const paymentController = require("./controllers/paymentController");
const healthService = require("./services/healthService");
const { requireAdminKey } = require("./utils/adminAuth");
const { asyncHandler, sendError } = require("./utils/response");

const app = express();

// ================= CORS CONFIG =================

const defaultAllowedOrigins = [
  "https://vendx.site",
  "https://www.vendx.site",
  "https://vendx-project.vercel.app",
  "https://vendx-project-m5guiudz1-zaky-maulana-s-projects.vercel.app",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

const envAllowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = [
  ...new Set([
    ...defaultAllowedOrigins,
    ...envAllowedOrigins
  ])
];

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept", "Authorization"],
  credentials: false,
  optionsSuccessStatus: 204
};

// ================= SECURITY MIDDLEWARE =================

// CSP disesuaikan untuk pay.html (halaman perantara QRIS sandbox):
// - 'unsafe-inline'      : script auto-submit di pay.html inline
// - form-action simulator: halaman POST qrCodeUrl ke simulator Midtrans
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'"],
      "form-action": ["'self'", "https://simulator.sandbox.midtrans.com"]
    }
  }
}));

// Manual CORS header and preflight handler
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (!origin) {
    return next();
  }

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    return next();
  }

  console.warn(`[CORS] Blocked origin: ${origin}`);

  if (req.method === "OPTIONS") {
    return res.status(403).end();
  }

  return next();
});

// CORS middleware
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ================= BODY PARSER =================

app.use(express.json({ limit: "1mb" }));

// ================= LOGGER =================

app.use(morgan("dev"));

// ================= SHORT URL REDIRECT (QR-friendly) =================

app.get("/p/:uuid", (req, res) => {
  const { uuid } = req.params;
  if (!uuid || !/^[a-f0-9\-]{36}$/.test(uuid)) {
    return res.status(400).json({ success: false, message: "Invalid UUID" });
  }
  res.redirect(`/pay?id=${uuid}`);
});

// ================= ROOT ROUTE =================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "VendX backend is running",
    service: "VendX API",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      machines: "/api/machines",
      transactions: "/api/transactions",
      payments: "/api/payments",
      logs: "/api/logs",
      restock: "/api/machines/:machineId/items/:itemId/restock"
    }
  });
});

// ================= HEALTH CHECK =================

app.get("/health", asyncHandler(async (req, res) => {
  const firebase = await healthService.checkFirebase();
  const healthy = firebase === "ok";

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status: healthy ? "ok" : "degraded",
    timestamp: Date.now()
  });
}));

app.get("/health/detail", requireAdminKey, asyncHandler(async (req, res) => {
  const { healthy, detail } = await healthService.getHealthDetail();
  res.status(healthy ? 200 : 503).json(detail);
}));

// ================= PAY PAGE (halaman perantara QR -> simulator) =================
// GET /pay?id=<UUID_Midtrans>
// Menampilkan pay.html yang AUTO-POST qrCodeUrl ke simulator v2.
// File pay.html diletakkan di backend/public/pay.html (repo: web/pay.html di folder Arduino).
app.get("/pay", (req, res) => {
  const id = String(req.query.id || "");
  if (!/^[0-9a-fA-F-]{8,64}$/.test(id)) {
    return res.status(400).type("text").send("ID transaksi tidak valid");
  }
  return res.sendFile(path.join(__dirname, "..", "public", "pay.html"));
});

// ================= API ROUTES =================

app.use("/api/machines", machineRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api", restockRoutes);
app.use("/api/logs", logRoutes);

app.post(
  "/midtrans/notification",
  asyncHandler(paymentController.handleMidtransNotification)
);

// ================= ROUTE NOT FOUND =================

app.use((req, res) => {
  return sendError(res, "Route not found", 404);
});

// ================= GLOBAL ERROR HANDLER =================

app.use((error, req, res, next) => {
  console.error(error);

  const statusCode = error.statusCode || 500;

  return sendError(
    res,
    error.message || "Internal server error",
    statusCode,
    error.details || null,
    error.code || "ERROR"
  );
});

module.exports = app;
