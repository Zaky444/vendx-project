const firebaseService = require("./firebaseService");
const logService = require("./logService");
const transactionService = require("./transactionService");
const { now } = require("../utils/time");

function assertMachineId(machineId) {
  if (!machineId) {
    const error = new Error("machineId is required");
    error.statusCode = 400;
    throw error;
  }
}

function assertItemId(itemId) {
  if (!itemId) {
    const error = new Error("itemId is required");
    error.statusCode = 400;
    throw error;
  }
}

async function getMachineItems(machineId) {
  assertMachineId(machineId);
  const items = await firebaseService.getValue(`/machines/${machineId}/items`);

  return {
    machine_id: machineId,
    items: items || {}
  };
}

async function getMachineItem(machineId, itemId) {
  assertMachineId(machineId);
  assertItemId(itemId);

  const item = await firebaseService.getValue(`/machines/${machineId}/items/${itemId}`);

  if (!item) {
    const error = new Error("Item not found");
    error.statusCode = 404;
    throw error;
  }

  return {
    machine_id: machineId,
    item_id: itemId,
    name: item.name || "NONE",
    price: Number(item.price) || 0,
    stock: Number(item.stock) || 0,
    is_active: item.is_active === true,
    slot_number: Number(item.slot_number) || 0
  };
}

async function getMachineStatus(machineId) {
  assertMachineId(machineId);
  const status = await firebaseService.getValue(`/machines/${machineId}/status`);

  return {
    machine_id: machineId,
    status: status || {}
  };
}

function pickStatusPayload(body = {}) {
  const allowedFields = ["connection", "machine_state", "is_busy", "dispense_result"];
  const payload = {};

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      payload[field] = body[field];
    }
  });

  if (payload.connection !== undefined && typeof payload.connection !== "string") {
    const error = new Error("connection must be a string");
    error.statusCode = 400;
    throw error;
  }

  if (payload.machine_state !== undefined && typeof payload.machine_state !== "string") {
    const error = new Error("machine_state must be a string");
    error.statusCode = 400;
    throw error;
  }

  if (payload.is_busy !== undefined && typeof payload.is_busy !== "boolean") {
    const error = new Error("is_busy must be a boolean");
    error.statusCode = 400;
    throw error;
  }

  if (payload.dispense_result !== undefined && typeof payload.dispense_result !== "string") {
    const error = new Error("dispense_result must be a string");
    error.statusCode = 400;
    throw error;
  }

  const timestamp = now();

  return {
    ...payload,
    last_update: timestamp,
    last_updated: timestamp
  };
}

async function updateMachineStatus(machineId, body) {
  assertMachineId(machineId);
  const payload = pickStatusPayload(body);
  await firebaseService.updateValue(`/machines/${machineId}/status`, payload);

  return {
    machine_id: machineId
  };
}

async function getCurrentOrder(machineId) {
  assertMachineId(machineId);
  const currentOrder = await firebaseService.getValue(`/machines/${machineId}/current_order`);

  return {
    machine_id: machineId,
    ...(currentOrder || firebaseService.getCurrentOrderNone())
  };
}

function isActiveTransactionId(transactionId) {
  return transactionId && transactionId !== "NONE";
}

function buildCommand(machineId, order = {}) {
  const paymentState = order.payment_state || "NONE";
  const orderState = order.order_state || "IDLE";
  const transactionId = order.transaction_id || "NONE";
  const base = {
    machine_id: machineId,
    transaction_id: transactionId,
    payment_state: paymentState,
    order_state: orderState
  };

  if (!isActiveTransactionId(transactionId)) {
    return {
      ...base,
      command: "IDLE",
      transaction_id: "NONE",
      payment_state: "NONE",
      order_state: "IDLE"
    };
  }

  const orderDetail = {
    item_id: order.item_id || "NONE",
    item_name: order.item_name || "NONE",
    payment_expired_at: Number(order.payment_expired_at || order.expired_at) || 0
  };

  if (paymentState === "WAITING_PAYMENT") {
    return {
      ...base,
      ...orderDetail,
      command: "WAIT_PAYMENT"
    };
  }

  if (paymentState === "PAID" && orderState === "READY_TO_DISPENSE") {
    return {
      ...base,
      ...orderDetail,
      command: "DISPENSE"
    };
  }

  if (paymentState === "PAYMENT_TIMEOUT" || orderState === "PAYMENT_TIMEOUT") {
    return {
      ...base,
      command: "PAYMENT_TIMEOUT"
    };
  }

  if (orderState === "COMPLETED") {
    return {
      ...base,
      command: "COMPLETED"
    };
  }

  if (orderState === "DISPENSE_FAILED") {
    return {
      ...base,
      command: "DISPENSE_FAILED"
    };
  }

  if (paymentState === "LATE_PAID" || orderState === "NEEDS_REVIEW") {
    return {
      ...base,
      command: "NEEDS_REVIEW"
    };
  }

  return {
    ...base,
    ...orderDetail,
    command: orderState === "DISPENSING" ? "DISPENSING" : "WAIT_PAYMENT"
  };
}

async function getMachineCommand(machineId) {
  assertMachineId(machineId);
  const currentOrder = await firebaseService.getValue(`/machines/${machineId}/current_order`);
  const transactionId = currentOrder?.transaction_id;

  if (!isActiveTransactionId(transactionId)) {
    return buildCommand(machineId);
  }

  const transaction = await transactionService.applyPaymentTimeoutIfNeeded(transactionId);
  return buildCommand(machineId, {
    ...currentOrder,
    ...transaction
  });
}

async function createMachineEvent(machineId, body = {}) {
  assertMachineId(machineId);

  const event = String(body.event || "").trim().toUpperCase();
  if (!event) {
    const error = new Error("event is required");
    error.statusCode = 400;
    throw error;
  }

  const timestamp = now();
  const transactionId = body.transaction_id || "NONE";
  const statusPayload = {
    last_update: timestamp,
    last_updated: timestamp
  };
  let message = body.message || event;

  if (event === "ONLINE") {
    Object.assign(statusPayload, {
      connection: "ONLINE",
      machine_state: "IDLE",
      is_busy: false
    });
  } else if (event === "IDLE") {
    Object.assign(statusPayload, {
      machine_state: "IDLE",
      is_busy: false
    });
  } else if (event === "ITEM_SELECTED") {
    Object.assign(statusPayload, {
      machine_state: "CREATING_ORDER",
      is_busy: true
    });
    message = `Item selected ${body.item_id || "NONE"}`;
  } else if (event === "QR_DISPLAYED") {
    Object.assign(statusPayload, {
      machine_state: "WAITING_PAYMENT",
      is_busy: true
    });
    message = `QR displayed for transaction ${transactionId}`;
  } else if (event === "DISPENSE_STARTED") {
    Object.assign(statusPayload, {
      machine_state: "DISPENSING",
      is_busy: true
    });

    const currentOrder = await firebaseService.getValue(`/machines/${machineId}/current_order`);
    if (currentOrder?.transaction_id === transactionId) {
      await firebaseService.updateValue(`/machines/${machineId}/current_order`, {
        order_state: "DISPENSING",
        updated_at: timestamp
      });
    }

    const transaction = await firebaseService.getValue(`/transactions/${transactionId}`);
    if (transaction?.machine_id === machineId && transaction.payment_state === "PAID") {
      await firebaseService.updateValue(`/transactions/${transactionId}`, {
        order_state: "DISPENSING",
        status: "DISPENSING",
        updated_at: timestamp
      });
    }

    message = `Dispense started for transaction ${transactionId}`;
  } else if (event === "PAYMENT_TIMEOUT_ACK") {
    Object.assign(statusPayload, {
      machine_state: "IDLE",
      is_busy: false
    });
    message = `Payment timeout acknowledged for transaction ${transactionId}`;
  } else if (event === "ERROR") {
    Object.assign(statusPayload, {
      machine_state: "ERROR",
      is_busy: false
    });
  } else {
    const error = new Error("Unsupported machine event");
    error.statusCode = 400;
    error.details = { event };
    throw error;
  }

  await firebaseService.updateValue(`/machines/${machineId}/status`, statusPayload);

  await logService.createLog({
    machine_id: machineId,
    event,
    message,
    transaction_id: isActiveTransactionId(transactionId) ? transactionId : undefined,
    source: "ESP32",
    timestamp
  });

  return {
    machine_id: machineId,
    event,
    transaction_id: transactionId,
    updated_at: timestamp
  };
}

module.exports = {
  getMachineItems,
  getMachineItem,
  getMachineStatus,
  updateMachineStatus,
  getCurrentOrder,
  getMachineCommand,
  createMachineEvent
};
