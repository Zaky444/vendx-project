const rateLimit = require("express-rate-limit");

/**
 * Global rate limiter (per-IP): 200 req/menit.
 * Cukup longgar untuk ESP32 polling command tiap 1-2 detik (~30-60 req/mnt).
 * Melindungi dari DoS dan brute-force.
 */
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Terlalu banyak request. Coba lagi nanti."
  }
});

/**
 * Rate limiter ketat untuk endpoint sensitif (restock, simulate-paid, buat transaksi).
 * 10 req/menit per-IP - mencegah abuse berulang.
 */
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Terlalu banyak request ke endpoint ini. Tunggu sebentar."
  }
});

module.exports = {
  globalLimiter,
  strictLimiter
};