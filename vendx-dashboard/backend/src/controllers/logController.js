const logService = require("../services/logService");
const { sendSuccess } = require("../utils/response");

async function listLogs(req, res) {
  const logs = await logService.listLogs(req.query);
  return sendSuccess(res, logs, "Logs retrieved");
}

async function createLog(req, res) {
  const log = await logService.createLog(req.body);
  return sendSuccess(res, log, "Log created", 201);
}

module.exports = {
  listLogs,
  createLog
};
