const express = require("express");
const logController = require("../controllers/logController");
const { asyncHandler } = require("../utils/response");

const router = express.Router();

router.get("/", asyncHandler(logController.listLogs));
router.post("/", asyncHandler(logController.createLog));

module.exports = router;
