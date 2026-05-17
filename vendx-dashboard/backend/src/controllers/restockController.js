const inventoryService = require("../services/inventoryService");
const { sendSuccess } = require("../utils/response");

async function restockItem(req, res) {
  const { machineId, itemId } = req.params;
  const { amount, qty, admin_id } = req.body;
  const result = await inventoryService.restockItem(machineId, itemId, amount ?? qty, admin_id);
  return sendSuccess(res, result, "Item restocked");
}

module.exports = {
  restockItem
};
