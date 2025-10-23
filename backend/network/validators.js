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
// Lightweight validation for envelopes & payloads.
const crypto = require("crypto");
const cfg = require("./config");
const { canonicalize } = require("./util/canonicalJson");

const LIMITS = {
  URL_MAX: 2048,
  PUBKEY_B64U_MAX: 8192,
  META_MAX_BYTES: 1024,
  FILE_ID_MAX: 128,
  FILE_NAME_MAX: 256,
  CIPHERTEXT_B64U_MAX: 1024 * 256,   // 256 KB
  FILE_CHUNK_B64U_MAX: 1024 * 256,   // 256 KB
  PUBLIC_META_MAX: 8 * 1024,         // 8 KB
  SKEW_MS: 5 * 60 * 1000,            // 5 minutes clock skew
};

const UUIDv4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidV4(s) { return typeof s === "string" && UUIDv4.test(s); }

function isB64Url(s, max = Infinity) {
  if (typeof s !== "string") return false;
  if (s.length === 0 || s.length > max) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return false; // no '='
  // Try decode
  try {
    const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
    Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
    return true;
  } catch { return false; }
}
function isB64UrlOrDev(s, max) {
  if (cfg.DEV_ALLOW_DUMMY_KEYS && s === "dummy") return true;
  return isB64Url(s, max);
}
function smallStr(s, max) {
  return typeof s === "string" && Buffer.byteLength(s, "utf8") <= max;
}
function saneTs(ts, skew = LIMITS.SKEW_MS) {
  return typeof ts === "number" && Math.abs(Date.now() - ts) <= skew;
}
function sha256b64u(obj) {
  const data = canonicalize(obj);
  const d = crypto.createHash("sha256").update(data).digest("base64");
  return d.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// Envelope-level check (cheap)
function validateEnvelope(env) {
  if (!env || typeof env !== "object") return { ok: false, reason: "BAD_ENVELOPE" };
  if (typeof env.type !== "string") return { ok: false, reason: "BAD_ENVELOPE" };
  if (!env.payload || typeof env.payload !== "object") return { ok: false, reason: "BAD_ENVELOPE" };
  if (!saneTs(env.ts)) return { ok: false, reason: "BAD_TIMESTAMP" };
  // 'from' may be empty during some hello flows, but for server frames it should exist
  if (!env.from || !isUuidV4(env.from)) {
    // Allow dev/test handshakes where from can be non-UUID
    if (!cfg.DEV_ALLOW_DUMMY_KEYS || !env.type.startsWith("SERVER_HELLO")) {
      return { ok: false, reason: "BAD_FROM" };
    }
  }
  return { ok: true };
}

// Per-type payload checks
function validateByType(type, p) {
  switch (type) {
    case "SERVER_HELLO_LINK":
      if (!p || !smallStr(p.url, LIMITS.URL_MAX)) return { ok: false, reason: "BAD_URL" };
      if (!isB64UrlOrDev(p.pubkey_b64url, LIMITS.PUBKEY_B64U_MAX)) return { ok: false, reason: "BAD_PUBKEY" };
      return { ok: true };

    case "SERVER_ANNOUNCE":
      if (!p || !isUuidV4(p.server_id)) return { ok: false, reason: "BAD_SERVER_ID" };
      if (!smallStr(p.url, LIMITS.URL_MAX)) return { ok: false, reason: "BAD_URL" };
      if (!isB64UrlOrDev(p.pubkey_b64url, LIMITS.PUBKEY_B64U_MAX)) return { ok: false, reason: "BAD_PUBKEY" };
      return { ok: true };

    case "USER_ADVERTISE":
      if (!p || !isUuidV4(p.user_id)) return { ok: false, reason: "BAD_USER_ID" };
      if (p.meta && Buffer.byteLength(JSON.stringify(p.meta || {}), "utf8") > LIMITS.META_MAX_BYTES)
        return { ok: false, reason: "META_TOO_LARGE" };
      return { ok: true };

    case "USER_REMOVE":
      if (!p || !isUuidV4(p.user_id)) return { ok: false, reason: "BAD_USER_ID" };
      return { ok: true };

    case "SERVER_DELIVER":
      if (!p || !isUuidV4(p.user_id)) return { ok: false, reason: "BAD_USER_ID" };
      if (!isB64Url(p.ciphertext, LIMITS.CIPHERTEXT_B64U_MAX)) return { ok: false, reason: "BAD_CIPHERTEXT" };
      if (p.sender && !isUuidV4(p.sender)) return { ok: false, reason: "BAD_SENDER" };
      if (p.sender_pub && !isB64UrlOrDev(p.sender_pub, LIMITS.PUBKEY_B64U_MAX)) return { ok: false, reason: "BAD_SENDER_PUB" };
      if (p.content_sig && !isB64Url(p.content_sig, 1024)) return { ok: false, reason: "BAD_CONTENT_SIG" };
      return { ok: true };

    case "FILE_START":
      if (!p || !isUuidV4(p.to_user)) return { ok: false, reason: "BAD_USER_ID" };
      if (!smallStr(p.file_id, LIMITS.FILE_ID_MAX)) return { ok: false, reason: "BAD_FILE_ID" };
      if (!smallStr(p.name, LIMITS.FILE_NAME_MAX)) return { ok: false, reason: "BAD_FILE_NAME" };
      if (typeof p.size !== "number" || p.size < 0) return { ok: false, reason: "BAD_FILE_SIZE" };
      if (!p.sha256 || typeof p.sha256 !== "string") return { ok: false, reason: "BAD_FILE_HASH" };
      return { ok: true };

    case "FILE_CHUNK":
      if (!p || !isUuidV4(p.to_user)) return { ok: false, reason: "BAD_USER_ID" };
      if (!smallStr(p.file_id, LIMITS.FILE_ID_MAX)) return { ok: false, reason: "BAD_FILE_ID" };
      if (typeof p.index !== "number" || p.index < 0) return { ok: false, reason: "BAD_CHUNK_INDEX" };
      if (!isB64Url(p.ciphertext, LIMITS.FILE_CHUNK_B64U_MAX)) return { ok: false, reason: "BAD_CHUNK" };
      return { ok: true };

    case "FILE_END":
      if (!p || !isUuidV4(p.to_user)) return { ok: false, reason: "BAD_USER_ID" };
      if (!smallStr(p.file_id, LIMITS.FILE_ID_MAX)) return { ok: false, reason: "BAD_FILE_ID" };
      return { ok: true };

    case "MSG_PUBLIC_CHANNEL":
      if (!p || !isB64Url(p.ciphertext, LIMITS.CIPHERTEXT_B64U_MAX)) return { ok: false, reason: "BAD_CIPHERTEXT" };
      return { ok: true };

    case "PUBLIC_CHANNEL_KEY_SHARE":
      if (!p || !isUuidV4(p.user_id)) return { ok: false, reason: "BAD_USER_ID" };
      if (!isB64Url(p.wrapped_key_b64url || "", LIMITS.PUBKEY_B64U_MAX)) return { ok: false, reason: "BAD_WRAPPED_KEY" };
      return { ok: true };

    case "PUBLIC_CHANNEL_ADD":
    case "PUBLIC_CHANNEL_UPDATED":
      if (!p) return { ok: false, reason: "BAD_PAYLOAD" };
      if (Buffer.byteLength(JSON.stringify(p), "utf8") > LIMITS.PUBLIC_META_MAX) return { ok: false, reason: "META_TOO_LARGE" };
      return { ok: true };

    case "HEARTBEAT":
    case "ACK":
    case "ERROR":
      return { ok: true };

    default:
      return { ok: false, reason: "UNKNOWN_TYPE" };
  }
}

module.exports = {
  LIMITS,
  isUuidV4,
  isB64Url,
  isB64UrlOrDev,
  saneTs,
  sha256b64u,
  validateEnvelope,
  validateByType,
};
