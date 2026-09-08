const express = require("express");
const { body } = require("express-validator");
const machineController = require("../controllers/machineController");
const restockController = require("../controllers/restockController");
const { asyncHandler } = require("../utils/response");
const { handleValidation } = require("../utils/validate");

const router = express.Router();

// Status ESP32 longgar: semua field opsional, hanya cek tipe jika dikirim
const statusValidation = [
  body("connection").optional().isString().withMessage("connection must be a string"),
  body("machine_state").optional().isString().withMessage("machine_state must be a string"),
  body("is_busy").optional().isBoolean().withMessage("is_busy must be a boolean"),
  body("dispense_result").optional().isString().withMessage("dispense_result must be a string")
];

const restockValidation = [
  body("qty").optional().isInt({ min: 1 }).withMessage("qty must be an integer of at least 1"),
  body("amount").optional().isInt({ min: 1 }).withMessage("amount must be an integer of at least 1")
];

const eventValidation = [
  body("event").isString().notEmpty().withMessage("event is required and must be a string")
];

router.get("/:machineId/overview", asyncHandler(machineController.getMachineOverview));
router.get("/:machineId/status", asyncHandler(machineController.getMachineStatus));
router.patch("/:machineId/status", statusValidation, handleValidation, asyncHandler(machineController.updateMachineStatus));
router.get("/:machineId/current-order", asyncHandler(machineController.getCurrentOrder));
router.get("/:machineId/command", asyncHandler(machineController.getMachineCommand));
router.post("/:machineId/events", eventValidation, handleValidation, asyncHandler(machineController.createMachineEvent));
router.get("/:machineId/items", asyncHandler(machineController.getMachineItems));
router.get("/:machineId/items/:itemId", asyncHandler(machineController.getMachineItem));
router.post("/:machineId/items/:itemId/restock", restockValidation, handleValidation, asyncHandler(restockController.restockItem));

module.exports = router;
