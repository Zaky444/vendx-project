require("dotenv").config();

const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");

const machineRoutes = require("./routes/machineRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const restockRoutes = require("./routes/restockRoutes");
const logRoutes = require("./routes/logRoutes");
const paymentController = require("./controllers/paymentController");
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

app.use(helmet());

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

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "VendX backend is healthy",
    timestamp: Date.now()
  });
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
    error.details || null
  );
});

module.exports = app;