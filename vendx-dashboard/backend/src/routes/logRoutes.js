const express = require("express");
const { body } = require("express-validator");
const logController = require("../controllers/logController");
const { asyncHandler } = require("../utils/response");
const { handleValidation } = require("../utils/validate");

const router = express.Router();

const createLogValidation = [
  body("machine_id").optional().isString().withMessage("machine_id must be a string"),
  body("message").optional().isString().withMessage("message must be a string"),
  body("level").optional().isString().withMessage("level must be a string")
];

router.get("/", asyncHandler(logController.listLogs));
router.post("/", createLogValidation, handleValidation, asyncHandler(logController.createLog));

module.exports = router;
