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
// Presence gossip for SOCP: advertise/remove users across the mesh.
// Exposes call-in functions for your local layer, and handlers for remote frames.

const cfg = require("./config");
const bus = require("./events");
const { meshState, markSeen, isSeen } = require("./state/meshState");
const { buildSignedEnvelope } = require("./envelope");

// Helper: send a frame to all peers (optionally exclude one server_id)
function sendToAllPeers(frame, excludeServerId) {
  for (const [id, link] of meshState.servers) {
    if (excludeServerId && id === excludeServerId) continue;
    try { link.send(frame); } catch { /* ignore per-peer send errors */ }
  }
}

// Fingerprint to suppress loops & replays (90s TTL in meshState)
function fp(env, userId) {
  return `${env.type}|${env.from}|${userId}|${env.ts}`;
}

// API:
// Announces that a *local* user is now hosted on this server.
function advertiseUser(userId, meta = {}) {
  // Update local directory
  meshState.userLocations.set(userId, "local");

  // Server id we advertise with: runtime selfId if set, else config SERVER_ID
  const server_id = meshState.selfId || cfg.SERVER_ID;

  // Gossip to peers (signed transport)
  const frame = buildSignedEnvelope("USER_ADVERTISE", "*", {
    user_id: userId,
    server_id,
    meta, // optional display fields; routing never depends on meta
  });
  sendToAllPeers(frame);
}

// Announces that a *local* user has fully disconnected from this server.
function removeUser(userId) {
  if (meshState.userLocations.get(userId) === "local") {
    meshState.userLocations.delete(userId);
  }
  const server_id = meshState.selfId || cfg.SERVER_ID;
  const frame = buildSignedEnvelope("USER_REMOVE", "*", {
    user_id: userId,
    server_id,
  });
  sendToAllPeers(frame);
}

// === Handlers for remote presence frames (called from routes/network.js) ===
function handleRemoteAdvertise(env) {
  const { user_id, server_id, meta } = env.payload || {};
  if (!user_id || !env.from) return;

  const id = fp(env, user_id);
  if (isSeen(id)) return;
  markSeen(id);

  // Authoritative mapping: the *sending server* (env.from) hosts the user
  meshState.userLocations.set(user_id, env.from);

  // Emit an event for the local layer (UI / logs)
  bus.emit("network:presenceUpdate", {
    type: "USER_ADVERTISE", user_id, server_id: env.from, meta: meta || {}
  });

  // Gossip onward to peers except the origin to avoid ping-pong
  sendToAllPeers(env, env.from);
}

function handleRemoteRemove(env) {
  const { user_id } = env.payload || {};
  if (!user_id || !env.from) return;

  const id = fp(env, user_id);
  if (isSeen(id)) return;
  markSeen(id);

  // Only delete if our directory points to the announcing server
  if (meshState.userLocations.get(user_id) === env.from) {
    meshState.userLocations.delete(user_id);
  }

  bus.emit("network:presenceUpdate", {
    type: "USER_REMOVE", user_id, server_id: env.from
  });

  sendToAllPeers(env, env.from);
}

module.exports = {
  advertiseUser,
  removeUser,
  handleRemoteAdvertise,
  handleRemoteRemove,
  sendToAllPeers,
};
