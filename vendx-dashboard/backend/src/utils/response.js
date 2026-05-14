function sendSuccess(res, data = null, message = "OK", statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
}

function sendError(res, message = "Internal server error", statusCode = 500, details = null) {
  return res.status(statusCode).json({
    success: false,
    message,
    details
  });
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

module.exports = {
  sendSuccess,
  sendError,
  asyncHandler
};
