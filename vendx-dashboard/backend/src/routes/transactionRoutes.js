const express = require("express");
const transactionController = require("../controllers/transactionController");
const { asyncHandler } = require("../utils/response");

const router = express.Router();

router.get("/", asyncHandler(transactionController.listTransactions));
router.post("/", asyncHandler(transactionController.createTransaction));
router.get("/:transactionId/status", asyncHandler(transactionController.getTransactionStatus));
router.post("/:transactionId/simulate-paid", asyncHandler(transactionController.simulatePaid));
router.post("/:transactionId/dispense-result", asyncHandler(transactionController.submitDispenseResult));

module.exports = router;
