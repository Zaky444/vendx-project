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
  const paymentMethod = String(transaction.payment_method || "snap").toLowerCase();

  if (paymentMethod === "qris") {
    return createQrisPayment(transaction);
  }

  return createSnapPayment(transaction);
}

function buildPaymentPayload(transaction) {
  return {
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
      last_name: transaction.machine_id,
      email: "customer@vendx.local"
    }
  };
}

async function updateCurrentOrderIfMatches(machineId, transactionId, payload) {
  const currentOrder = await firebaseService.getValue(`/machines/${machineId}/current_order`);

  if (currentOrder && currentOrder.transaction_id === transactionId) {
    await firebaseService.updateValue(`/machines/${machineId}/current_order`, payload);
  }
}

async function createSnapPayment(transaction) {
  const parameter = {
    ...buildPaymentPayload(transaction),
    enabled_payments: ["qris", "gopay", "bank_transfer"]
  };

  const response = await snap.createTransaction(parameter);
  const paymentUrl = response.redirect_url || "NONE";
  const token = response.token || "NONE";
  const timestamp = now();

  await firebaseService.updateValue(`/transactions/${transaction.transaction_id}`, {
    payment_method: "snap",
    payment_url: paymentUrl,
    qr_url: paymentUrl,
    qr_string: "NONE",
    snap_token: token,
    payment_type: "snap",
    payment_state: "WAITING_PAYMENT",
    order_state: "WAITING_PAYMENT",
    status: "WAITING_PAYMENT",
    midtrans_order_id: transaction.transaction_id,
    updated_at: timestamp
  });

  await updateCurrentOrderIfMatches(transaction.machine_id, transaction.transaction_id, {
    payment_method: "snap",
    payment_url: paymentUrl,
    qr_url: paymentUrl,
    qr_string: "NONE",
    snap_token: token,
    payment_state: "WAITING_PAYMENT",
    order_state: "WAITING_PAYMENT",
    updated_at: timestamp
  });

  await logService.createLog({
    machine_id: transaction.machine_id,
    event: "PAYMENT_CREATED",
    message: `Midtrans Snap payment created for ${transaction.transaction_id}`,
    source: "BACKEND"
  });

  return {
    transaction_id: transaction.transaction_id,
    payment_method: "snap",
    token,
    snap_token: token,
    payment_url: paymentUrl,
    qr_url: paymentUrl,
    qr_string: "NONE",
    payment_state: "WAITING_PAYMENT",
    order_state: "WAITING_PAYMENT",
    gross_amount: Number(transaction.total_price) || 0
  };
}

function extractQrisActionUrl(actions = []) {
  const action = actions.find((item) => {
    const name = String(item?.name || item?.type || "").toLowerCase();
    return name.includes("generate-qr-code") || name.includes("qr-code") || name.includes("qris");
  });

  return action?.url || "NONE";
}

async function createQrisPayment(transaction) {
  const parameter = {
    payment_type: "qris",
    ...buildPaymentPayload(transaction)
  };

  const response = await coreApi.charge(parameter);
  const timestamp = now();
  const actions = Array.isArray(response.actions) ? response.actions : [];
  const qrUrl = response.qr_url || extractQrisActionUrl(actions);
  const qrString = response.qr_string || response.qr_content || "NONE";

  await firebaseService.updateValue(`/transactions/${transaction.transaction_id}`, {
    payment_method: "qris",
    payment_url: "NONE",
    qr_url: qrUrl,
    qr_string: qrString,
    snap_token: "NONE",
    payment_type: response.payment_type || "qris",
    payment_state: "WAITING_PAYMENT",
    order_state: "WAITING_PAYMENT",
    status: "WAITING_PAYMENT",
    midtrans_order_id: transaction.transaction_id,
    midtrans_transaction_id: response.transaction_id || "NONE",
    fraud_status: response.fraud_status || "NONE",
    midtrans_status: response.transaction_status || "pending",
    updated_at: timestamp
  });

  await updateCurrentOrderIfMatches(transaction.machine_id, transaction.transaction_id, {
    payment_method: "qris",
    payment_url: "NONE",
    qr_url: qrUrl,
    qr_string: qrString,
    snap_token: "NONE",
    payment_state: "WAITING_PAYMENT",
    order_state: "WAITING_PAYMENT",
    updated_at: timestamp
  });

  await logService.createLog({
    machine_id: transaction.machine_id,
    event: "QRIS_PAYMENT_CREATED",
    message: `Midtrans QRIS payment created for ${transaction.transaction_id}`,
    source: "BACKEND"
  });

  return {
    transaction_id: transaction.transaction_id,
    payment_method: "qris",
    token: "NONE",
    snap_token: "NONE",
    payment_url: "NONE",
    qr_url: qrUrl,
    qr_string: qrString,
    payment_state: "WAITING_PAYMENT",
    order_state: "WAITING_PAYMENT",
    gross_amount: Number(transaction.total_price) || 0
  };
}

function mapNotificationStatus(notification) {
  const transactionStatus = notification.transaction_status;
  const fraudStatus = notification.fraud_status || "NONE";

  if (transactionStatus === "settlement") {
    return {
      payment_state: "PAID",
      order_state: "READY_TO_DISPENSE",
      status: "READY_TO_DISPENSE",
      log_event: "PAYMENT_PAID"
    };
  }

  if (transactionStatus === "capture" && fraudStatus === "accept") {
    return {
      payment_state: "PAID",
      order_state: "READY_TO_DISPENSE",
      status: "READY_TO_DISPENSE",
      log_event: "PAYMENT_PAID"
    };
  }

  if (transactionStatus === "expire") {
    return {
      payment_state: "EXPIRED",
      order_state: "PAYMENT_EXPIRED",
      status: "PAYMENT_EXPIRED",
      log_event: "PAYMENT_EXPIRED"
    };
  }

  if (["deny", "cancel", "failure"].includes(transactionStatus)) {
    return {
      payment_state: "FAILED",
      order_state: "PAYMENT_FAILED",
      status: "PAYMENT_FAILED",
      log_event: "PAYMENT_FAILED"
    };
  }

  return {
    payment_state: "WAITING_PAYMENT",
    order_state: "WAITING_PAYMENT",
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
    order_state: mappedStatus.order_state,
    status: mappedStatus.status,
    midtrans_transaction_id: notification.transaction_id || "NONE",
    payment_type: notification.payment_type || "NONE",
    fraud_status: notification.fraud_status || "NONE",
    midtrans_status: notification.transaction_status || "NONE",
    midtrans_payment_type: notification.payment_type || "NONE",
    updated_at: timestamp
  });

  await updateCurrentOrderIfMatches(transaction.machine_id, transactionId, {
    payment_state: mappedStatus.payment_state,
    order_state: mappedStatus.order_state,
    updated_at: timestamp
  });

  await firebaseService.updateValue(`/machines/${transaction.machine_id}/status`, {
    machine_state: mappedStatus.status,
    is_busy: mappedStatus.payment_state === "PAID" || mappedStatus.payment_state === "WAITING_PAYMENT",
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
    order_state: mappedStatus.order_state,
    ...mappedStatus
  };
}

module.exports = {
  createSnapPayment,
  createQrisPayment,
  createMidtransPayment,
  handleMidtransNotification
};
