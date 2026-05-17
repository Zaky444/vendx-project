const express = require("express");
const machineController = require("../controllers/machineController");
const restockController = require("../controllers/restockController");
const { asyncHandler } = require("../utils/response");

const router = express.Router();

router.get("/:machineId/overview", asyncHandler(machineController.getMachineOverview));
router.get("/:machineId/status", asyncHandler(machineController.getMachineStatus));
router.patch("/:machineId/status", asyncHandler(machineController.updateMachineStatus));
router.get("/:machineId/current-order", asyncHandler(machineController.getCurrentOrder));
router.get("/:machineId/items", asyncHandler(machineController.getMachineItems));
router.get("/:machineId/items/:itemId", asyncHandler(machineController.getMachineItem));
router.post("/:machineId/items/:itemId/restock", asyncHandler(restockController.restockItem));

module.exports = router;
