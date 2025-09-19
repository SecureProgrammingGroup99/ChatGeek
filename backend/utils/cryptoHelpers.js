// backend/utils/cryptoHelpers.js
const crypto = require("crypto");
const base64url = require("base64url");
const { getUserPubkey, getServerPubkey } = require("../models/keyLookup");
// implement getUserPubkey/getServerPubkey to fetch pubkeys from DB or bootstrap

function canonicalizePayload(payloadObj) {
  // deterministic JSON: sort keys; this is simple: stringify with stable key ordering
  const ordered = {};
  Object.keys(payloadObj)
    .sort()
    .forEach((k) => (ordered[k] = payloadObj[k]));
  return JSON.stringify(ordered);
}

function verifyTransportSignature(senderId, payloadObj, sigB64url) {
  // senderId may be 'server_1' or a user id. Look up public key accordingly.
  const pubkeyB64url = senderId.startsWith("server_")
    ? getServerPubkey(senderId)
    : getUserPubkey(senderId);
  if (!pubkeyB64url) return false;
  const pubPem = base64url.toBuffer(pubkeyB64url).toString("utf8"); // depends on how to store keys
  const verifier = crypto.createVerify("sha256");
  verifier.update(canonicalizePayload(payloadObj));
  verifier.end();
  const sigBuf = base64url.toBuffer(sigB64url);
  try {
    return verifier.verify(
      {
        key: pubPem,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      },
      sigBuf
    );
  } catch (e) {
    return false;
  }
}

module.exports = { verifyTransportSignature, canonicalizePayload };
