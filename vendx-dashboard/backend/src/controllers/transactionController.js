const transactionService = require("../services/transactionService");
const paymentService = require("../services/paymentService");
const { sendSuccess } = require("../utils/response");

async function createTransaction(req, res) {
  const transaction = await transactionService.createTransaction(req.body);
  const hasMidtransKey = Boolean(process.env.MIDTRANS_SERVER_KEY);
  const payment = hasMidtransKey
    ? await paymentService.createMidtransPayment(transaction.transaction_id)
    : {
        payment_method: transaction.payment_method || "snap",
        payment_url: transaction.payment_url || "NONE",
        qr_url: transaction.qr_url || "NONE",
        qr_string: transaction.qr_string || "NONE",
        snap_token: transaction.snap_token || "NONE",
        token: "NONE",
        payment_state: transaction.payment_state,
        order_state: transaction.order_state,
        gross_amount: transaction.total_price
      };

  return sendSuccess(
    res,
    {
      transaction_id: transaction.transaction_id,
      payment_method: payment.payment_method || transaction.payment_method || "snap",
      payment_url: payment.payment_url,
      qr_url: payment.qr_url,
      qr_string: payment.qr_string || "NONE",
      snap_token: payment.snap_token || payment.token || "NONE",
      payment_state: payment.payment_state || "WAITING_PAYMENT",
      order_state: payment.order_state || "WAITING_PAYMENT",
      gross_amount: payment.gross_amount || transaction.total_price
    },
    payment.payment_method === "qris" ? "QRIS payment created" : "Transaction and Midtrans payment created",
    201
  );
}

async function listTransactions(req, res) {
  const transactions = await transactionService.listTransactions(req.query);
  return sendSuccess(res, { transactions }, "Transactions fetched");
}

async function submitDispenseResult(req, res) {
  const result = await transactionService.handleDispenseResult(req.params.transactionId, req.body);
  return sendSuccess(res, result, "Dispense result updated");
}

async function getTransactionStatus(req, res) {
  const status = await transactionService.getTransactionStatus(req.params.transactionId);
  return sendSuccess(res, status, "Transaction status fetched");
}

async function simulatePaid(req, res) {
  const result = await transactionService.simulatePaid(req.params.transactionId);
  return sendSuccess(res, result, "Payment simulated as PAID");
}

module.exports = {
  createTransaction,
  listTransactions,
  submitDispenseResult,
  getTransactionStatus,
  simulatePaid
};
