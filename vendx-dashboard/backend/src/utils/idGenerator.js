const crypto = require("crypto");

// Suffix acak yang aman secara kriptografis (bukan Math.random yang prediktabel).
// Menghasilkan `length` karakter alfanumerik uppercase tanpa karakter ambigu.
function randomSuffix(length = 4) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // tanpa I, O, 0, 1
  const bytes = crypto.randomBytes(length);
  let suffix = "";
  for (let i = 0; i < length; i++) {
    suffix += alphabet[bytes[i] % alphabet.length];
  }
  return suffix;
}

function generateTransactionId() {
  return `TRX${Date.now()}${randomSuffix(4)}`;
}

function generateSessionId() {
  return `SESSION${Date.now()}${randomSuffix(4)}`;
}

module.exports = {
  generateTransactionId,
  generateSessionId
};
