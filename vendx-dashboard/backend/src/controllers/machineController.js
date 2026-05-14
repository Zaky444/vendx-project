const firebaseService = require("../services/firebaseService");
const { sendSuccess } = require("../utils/response");

async function getMachineOverview(req, res) {
  const { machineId } = req.params;
  const overview = await firebaseService.getMachineOverview(machineId);
  return sendSuccess(res, overview, "Machine overview retrieved");
}

async function getMachineItems(req, res) {
  const { machineId } = req.params;
  const items = await firebaseService.getValue(`/machines/${machineId}/items`);
  return sendSuccess(res, items || {}, "Machine items retrieved");
}

module.exports = {
  getMachineOverview,
  getMachineItems
};
