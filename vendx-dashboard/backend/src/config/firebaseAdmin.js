const admin = require("firebase-admin");
const path = require("path");

function getServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }

    return serviceAccount;
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const serviceAccountPath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    return require(serviceAccountPath);
  }

  throw new Error(
    "Firebase service account is required. Set FIREBASE_SERVICE_ACCOUNT_JSON for Vercel or FIREBASE_SERVICE_ACCOUNT_PATH for local development."
  );
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount()),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });

  console.log("Firebase Admin initialized.");
}

const db = admin.database();

module.exports = {
  admin,
  db,
};