const paymentService = require("../services/paymentService");
const { sendSuccess } = require("../utils/response");
const { verifyMidtransSignature } = require("../utils/cryptoUtils");

async function createMidtransPayment(req, res) {
  const payment = await paymentService.createMidtransPayment(req.body.transaction_id);
  return sendSuccess(res, payment, "Midtrans payment created", 201);
}

async function handleMidtransNotification(req, res) {
  // Verifikasi keaslian notifikasi SEBELUM menyentuh state transaksi.
  // Tanpa ini, siapa pun bisa POST "settlement" palsu -> barang keluar gratis.
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!verifyMidtransSignature(req.body, serverKey)) {
    return res.status(401).json({
      success: false,
      message: "Invalid or missing Midtrans signature"
    });
  }

  const result = await paymentService.handleMidtransNotification(req.body);
  return sendSuccess(res, result, "Midtrans notification processed");
}

module.exports = {
  createMidtransPayment,
  handleMidtransNotification
};
