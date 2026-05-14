const { pushValue, getValue } = require("./firebaseService");
const { now } = require("../utils/time");

async function createLog({ machine_id, event, message, source = "BACKEND", timestamp = now() }) {
  if (!machine_id || !event || !message) {
    const error = new Error("machine_id, event, and message are required");
    error.statusCode = 400;
    throw error;
  }

  return pushValue("/logs", {
    machine_id,
    event,
    message,
    source,
    timestamp
  });
}

async function listLogs({ machine_id, limit = 10 } = {}) {
  const logs = await getValue("/logs");
  const maxLimit = Math.min(Number(limit) || 10, 100);

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
