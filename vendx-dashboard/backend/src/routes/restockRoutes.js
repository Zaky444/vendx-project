const express = require("express");
const { body } = require("express-validator");

// CATATAN (#28): route restock ASLI ada di machineRoutes.js
// (POST /api/machines/:machineId/items/:itemId/restock) dan sudah dilindungi
// requireAdminKey. Duplikat di sini dulu lolos tanpa auth (celah bypass),
// jadi handler-nya dihapus. Router dipertahankan agar app.js tidak rusak.
const router = express.Router();

const restockValidation = [
  body("qty").optional().isInt({ min: 1 }).withMessage("qty must be an integer of at least 1"),
  body("amount").optional().isInt({ min: 1 }).withMessage("amount must be an integer of at least 1")
];

void restockValidation; // disiapkan bila nanti perlu endpoint restock terpisah

module.exports = router;
