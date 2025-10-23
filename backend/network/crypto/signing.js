/*
  ChatGeek - Secure Programming Coursework
  Group: Group 99
  Members:
    - Finlay Bunt (Student ID: a1899706)
    - Akash Sapra (Student ID: a1941012)
    - Aditya Yadav (Student ID: a1961476)
    - Josh Harish (Student ID: a1886175)
    - Michelle Ngoc Bao Nguyen (Student ID: a1894969)
*/
// Transport signature helpers for SOCP: RSA-PSS/SHA-256 over canonical(payload).
const crypto = require("crypto");
const { canonicalize } = require("../util/canonicalJson");

// base64url helpers (no padding)
function toB64Url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function fromB64Url(b64u) {
  const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  return Buffer.from(b64 + pad, "base64");
}

// NOTE: Step 1 stored your entire PEMs as base64url of the PEM text.
// These helpers decode back to PEM text for Node's crypto APIs.
function pemFromB64Url(b64u) {
  return fromB64Url(b64u).toString("utf8");
}

/**
 * Sign a payload object with RSA-PSS(SHA-256).
 * @param {object} payloadObj - the JSON payload to sign (NOT the whole envelope)
 * @param {string} privateKeyPemB64Url - base64url of the PEM private key
 * @returns {string} base64url signature
 */
function signPayload(payloadObj, privateKeyPemB64Url) {
  const data = canonicalize(payloadObj);
  const signer = crypto.createSign("sha256");
  signer.update(data);
  signer.end();
  const keyPem = pemFromB64Url(privateKeyPemB64Url);
  const sig = signer.sign({
    key: keyPem,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: 32,
  });
  return toB64Url(sig);
}

/**
 * Verify a payload signature with RSA-PSS(SHA-256).
 * @param {object} payloadObj
 * @param {string} sigB64Url - base64url signature to verify
 * @param {string} publicKeyPemB64Url - base64url of the PEM public key
 * @returns {boolean}
 */
function verifyPayload(payloadObj, sigB64Url, publicKeyPemB64Url) {
  const data = canonicalize(payloadObj);
  const verifier = crypto.createVerify("sha256");
  verifier.update(data);
  verifier.end();
  const keyPem = pemFromB64Url(publicKeyPemB64Url);
  return verifier.verify(
    { key: keyPem, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
    fromB64Url(sigB64Url)
  );
}

module.exports = {
  signPayload,
  verifyPayload,
  toB64Url,
  fromB64Url,
  pemFromB64Url,
};
