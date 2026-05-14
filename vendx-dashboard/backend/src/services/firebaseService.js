const { db } = require("../config/firebaseAdmin");

async function getValue(path) {
  const snapshot = await db.ref(path).once("value");
  return snapshot.val();
}

async function setValue(path, value) {
  await db.ref(path).set(value);
  return value;
}

async function updateValue(path, value) {
  await db.ref(path).update(value);
  return value;
}

async function pushValue(path, value) {
  const ref = db.ref(path).push();
  await ref.set(value);
  return {
    id: ref.key,
    ...value
  };
}

async function getMachineOverview(machineId) {
  const [info, status, items, currentOrder] = await Promise.all([
    getValue(`/machines/${machineId}/info`),
    getValue(`/machines/${machineId}/status`),
    getValue(`/machines/${machineId}/items`),
    getValue(`/machines/${machineId}/current_order`)
  ]);

  return {
    info: info || {},
    status: status || {},
    items: items || {},
    current_order: currentOrder || {}
  };
}

function getCurrentOrderNone() {
  return {
    transaction_id: "NONE",
    session_id: "NONE",
    item_id: "NONE",
    item_name: "NONE",
    qty: 0,
    price: 0,
    total_price: 0,
    payment_method: "NONE",
    payment_state: "NONE",
    order_state: "NONE",
    dispense_result: "NONE",
    qr_url: "NONE",
    payment_url: "NONE",
    expired_at: 0,
    updated_at: 0
  };
}

module.exports = {
  db,
  getValue,
  setValue,
  updateValue,
  pushValue,
  getMachineOverview,
  getCurrentOrderNone
};
