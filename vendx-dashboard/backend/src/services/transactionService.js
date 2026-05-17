const firebaseService = require("./firebaseService");
const inventoryService = require("./inventoryService");
const logService = require("./logService");
const { generateSessionId, generateTransactionId } = require("../utils/idGenerator");
const { now } = require("../utils/time");

function validatePositiveQty(qty) {
  const amount = Number(qty);

  if (!Number.isInteger(amount) || amount <= 0) {
    const error = new Error("qty must be a positive integer");
    error.code = "VALIDATION_ERROR";
    error.statusCode = 400;
    error.details = { qty };
    throw error;
  }

  return amount;
}

function normalizePaymentMethod(paymentMethod) {
  const method = String(paymentMethod || "snap").trim().toLowerCase();

  if (method !== "snap" && method !== "qris") {
    const error = new Error("payment_method must be snap or qris");
    error.code = "VALIDATION_ERROR";
    error.statusCode = 400;
    error.details = {
      payment_method: paymentMethod,
      allowed: ["snap", "qris"]
    };
    throw error;
  }

  return method;
}

async function createTransaction({ machine_id, item_id, qty, payment_method }) {
  if (!machine_id || !item_id) {
    const error = new Error("machine_id and item_id are required");
    error.code = "VALIDATION_ERROR";
    error.statusCode = 400;
    error.details = { machine_id: machine_id || "NONE", item_id: item_id || "NONE" };
    throw error;
  }

  const amount = validatePositiveQty(qty);
  const paymentMethod = normalizePaymentMethod(payment_method);
  const machineInfo = await firebaseService.getValue(`/machines/${machine_id}/info`);

  if (!machineInfo) {
    const error = new Error("Machine not found");
    error.code = "MACHINE_NOT_FOUND";
    error.statusCode = 404;
    error.details = { machine_id };
    throw error;
  }

  const item = await inventoryService.assertAvailableItem(machine_id, item_id, amount);
  const transactionId = generateTransactionId();
  const sessionId = generateSessionId();
  const price = Number(item.price) || 0;
  const totalPrice = price * amount;
  const timestamp = now();
  const timeoutMs = Number(process.env.PAYMENT_TIMEOUT_MS) || 15 * 60 * 1000;
  const expiredAt = timestamp + timeoutMs;

  const transaction = {
    transaction_id: transactionId,
    session_id: sessionId,
    machine_id,
    item_id,
    item_name: item.name || "NONE",
    qty: amount,
    price,
    total_price: totalPrice,
    payment_method: paymentMethod,
    payment_state: "WAITING_PAYMENT",
    order_state: "WAITING_PAYMENT",
    status: "WAITING_PAYMENT",
    dispense_result: "NONE",
    midtrans_order_id: transactionId,
    midtrans_transaction_id: "NONE",
    payment_type: "NONE",
    payment_url: "NONE",
    qr_url: "NONE",
    qr_string: "NONE",
    snap_token: "NONE",
    fraud_status: "NONE",
    midtrans_status: "NONE",
    created_at: timestamp,
    updated_at: timestamp,
    expired_at: expiredAt
  };

  const currentOrder = {
    transaction_id: transactionId,
    session_id: sessionId,
    machine_id,
    item_id,
    item_name: item.name || "NONE",
    qty: amount,
    price,
    total_price: totalPrice,
    payment_method: paymentMethod,
    payment_state: "WAITING_PAYMENT",
    order_state: "WAITING_PAYMENT",
    dispense_result: "NONE",
    payment_url: "NONE",
    qr_url: "NONE",
    qr_string: "NONE",
    snap_token: "NONE",
    created_at: timestamp,
    expired_at: expiredAt,
    updated_at: timestamp
  };

  await firebaseService.setValue(`/transactions/${transactionId}`, transaction);
  await firebaseService.setValue(`/machines/${machine_id}/current_order`, currentOrder);
  await firebaseService.updateValue(`/machines/${machine_id}/status`, {
    machine_state: "WAITING_PAYMENT",
    is_busy: true,
    last_updated: timestamp
  });

  await logService.createLog({
    machine_id,
    event: "TRANSACTION_CREATED",
    message: `Created transaction ${transactionId} for ${item_id} x ${amount}`,
    source: "BACKEND"
  });

  return transaction;
}

async function getTransaction(transactionId) {
  const transaction = await firebaseService.getValue(`/transactions/${transactionId}`);

  if (!transaction) {
    const error = new Error("Transaction not found");
    error.statusCode = 404;
    throw error;
  }

  return transaction;
}

async function markPaymentTimeoutIfNeeded(transaction) {
  const expiredAt = Number(transaction.expired_at) || 0;
  const paymentState = transaction.payment_state;

  if (
    expiredAt > 0
    && now() > expiredAt
    && paymentState !== "PAID"
    && paymentState !== "PAYMENT_TIMEOUT"
    && transaction.status === "WAITING_PAYMENT"
  ) {
    await firebaseService.updateValue(`/transactions/${transaction.transaction_id}`, {
      payment_state: "PAYMENT_TIMEOUT",
      order_state: "PAYMENT_TIMEOUT",
      status: "PAYMENT_TIMEOUT",
      updated_at: now()
    });

    await firebaseService.updateValue(`/machines/${transaction.machine_id}/current_order`, {
      payment_state: "PAYMENT_TIMEOUT",
      order_state: "PAYMENT_TIMEOUT"
    });

    await firebaseService.updateValue(`/machines/${transaction.machine_id}/status`, {
      machine_state: "IDLE",
      is_busy: false,
      last_updated: now()
    });

    await logService.createLog({
      machine_id: transaction.machine_id,
      event: "PAYMENT_TIMEOUT",
      message: `Payment timeout for ${transaction.transaction_id}`,
      source: "BACKEND"
    });

    return getTransaction(transaction.transaction_id);
  }

  return transaction;
}

async function getTransactionStatus(transactionId) {
  const transaction = await markPaymentTimeoutIfNeeded(await getTransaction(transactionId));

  return {
    transaction_id: transaction.transaction_id,
    machine_id: transaction.machine_id,
    item_id: transaction.item_id,
    item_name: transaction.item_name || "NONE",
    qty: Number(transaction.qty) || 0,
    price: Number(transaction.price) || 0,
    total_price: Number(transaction.total_price) || 0,
    payment_state: transaction.payment_state,
    order_state: transaction.order_state || transaction.status || "NONE",
    dispense_result: transaction.dispense_result || "NONE",
    payment_method: transaction.payment_method || "NONE",
    payment_url: transaction.payment_url || "NONE",
    qr_url: transaction.qr_url || "NONE",
    qr_string: transaction.qr_string || "NONE"
  };
}

async function updateCurrentOrderIfMatches(machineId, transactionId, payload) {
  const currentOrder = await firebaseService.getValue(`/machines/${machineId}/current_order`);

  if (currentOrder && currentOrder.transaction_id === transactionId) {
    await firebaseService.updateValue(`/machines/${machineId}/current_order`, payload);
  }
}

async function simulatePaid(transactionId) {
  const transaction = await getTransaction(transactionId);
  const timestamp = now();

  if (transaction.payment_state !== "PAID") {
    await firebaseService.updateValue(`/transactions/${transactionId}`, {
      payment_state: "PAID",
      order_state: "READY_TO_DISPENSE",
      status: "READY_TO_DISPENSE",
      updated_at: timestamp
    });

    await updateCurrentOrderIfMatches(transaction.machine_id, transactionId, {
      payment_state: "PAID",
      order_state: "READY_TO_DISPENSE",
      updated_at: timestamp
    });

    await firebaseService.updateValue(`/machines/${transaction.machine_id}/status`, {
      machine_state: "READY_TO_DISPENSE",
      is_busy: true,
      last_updated: timestamp
    });

    await logService.createLog({
      machine_id: transaction.machine_id,
      event: "PAYMENT_SIMULATED_PAID",
      message: `Payment simulated as PAID for ${transactionId}`,
      source: "BACKEND"
    });
  }

  return {
    transaction_id: transactionId,
    payment_state: "PAID",
    order_state: "READY_TO_DISPENSE"
  };
}

async function listTransactions({ machine_id, limit = 5, status } = {}) {
  const transactions = await firebaseService.getValue("/transactions");
  const requestedLimit = Number(limit) || 5;
  const maxLimit = Math.min(Math.max(requestedLimit, 1), 50);

  return Object.values(transactions || {})
    .filter((transaction) => !machine_id || transaction.machine_id === machine_id)
    .filter((transaction) => !status || transaction.status === status)
    .sort((a, b) => {
      const timeA = Number(a.updated_at || a.created_at) || 0;
      const timeB = Number(b.updated_at || b.created_at) || 0;
      return timeB - timeA;
    })
    .slice(0, maxLimit);
}

async function updateTransaction(transactionId, payload) {
  await firebaseService.updateValue(`/transactions/${transactionId}`, {
    ...payload,
    updated_at: now()
  });

  return getTransaction(transactionId);
}

async function handleDispenseResult(transactionId, { machine_id, dispense_result }) {
  if (!machine_id || !dispense_result) {
    const error = new Error("machine_id and dispense_result are required");
    error.statusCode = 400;
    throw error;
  }

  const result = String(dispense_result).toUpperCase();

  if (result !== "SUCCESS" && result !== "FAILED") {
    const error = new Error("dispense_result must be SUCCESS or FAILED");
    error.statusCode = 400;
    throw error;
  }

  const transaction = await getTransaction(transactionId);
  const itemId = transaction.item_id;
  const qty = Number(transaction.qty) || 0;

  console.log("[dispense] transaction_id:", transactionId);
  console.log("[dispense] machine_id:", machine_id);
  console.log("[dispense] item_id:", itemId);
  console.log("[dispense] qty:", qty);

  if (transaction.machine_id !== machine_id) {
    const error = new Error("machine_id does not match transaction");
    error.statusCode = 400;
    throw error;
  }

  if (transaction.dispense_result === "SUCCESS" || transaction.dispense_result === "FAILED") {
    const error = new Error("Dispense result has already been processed");
    error.statusCode = 409;
    throw error;
  }

  if (transaction.payment_state !== "PAID") {
    const error = new Error("Dispense result can only be processed when payment_state is PAID");
    error.statusCode = 400;
    throw error;
  }

  const timestamp = now();

  if (result === "SUCCESS") {
    await inventoryService.decrementStock(machine_id, itemId, qty);
    await updateTransaction(transactionId, {
      order_state: "COMPLETED",
      status: "COMPLETED",
      dispense_result: "SUCCESS"
    });
    await updateCurrentOrderIfMatches(machine_id, transactionId, {
      payment_state: "PAID",
      order_state: "COMPLETED",
      dispense_result: "SUCCESS",
      updated_at: timestamp
    });
    await firebaseService.updateValue(`/machines/${machine_id}/status`, {
      machine_state: "IDLE",
      is_busy: false,
      dispense_result: "SUCCESS",
      last_updated: now()
    });
    await logService.createLog({
      machine_id,
      event: "DISPENSE_SUCCESS",
      message: `Dispense success for ${transactionId}`,
      source: "ESP32"
    });
  } else {
    await updateTransaction(transactionId, {
      order_state: "DISPENSE_FAILED",
      status: "DISPENSE_FAILED",
      dispense_result: "FAILED"
    });
    await updateCurrentOrderIfMatches(machine_id, transactionId, {
      payment_state: "PAID",
      order_state: "DISPENSE_FAILED",
      dispense_result: "FAILED",
      updated_at: timestamp
    });
    await firebaseService.updateValue(`/machines/${machine_id}/status`, {
      machine_state: "ERROR",
      is_busy: false,
      dispense_result: "FAILED",
      last_updated: now()
    });
    await logService.createLog({
      machine_id,
      event: "DISPENSE_FAILED",
      message: `Dispense failed for ${transactionId}`,
      source: "ESP32"
    });
  }

  const updatedTransaction = await getTransaction(transactionId);

  return {
    transaction_id: updatedTransaction.transaction_id,
    payment_state: updatedTransaction.payment_state,
    order_state: updatedTransaction.order_state || updatedTransaction.status,
    dispense_result: updatedTransaction.dispense_result
  };
}

module.exports = {
  createTransaction,
  getTransaction,
  getTransactionStatus,
  simulatePaid,
  listTransactions,
  updateTransaction,
  handleDispenseResult
};
