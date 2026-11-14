const { safeCompare } = require("./cryptoUtils");
const { admin } = require("../config/firebaseAdmin");

// Role yang boleh melakukan aksi sensitif (restock, simulate-paid).
const PRIVILEGED_ROLES = ["admin", "operator"];

/**
 * Middleware akses sensitif yang menerima DUA jenis kredensial:
 *
 * 1. X-Admin-Key header            -> untuk pemanggilan server-to-server / tooling.
 * 2. Authorization: Bearer <idToken> -> untuk dashboard web (Firebase Auth).
 *    Token diverifikasi via Firebase Admin, lalu role user dicek DI SERVER
 *    (bukan percaya role yang dikirim browser - perbaikan issue #14).
 *
 * Endpoint yang dilindungi: restock, simulate-paid. Firmware ESP32 TIDAK
 * memakai endpoint ini, jadi tetap tidak terpengaruh.
 */
async function requirePrivilegedAccess(req, res, next) {
  // 1) Jalur service/tooling: X-Admin-Key.
  const adminKey = process.env.ADMIN_API_KEY;
  const providedKey = req.get("X-Admin-Key");

  if (adminKey && providedKey && safeCompare(providedKey, adminKey)) {
    req.auth = { via: "admin-key", role: "admin" };
    return next();
  }

  // 2) Jalur dashboard: Firebase ID token di header Authorization.
  const authHeader = req.get("Authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  const idToken = match ? match[1].trim() : "";

  if (idToken) {
    try {
      const decoded = await admin.auth().verifyIdToken(idToken, true);
      const uid = decoded.uid;
      const profileSnap = await admin.database().ref(`/users/${uid}`).once("value");
      const profile = profileSnap.val() || {};

      if (profile.is_active === false) {
        return res.status(403).json({ success: false, message: "User is inactive" });
      }

      const role = String(profile.role || decoded.role || "").toLowerCase();
      if (!PRIVILEGED_ROLES.includes(role)) {
        return res.status(403).json({
          success: false,
          message: `Role '${role || "none"}' tidak diizinkan untuk aksi ini`
        });
      }

      req.auth = { via: "firebase", uid, role };
      return next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired Firebase token"
      });
    }
  }

  // Tidak ada kredensial valid.
  return res.status(401).json({
    success: false,
    message: "Authentication required (X-Admin-Key or Firebase Bearer token)"
  });
}

module.exports = {
  requirePrivilegedAccess
};