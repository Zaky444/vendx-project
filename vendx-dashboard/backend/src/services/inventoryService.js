const { db, getValue } = require("./firebaseService");
const logService = require("./logService");

async function getItem(machineId, itemId) {
  return getValue(`/machines/${machineId}/items/${itemId}`);
}

async function assertAvailableItem(machineId, itemId, qty) {
  const item = await getItem(machineId, itemId);

  if (!item) {
    const error = new Error("Item not found");
    error.statusCode = 404;
    throw error;
  }

  if (item.is_active !== true) {
    const error = new Error("Item is inactive");
    error.statusCode = 400;
    throw error;
  }

  if ((Number(item.stock) || 0) < qty) {
    const error = new Error("Insufficient stock");
    error.statusCode = 400;
    throw error;
  }

  return item;
}

async function restockItem(machineId, itemId, qty, adminId = "UNKNOWN") {
  const amount = Number(qty);

  if (!Number.isInteger(amount) || amount <= 0) {
    const error = new Error("qty must be a positive integer");
    error.statusCode = 400;
    throw error;
  }

  const stockRef = db.ref(`/machines/${machineId}/items/${itemId}/stock`);
  const oldSnapshot = await stockRef.once("value");
  const oldStock = Number(oldSnapshot.val()) || 0;
  const newStock = oldStock + amount;

  await stockRef.set(newStock);

  await logService.createLog({
    machine_id: machineId,
    event: "STOCK_RESTOCK",
    message: `Restocked ${itemId} by ${amount} units. Admin: ${adminId}`,
    source: "BACKEND"
  });

  return {
    item_id: itemId,
    old_stock: oldStock,
    added_stock: amount,
    new_stock: newStock
  };
}

async function decrementStock(machineId, itemId, qty) {
  const amount = Number(qty);

  if (!machineId || !itemId) {
    const error = new Error("machineId or itemId is missing");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error("Invalid dispense quantity");
    error.statusCode = 400;
    throw error;
  }

  const stockPath = `/machines/${machineId}/items/${itemId}/stock`;
  const stockRef = db.ref(stockPath);
  const stockSnap = await stockRef.once("value");

  console.log("[dispense] stockPath:", stockPath);
  console.log("[dispense] stock exists:", stockSnap.exists());
  console.log("[dispense] stock before:", stockSnap.val());
  console.log("[dispense] stock type:", typeof stockSnap.val());

  if (!stockSnap.exists()) {
    const error = new Error("Stock path not found");
    error.statusCode = 404;
    error.details = { stockPath };
    throw error;
  }

  const stockBefore = Number(stockSnap.val());

  if (!Number.isFinite(stockBefore)) {
    const error = new Error("Stock value is not a valid number");
    error.statusCode = 400;
    error.details = {
      stockPath,
      stock_before: stockSnap.val(),
      qty: amount
    };
    throw error;
  }

  if (stockBefore < amount) {
    const error = new Error("Insufficient stock for dispense");
    error.statusCode = 400;
    error.details = {
      stockPath,
      stock_before: stockBefore,
      qty: amount
    };
    throw error;
  }

  const result = await stockRef.transaction((currentStock) => {
    console.log("[dispense] stock transaction current:", currentStock);

    if (currentStock === null || currentStock === undefined) {
      return stockBefore - amount;
    }

    const stock = Number(currentStock);

    if (!Number.isFinite(stock) || stock < amount) {
      return;
    }

    return stock - amount;
  });

  console.log("[dispense] stock transaction committed:", result.committed);
  console.log("[dispense] stock after:", result.snapshot.val());

  if (!result.committed) {
    const error = new Error("Insufficient stock for dispense");
    error.statusCode = 400;
    error.details = {
      stockPath,
      stock_before: stockBefore,
      qty: amount
    };
    throw error;
  }

  const newStock = Number(result.snapshot.val()) || 0;

  return {
    item_id: itemId,
    old_stock: stockBefore,
    deducted_stock: amount,
    new_stock: newStock
  };
}

module.exports = {
  getItem,
  assertAvailableItem,
  restockItem,
  decrementStock
};
