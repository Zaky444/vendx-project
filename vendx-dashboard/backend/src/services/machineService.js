const firebaseService = require("./firebaseService");
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

module.exports = {
  getMachineItems,
  getMachineItem,
  getMachineStatus,
  updateMachineStatus,
  getCurrentOrder
};
