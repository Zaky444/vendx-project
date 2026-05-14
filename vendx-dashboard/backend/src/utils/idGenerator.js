function randomSuffix(length = 5) {
  return Math.random().toString(36).slice(2, 2 + length).toUpperCase();
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
