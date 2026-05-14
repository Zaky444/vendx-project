const express = require("express");
const restockController = require("../controllers/restockController");
const { asyncHandler } = require("../utils/response");

const router = express.Router();

router.post("/machines/:machineId/items/:itemId/restock", asyncHandler(restockController.restockItem));

module.exports = router;
