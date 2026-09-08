const { validationResult } = require("express-validator");
const { sendError } = require("./response");

function handleValidation(req, res, next) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return next();
  }

  const errors = result.array().map((item) => ({
    field: item.path,
    message: item.msg
  }));

  return sendError(res, "Validation failed", 400, errors, "VALIDATION_ERROR");
}

module.exports = {
  handleValidation
};
