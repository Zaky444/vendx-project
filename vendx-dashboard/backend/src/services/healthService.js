const { db } = require("../config/firebaseAdmin");
const packageJson = require("../../package.json");

async function checkFirebase() {
  try {
    const snapshot = await db.ref(".info/connected").once("value");
    return snapshot.val() === true ? "ok" : "error";
  } catch (error) {
    return "error";
  }
}

async function getHealthDetail() {
  const firebase = await checkFirebase();
  const healthy = firebase === "ok";

  return {
    healthy,
    detail: {
      success: healthy,
      status: healthy ? "ok" : "degraded",
      timestamp: Date.now(),
      uptime: Math.floor(process.uptime()),
      version: packageJson.version,
      dependencies: {
        firebase
      }
    }
  };
}

module.exports = {
  checkFirebase,
  getHealthDetail
};
