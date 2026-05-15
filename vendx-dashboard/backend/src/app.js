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

const defaultAllowedOrigins = [
  "https://vendx.site",
  "https://www.vendx.site",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://vendx-project-m5guiudz1-zaky-maulana-s-projects.vercel.app"
];

const allowedOrigins = (process.env.CORS_ORIGIN || defaultAllowedOrigins.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

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

// Security middleware
app.use(helmet());

// CORS middleware
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Body parser
app.use(express.json({ limit: "1mb" }));

// Request logger
app.use(morgan("dev"));

// Root route
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
      restock: "/api/machines/:machineId/items/:itemId/restock",
    },
  });
});

// Health check route
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "VendX backend is healthy",
    timestamp: Date.now(),
  });
});

// API routes
app.use("/api/machines", machineRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api", restockRoutes);
app.use("/api/logs", logRoutes);
app.post("/midtrans/notification", asyncHandler(paymentController.handleMidtransNotification));

// Route not found handler
app.use((req, res) => {
  return sendError(res, "Route not found", 404);
});

// Global error handler
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
