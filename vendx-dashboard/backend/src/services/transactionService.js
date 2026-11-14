const firebaseService = require("./firebaseService");
const inventoryService = require("./inventoryService");
const logService = require("./logService");
const { generateSessionId, generateTransactionId } = require("../utils/idGenerator");
const { now } = require("../utils/time");

// Batas keras penguncian mesin (spec): setelah 25 detik, order menggantung
// dianggap hangus dan mesin boleh dilepas untuk order berikutnya.
const LOCK_TIMEOUT_MS = 25000;

/**
 * Lepaskan kunci mesin: kosongkan current_order + kembalikan status idle.
 * Dipakai oleh lazy auto-release, cancel, dan webhook.
 */
async function releaseMachineLock(machineId) {
  const timestamp = now();

  await firebaseService.setValue(`/machines/${machineId}/current_order`, {
    transaction_id: "NONE",
    item_id: "NONE",
    item_name: "NONE",
    payment_state: "NONE",
    order_state: "IDLE",
    status: "IDLE",
    dispense_result: "NONE",
    updated_at: timestamp
  });

  await firebaseService.updateValue(`/machines/${machineId}/status`, {
    machine_state: "IDLE",
    is_busy: false,
    last_updated: timestamp
  });
}

function validatePositiveQty(qty) {
  const amount = Number(qty);

  if (!Number.isInteger(amount) || amount <= 0) {
    const error = new Error("qty must be a positive integer");
    error.code = "VALIDATION_ERROR";
    error.statusCode = 400;
    error.details = { qty };
    throw error;
  }

  // Prototipe: batasi qty = 1 per order (Opsi A).
  // Sensor drop hanya mendeteksi pengambilan satu barang; multi-qty
  // akan diimplementasikan setelah UI/UX disesuaikan.
  if (amount > 1) {
    const error = new Error("qty must be 1 for now (prototype limitation)");
    error.code = "VALIDATION_ERROR";
    error.statusCode = 400;
    error.details = { qty, max_allowed: 1 };
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

  // Konkurensi (#23 + spec): transaksi aktif yang mengunci mesin diverifikasi.
  // Bila transaksi pengunci sudah tidak ada / final / lewat kedaluwarsa, ia
  // dianggap hangus: statusnya di-expire dan mesin dilepas, lalu order baru
  // lanjut di request yang sama (tanpa 409). Hanya bila memang masih aktif &
  // belum kedaluwarsa barulah ditolak MACHINE_BUSY.
  const TERMINAL_STATES = [
    "COMPLETED", "SUCCESS", "DISPENSE_FAILED", "PAYMENT_TIMEOUT",
    "PAYMENT_EXPIRED", "PAYMENT_FAILED", "EXPIRED", "CANCELLED", "FAILED", "TIMEOUT"
  ];
  const PENDING_STATES = ["WAITING_PAYMENT", "PENDING"];
  const existingOrder = await firebaseService.getValue(`/machines/${machine_id}/current_order`);
  if (existingOrder) {
    const activeStates = [
      "WAITING_PAYMENT", "READY_TO_DISPENSE", "DISPENSING",
      "PAID", "PENDING", "NEEDS_REVIEW"
    ];
    const payState = String(existingOrder.payment_state || "").toUpperCase();
    const ordState = String(existingOrder.order_state || existingOrder.status || "").toUpperCase();

    if (activeStates.includes(payState) || activeStates.includes(ordState)) {
      const activeTxId = existingOrder.transaction_id;
      let realTx = null;

      if (activeTxId && activeTxId !== "NONE") {
        realTx = await firebaseService.getValue(`/transactions/${activeTxId}`);
      }

      const realPay = String(realTx?.payment_state || "").toUpperCase();
      const realOrd = String(realTx?.order_state || realTx?.status || "").toUpperCase();
      const isFinal = !realTx
        || TERMINAL_STATES.includes(realPay)
        || TERMINAL_STATES.includes(realOrd);

      // (c) menggantung tapi sudah lewat expires_at / lebih dari 25s sejak dibuat.
      const created = Number(realTx?.created_at) || 0;
      const expAt = Number(realTx?.expired_at || realTx?.payment_expired_at) || 0;
      const hardLimit = created + LOCK_TIMEOUT_MS;
      const timedOut = Boolean(realTx)
        && !isFinal
        && (
          (expAt > 0 && now() > expAt)
          || now() > hardLimit
        );

      const staleLock = !realTx || isFinal || timedOut;

      if (staleLock) {
        // Hangus: expire-kan bila masih menggantung, lalu lepaskan mesin.
        if (realTx && PENDING_STATES.includes(realPay) && !isFinal) {
          await firebaseService.updateValue(`/transactions/${activeTxId}`, {
            payment_state: "EXPIRED",
            order_state: "EXPIRED",
            status: "EXPIRED",
            updated_at: now()
          });
          await logService.createLog({
            machine_id,
            event: "STALE_LOCK_RELEASED",
            message: `Stale order ${activeTxId} expired & released before creating new order`,
            transaction_id: activeTxId,
            source: "BACKEND"
          });
        }
        await releaseMachineLock(machine_id);
      } else {
        const error = new Error("Machine is busy with another order");
        error.code = "MACHINE_BUSY";
        error.statusCode = 409;
        error.details = { machine_id, active_transaction_id: activeTxId };
        throw error;
      }
    }
  }

  const transactionId = generateTransactionId();
  const sessionId = generateSessionId();
  const price = Number(item.price) || 0;
  const totalPrice = price * amount;
  const timestamp = now();
  // Spec poin 1: kedaluwarsa pembayaran 25 detik, selaras dengan LOCK_TIMEOUT
  // dan custom_expiry Midtrans. Bisa dioverride lewat env bila perlu demo lebih lama.
  const timeoutMs = Number(process.env.PAYMENT_TIMEOUT_MS) || LOCK_TIMEOUT_MS;
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
    payment_expired_at: expiredAt,
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
    payment_expired_at: expiredAt,
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
    transaction_id: transactionId,
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

async function applyPaymentTimeoutIfNeeded(transactionId) {
  const transaction = await getTransaction(transactionId);
  const terminalStates = [
    "READY_TO_DISPENSE",
    "DISPENSING",
    "COMPLETED",
    "DISPENSE_FAILED",
    "PAYMENT_TIMEOUT",
    "EXPIRED",
    "FAILED"
  ];
  const paymentState = transaction.payment_state || "NONE";
  const orderState = transaction.order_state || transaction.status || "NONE";
  const expiredAt = Number(transaction.payment_expired_at || transaction.expired_at) || 0;

  if (paymentState !== "WAITING_PAYMENT") {
    return transaction;
  }

  if (terminalStates.includes(orderState)) {
    return transaction;
  }

  if (!expiredAt || now() <= expiredAt) {
    return transaction;
  }

  const timestamp = now();

  await firebaseService.updateValue(`/transactions/${transactionId}`, {
    payment_state: "PAYMENT_TIMEOUT",
    order_state: "PAYMENT_TIMEOUT",
    status: "PAYMENT_TIMEOUT",
    dispense_result: transaction.dispense_result || "NONE",
    updated_at: timestamp
  });

  const currentOrder = await firebaseService.getValue(`/machines/${transaction.machine_id}/current_order`);
  if (currentOrder && currentOrder.transaction_id === transactionId) {
    await firebaseService.updateValue(`/machines/${transaction.machine_id}/current_order`, {
      payment_state: "PAYMENT_TIMEOUT",
      order_state: "PAYMENT_TIMEOUT",
      dispense_result: "NONE",
      updated_at: timestamp
    });
  }

  await firebaseService.updateValue(`/machines/${transaction.machine_id}/status`, {
    machine_state: "IDLE",
    is_busy: false,
    last_update: timestamp,
    last_updated: timestamp
  });

  await logService.createLog({
    machine_id: transaction.machine_id,
    event: "PAYMENT_TIMEOUT",
    message: `Payment timeout for transaction ${transactionId}`,
    transaction_id: transactionId,
    source: "BACKEND",
    timestamp
  });

  return getTransaction(transactionId);
}

async function getTransactionStatus(transactionId) {
  const transaction = await applyPaymentTimeoutIfNeeded(transactionId);

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
    qr_string: transaction.qr_string || "NONE",
    payment_expired_at: Number(transaction.payment_expired_at || transaction.expired_at) || 0
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
    // Spec poin 4: dispensing selesai (sukses) -> selalu lepaskan kunci mesin.
    await releaseMachineLock(machine_id);
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
    // Spec poin 4: dispensing selesai (gagal) -> selalu lepaskan kunci mesin.
    await releaseMachineLock(machine_id);
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

/**
 * Pembatalan eksplisit (spec poin 3) - dipanggil ESP32 (tombol Batal / countdown
 * habis) atau web. Mengubah status jadi CANCELLED dan melepaskan kunci mesin.
 */
async function cancelTransaction(transactionId, { machine_id } = {}) {
  const transaction = await getTransaction(transactionId);
  const machineId = machine_id || transaction.machine_id;
  const timestamp = now();

  await firebaseService.updateValue(`/transactions/${transactionId}`, {
    payment_state: "CANCELLED",
    order_state: "CANCELLED",
    status: "CANCELLED",
    updated_at: timestamp
  });

  // Lepaskan kunci mesin hanya bila masih memegang transaksi ini.
  const currentOrder = await firebaseService.getValue(`/machines/${machineId}/current_order`);
  if (currentOrder && currentOrder.transaction_id === transactionId) {
    await releaseMachineLock(machineId);
  }

  await logService.createLog({
    machine_id: machineId,
    event: "TRANSACTION_CANCELLED",
    message: `Transaction ${transactionId} cancelled`,
    transaction_id: transactionId,
    source: "MACHINE"
  });

  return {
    transaction_id: transactionId,
    payment_state: "CANCELLED",
    order_state: "CANCELLED",
    status: "CANCELLED"
  };
}

/**
 * Ringkasan analitik (issue #27, #26): menghitung SEMUA transaksi sukses
 * pada rentang waktu, bukan hanya yang terpotong limit tabel.
 * Zona waktu dikunci Asia/Jakarta (WIB) agar konsisten dengan jam operasional.
 */
async function getSummary({ machine_id } = {}) {
  const transactions = await firebaseService.getValue("/transactions");

  const successful = Object.values(transactions || {})
    .filter((t) => !machine_id || t.machine_id === machine_id)
    .filter((t) => {
      const status = String(t.status || "").toUpperCase();
      const dispense = String(t.dispense_result || "").toUpperCase();
      return status === "COMPLETED" || status === "SUCCESS" || dispense === "SUCCESS";
    });

  // Batas hari & bulan ini berdasarkan Asia/Jakarta (UTC+7).
  const nowJakarta = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const todayKey = nowJakarta.toISOString().slice(0, 10);       // YYYY-MM-DD (WIB)
  const monthKey = nowJakarta.toISOString().slice(0, 7);        // YYYY-MM (WIB)

  const toJakartaKey = (ts) => new Date(ts + 7 * 60 * 60 * 1000).toISOString();

  let todayOrders = 0, todayRevenue = 0, monthlyOrders = 0, monthlyRevenue = 0;

  for (const t of successful) {
    const time = Number(t.updated_at || t.created_at) || 0;
    if (!time) continue;
    const iso = toJakartaKey(time);
    const tDay = iso.slice(0, 10);
    const tMonth = iso.slice(0, 7);
    const price = Number(t.total_price) || 0;

    if (tDay === todayKey) { todayOrders++; todayRevenue += price; }
    if (tMonth === monthKey) { monthlyOrders++; monthlyRevenue += price; }
  }

  return {
    today_orders: todayOrders,
    today_revenue: todayRevenue,
    monthly_orders: monthlyOrders,
    monthly_revenue: monthlyRevenue,
    timezone: "Asia/Jakarta"
  };
}

module.exports = {
  createTransaction,
  getTransaction,
  getTransactionStatus,
  applyPaymentTimeoutIfNeeded,
  simulatePaid,
  listTransactions,
  getSummary,
  updateTransaction,
  cancelTransaction,
  releaseMachineLock,
  handleDispenseResult
};
