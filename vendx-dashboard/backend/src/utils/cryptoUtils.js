const crypto = require("crypto");

/**
 * Verifikasi keaslian notifikasi Midtrans.
 * Rumus resmi: sha512(order_id + status_code + gross_amount + serverKey)
 * Harus dicocokkan dengan notification.signature_key memakai perbandingan
 * timing-safe agar tahan timing attack.
 *
 * @param {object} notification - body mentah dari Midtrans
 * @param {string} serverKey - MIDTRANS_SERVER_KEY
 * @returns {boolean} true jika signature valid
 */
function verifyMidtransSignature(notification, serverKey) {
  if (!serverKey) {
    return false;
  }

  const { order_id, status_code, gross_amount, signature_key } = notification;

  if (!order_id || !status_code || !gross_amount || !signature_key) {
    return false;
  }

  const expected = crypto
    .createHash("sha512")
    .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(String(signature_key), "utf8");

  // timingSafeEqual melempar bila panjang beda -> cek panjang dulu.
  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

/**
 * Bandingkan dua string secara timing-safe (untuk kunci admin dll).
 * Menghindari timing attack pada perbandingan `!==` biasa.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
  const bufA = Buffer.from(String(a), "utf8");
  const bufB = Buffer.from(String(b), "utf8");

  if (bufA.length !== bufB.length) {
    // Panjang beda -> pasti tidak sama, tapi tetap buang waktu konstan.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  verifyMidtransSignature,
  safeCompare
};