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
// Build & sign SOCP envelopes (transport signatures) and verify incoming frames.

const cfg = require("./config");
const { meshState } = require("./state/meshState");
const { signPayload, verifyPayload } = require("./crypto/signing");

// Types we allow to arrive unsigned during bootstrapping.
// Everything else should be verified if we know the peer's pubkey.
const BOOTSTRAP_TYPES = new Set([
  "SERVER_HELLO_JOIN",
  "SERVER_HELLO_LINK",
  // SERVER_ANNOUNCE can be unsigned the *first* time we see a peer (we don't have their key yet).
  "SERVER_ANNOUNCE",
]);

function nowTs() {
  return Date.now();
}

/**
 * Build an unsigned envelope. (Used internally.)
 */
function buildEnvelope(type, to, payload, fromOverride) {
  return {
    type,
    from: fromOverride || meshState?.selfId || cfg.SERVER_ID,
    to,
    ts: nowTs(),
    payload,
  };
}

/**
 * Build & sign an envelope over its payload (RSA-PSS/SHA-256).
 */
function buildSignedEnvelope(type, to, payload) {
  const env = buildEnvelope(type, to, payload);
  env.sig = signPayload(env.payload, cfg.SERVER_PRIVATE_KEY_B64URL);
  return env;
}

/**
 * Verify a received envelope's transport signature if we have the peer's key.
 * Returns { ok, reason }.
 */
function verifyIncoming(env) {
  // If we don't know the pubkey yet, allow bootstrap types through.
  const fromId = env?.from;
  const peerAddr = fromId && meshState.serverAddrs.get(fromId);
  const peerKey = peerAddr?.pubkey_b64url || meshState.servers.get(fromId)?.pubkey_b64url;

  if (!peerKey) {
    if (BOOTSTRAP_TYPES.has(env.type)) return { ok: true };
    // Unknown peer key and not a bootstrap message  reject softly
    return { ok: false, reason: "UNKNOWN_PEER_KEY" };
  }

  if (!env?.sig) return { ok: false, reason: "MISSING_SIG" };

  const ok = verifyPayload(env.payload, env.sig, peerKey);
  return ok ? { ok: true } : { ok: false, reason: "INVALID_SIG" };
}

/**
 * Helper to record/update a peer's advertised key & URL when we see them.
 */
function rememberPeer(fromId, { url, pubkey_b64url } = {}) {
  if (!fromId) return;
  const existing = meshState.serverAddrs.get(fromId) || {};
  const merged = {
    url: url || existing.url,
    pubkey_b64url: pubkey_b64url || existing.pubkey_b64url,
  };
  meshState.serverAddrs.set(fromId, merged);

  // Also stash on the live link if present (useful for quick lookups)
  const link = meshState.servers.get(fromId);
  if (link) {
    if (merged.pubkey_b64url) link.pubkey_b64url = merged.pubkey_b64url;
    if (merged.url) link.url = merged.url;
  }
}

module.exports = {
  buildEnvelope,
  buildSignedEnvelope,
  verifyIncoming,
  rememberPeer,
};
