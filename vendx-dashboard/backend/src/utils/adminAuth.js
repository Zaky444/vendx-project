const { safeCompare } = require("./cryptoUtils");

function requireAdminKey(req, res, next) {
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    return res.status(503).json({
      success: false,
      message: "ADMIN_API_KEY is not configured on the server"
    });
  }

  // Bandingkan timing-safe agar tahan timing attack.
  if (!safeCompare(req.get("X-Admin-Key") || "", adminKey)) {
    return res.status(401).json({
      success: false,
      message: "Invalid or missing X-Admin-Key header"
    });
  }

  return next();
}

module.exports = {
  requireAdminKey
};
