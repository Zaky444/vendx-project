const express = require("express");
const machineController = require("../controllers/machineController");
const { asyncHandler } = require("../utils/response");

const router = express.Router();

router.get("/:machineId/overview", asyncHandler(machineController.getMachineOverview));
router.get("/:machineId/items", asyncHandler(machineController.getMachineItems));

module.exports = router;
