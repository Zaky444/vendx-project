const express = require("express");
const paymentController = require("../controllers/paymentController");
const { asyncHandler } = require("../utils/response");

const router = express.Router();

router.post("/midtrans/create", asyncHandler(paymentController.createMidtransPayment));
router.post("/midtrans/notification", asyncHandler(paymentController.handleMidtransNotification));

module.exports = router;
