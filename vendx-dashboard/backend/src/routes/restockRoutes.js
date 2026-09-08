const express = require("express");
const { body } = require("express-validator");
const restockController = require("../controllers/restockController");
const { asyncHandler } = require("../utils/response");
const { handleValidation } = require("../utils/validate");

const router = express.Router();

const restockValidation = [
  body("qty").optional().isInt({ min: 1 }).withMessage("qty must be an integer of at least 1"),
  body("amount").optional().isInt({ min: 1 }).withMessage("amount must be an integer of at least 1")
];

router.post("/machines/:machineId/items/:itemId/restock", restockValidation, handleValidation, asyncHandler(restockController.restockItem));

module.exports = router;
