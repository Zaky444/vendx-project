const { snap, coreApi } = require("../config/midtrans");
const firebaseService = require("./firebaseService");
const logService = require("./logService");
const transactionService = require("./transactionService");
const { now } = require("../utils/time");

function assertPayable(transaction) {
  const payableStates = ["PENDING", "WAITING_PAYMENT"];

  if (!payableStates.includes(transaction.payment_state) && !payableStates.includes(transaction.status)) {
    const error = new Error("Transaction is not payable");
    error.statusCode = 400;
    throw error;
  }
}

async function createMidtransPayment(transactionId) {
  const transaction = await transactionService.getTransaction(transactionId);
  assertPayable(transaction);

  const parameter = {
    transaction_details: {
      order_id: transaction.transaction_id,
      gross_amount: Number(transaction.total_price) || 0
    },
    item_details: [
      {
        id: transaction.item_id,
        price: Number(transaction.price) || 0,
        quantity: Number(transaction.qty) || 1,
        name: transaction.item_name || transaction.item_id
      }
    ],
    customer_details: {
      first_name: "VendX",
      email: "customer@vendx.local"
    },
    enabled_payments: ["qris", "gopay", "bank_transfer"]
  };

  const response = await snap.createTransaction(parameter);
  const paymentUrl = response.redirect_url || "NONE";
  const token = response.token || "NONE";
  const timestamp = now();

  await firebaseService.updateValue(`/transactions/${transactionId}`, {
    payment_url: paymentUrl,
    qr_url: paymentUrl,
    payment_type: "snap",
    payment_state: "WAITING_PAYMENT",
    order_state: "WAITING_PAYMENT",
    status: "WAITING_PAYMENT",
    midtrans_order_id: transaction.transaction_id,
    updated_at: timestamp
  });

  await firebaseService.updateValue(`/machines/${transaction.machine_id}/current_order`, {
    payment_url: paymentUrl,
    qr_url: paymentUrl,
    payment_state: "WAITING_PAYMENT",
    order_state: "WAITING_PAYMENT"
  });

  await logService.createLog({
    machine_id: transaction.machine_id,
    event: "PAYMENT_CREATED",
    message: `Midtrans payment created for ${transactionId}`,
    source: "BACKEND"
  });

  return {
    transaction_id: transactionId,
    token,
    payment_url: paymentUrl,
    qr_url: paymentUrl
  };
}

function mapNotificationStatus(notification) {
  const transactionStatus = notification.transaction_status;
  const fraudStatus = notification.fraud_status || "NONE";

  if (transactionStatus === "settlement") {
    return {
      payment_state: "PAID",
      status: "READY_TO_DISPENSE",
      log_event: "PAYMENT_PAID"
    };
  }

  if (transactionStatus === "capture" && fraudStatus === "accept") {
    return {
      payment_state: "PAID",
      status: "READY_TO_DISPENSE",
      log_event: "PAYMENT_PAID"
    };
  }

  if (["deny", "cancel", "expire", "failure"].includes(transactionStatus)) {
    return {
      payment_state: transactionStatus === "expire" ? "PAYMENT_TIMEOUT" : "PAYMENT_FAILED",
      status: transactionStatus === "expire" ? "PAYMENT_TIMEOUT" : "PAYMENT_FAILED",
      log_event: transactionStatus === "expire" ? "PAYMENT_TIMEOUT" : "PAYMENT_FAILED"
    };
  }

  return {
    payment_state: "WAITING_PAYMENT",
    status: "WAITING_PAYMENT",
    log_event: "PAYMENT_PENDING"
  };
}

async function handleMidtransNotification(body) {
  const notification = await coreApi.transaction.notification(body);
  const transactionId = notification.order_id;
  const transaction = await transactionService.getTransaction(transactionId);
  const mappedStatus = mapNotificationStatus(notification);
  const timestamp = now();

  await firebaseService.updateValue(`/transactions/${transactionId}`, {
    payment_state: mappedStatus.payment_state,
    order_state: mappedStatus.status,
    status: mappedStatus.status,
    midtrans_transaction_id: notification.transaction_id || "NONE",
    payment_type: notification.payment_type || "NONE",
    fraud_status: notification.fraud_status || "NONE",
    updated_at: timestamp
  });

  await firebaseService.updateValue(`/machines/${transaction.machine_id}/current_order`, {
    payment_state: mappedStatus.payment_state,
    order_state: mappedStatus.status
  });

  await firebaseService.updateValue(`/machines/${transaction.machine_id}/status`, {
    machine_state: mappedStatus.status,
    is_busy: mappedStatus.status !== "PAYMENT_FAILED" && mappedStatus.status !== "PAYMENT_TIMEOUT",
    last_updated: timestamp
  });

  await logService.createLog({
    machine_id: transaction.machine_id,
    event: mappedStatus.log_event,
    message: `Midtrans status ${notification.transaction_status} for ${transactionId}`,
    source: "MIDTRANS"
  });

  return {
    transaction_id: transactionId,
    order_state: mappedStatus.status,
    ...mappedStatus
  };
}

module.exports = {
  createMidtransPayment,
  handleMidtransNotification
};
