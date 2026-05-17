const firebaseService = require("../services/firebaseService");
const machineService = require("../services/machineService");
const { sendSuccess } = require("../utils/response");

async function getMachineOverview(req, res) {
  const { machineId } = req.params;
  const overview = await firebaseService.getMachineOverview(machineId);
  return sendSuccess(res, overview, "Machine overview retrieved");
}

async function getMachineItems(req, res) {
  const { machineId } = req.params;
  const result = await machineService.getMachineItems(machineId);
  return sendSuccess(res, result, "Machine items fetched");
}

async function getMachineItem(req, res) {
  const { machineId, itemId } = req.params;
  const item = await machineService.getMachineItem(machineId, itemId);
  return sendSuccess(res, item, "Machine item fetched");
}

async function getMachineStatus(req, res) {
  const { machineId } = req.params;
  const status = await machineService.getMachineStatus(machineId);
  return sendSuccess(res, status, "Machine status fetched");
}

async function updateMachineStatus(req, res) {
  const { machineId } = req.params;
  const result = await machineService.updateMachineStatus(machineId, req.body);
  return sendSuccess(res, result, "Machine status updated");
}

async function getCurrentOrder(req, res) {
  const { machineId } = req.params;
  const currentOrder = await machineService.getCurrentOrder(machineId);
  return sendSuccess(res, currentOrder, "Current order fetched");
}

module.exports = {
  getMachineOverview,
  getMachineItems,
  getMachineItem,
  getMachineStatus,
  updateMachineStatus,
  getCurrentOrder
};
