const express = require("express");
const { body } = require("express-validator");
const paymentController = require("../controllers/paymentController");
const { asyncHandler } = require("../utils/response");
const { handleValidation } = require("../utils/validate");

const router = express.Router();

const createPaymentValidation = [
  body("transaction_id").isString().notEmpty().withMessage("transaction_id is required and must be a string")
];

router.post("/midtrans/create", createPaymentValidation, handleValidation, asyncHandler(paymentController.createMidtransPayment));
router.post("/midtrans/notification", asyncHandler(paymentController.handleMidtransNotification));

module.exports = router;
