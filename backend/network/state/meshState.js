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
// Central in-memory state for the SOCP mesh. Import this from anywhere.
// These Maps are the single source of truth for server links, addresses,
// local users (if/when you need them), user locations, and dedupe.

const meshState = {
  // Live server links: server_id (UUID v4) -> { ws, pubkeyB64Url, url, meta? }
  servers: new Map(),

  // Known server addresses/keys from introducers/announces:
  // server_id -> { url: "ws://host:port", pubkeyB64Url }
  serverAddrs: new Map(),

  // Local/internal layer may use these later; not touched by network layer yet:
  // user_id -> socket/connection handle (or any object your local layer uses)
  localUsers: new Map(),

  // Directory of where a user "lives": user_id -> "local" | <server_id>
  userLocations: new Map(),

  // Replay/loop suppression: id(string) -> expiryEpochMs
  // Use a TTL window (e.g. 90s) when marking seen.
  seenIds: new Map(),

  // Liveness timestamps: server_id -> lastSeenEpochMs (updated on any frame)
  lastSeen: new Map(),
};

/**
 * Mark a fingerprint as seen for TTL milliseconds (default 90s).
 * @param {string} id
 * @param {number} ttlMs
 */
function markSeen(id, ttlMs = 90000) {
  const now = Date.now();
  meshState.seenIds.set(id, now + ttlMs);
}

/**
 * Check and prune dedupe entries.
 * @param {string} id
 * @returns {boolean} true if the id was already seen and still within TTL
 */
function isSeen(id) {
  const now = Date.now();
  // prune expired on access (cheap)
  for (const [k, exp] of meshState.seenIds) {
    if (exp <= now) meshState.seenIds.delete(k);
  }
  const exp = meshState.seenIds.get(id);
  return !!(exp && exp > now);
}

/**
 * Convenience snapshot for debugging or a /list endpoint later.
 */
function getDirectorySnapshot() {
  return {
    servers: Array.from(meshState.servers.keys()),
    serverAddrs: Array.from(meshState.serverAddrs.entries()),
    userLocations: Array.from(meshState.userLocations.entries()),
    lastSeen: Array.from(meshState.lastSeen.entries()),
  };
}

module.exports = {
  meshState,
  markSeen,
  isSeen,
  getDirectorySnapshot,
};
