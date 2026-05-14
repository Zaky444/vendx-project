const paymentService = require("../services/paymentService");
const { sendSuccess } = require("../utils/response");

async function createMidtransPayment(req, res) {
  const payment = await paymentService.createMidtransPayment(req.body.transaction_id);
  return sendSuccess(res, payment, "Midtrans payment created", 201);
}

async function handleMidtransNotification(req, res) {
  const result = await paymentService.handleMidtransNotification(req.body);
  return sendSuccess(res, result, "Midtrans notification processed");
}

module.exports = {
  createMidtransPayment,
  handleMidtransNotification
};
