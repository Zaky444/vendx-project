const express = require("express");
const { body } = require("express-validator");
const transactionController = require("../controllers/transactionController");
const { asyncHandler } = require("../utils/response");
const { handleValidation } = require("../utils/validate");

const router = express.Router();

const createTransactionValidation = [
  body("machine_id").isString().notEmpty().withMessage("machine_id is required and must be a string"),
  body("item_id").isString().notEmpty().withMessage("item_id is required and must be a string"),
  body("qty").optional().isInt({ min: 1 }).withMessage("qty must be an integer of at least 1"),
  body("payment_method").optional().isString().withMessage("payment_method must be a string")
];

router.get("/", asyncHandler(transactionController.listTransactions));
router.post("/", createTransactionValidation, handleValidation, asyncHandler(transactionController.createTransaction));
router.get("/:transactionId/status", asyncHandler(transactionController.getTransactionStatus));
router.post("/:transactionId/simulate-paid", asyncHandler(transactionController.simulatePaid));
router.post("/:transactionId/dispense-result", asyncHandler(transactionController.submitDispenseResult));

module.exports = router;
