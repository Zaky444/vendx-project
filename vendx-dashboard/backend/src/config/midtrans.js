const midtransClient = require("midtrans-client");

const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
const serverKey = process.env.MIDTRANS_SERVER_KEY;
const clientKey = process.env.MIDTRANS_CLIENT_KEY;

const snap = new midtransClient.Snap({
  isProduction,
  serverKey,
  clientKey
});

const coreApi = new midtransClient.CoreApi({
  isProduction,
  serverKey,
  clientKey
});

module.exports = {
  snap,
  coreApi,
  isProduction
};
