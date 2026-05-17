const { pushValue, getValue } = require("./firebaseService");
const { now } = require("../utils/time");

async function createLog({ machine_id, event, message, source = "BACKEND", transaction_id, timestamp = now() }) {
  if (!machine_id || !event || !message) {
    const error = new Error("machine_id, event, and message are required");
    error.statusCode = 400;
    throw error;
  }

  const log = {
    machine_id,
    event,
    message,
    source,
    timestamp
  };

  if (transaction_id) {
    log.transaction_id = transaction_id;
  }

  return pushValue("/logs", log);
}

async function listLogs({ machine_id, limit = 5 } = {}) {
  const logs = await getValue("/logs");
  const requestedLimit = Number(limit) || 5;
  const maxLimit = Math.min(Math.max(requestedLimit, 1), 50);

  return Object.entries(logs || {})
    .map(([id, value]) => ({ id, ...value }))
    .filter((log) => !machine_id || log.machine_id === machine_id)
    .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))
    .slice(0, maxLimit);
}

module.exports = {
  createLog,
  listLogs
};
