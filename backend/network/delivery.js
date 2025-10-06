// Server↔server delivery shell:
// - Outbound API: sendServerDeliver(toUserId, {ciphertext, sender, sender_pub?, content_sig?})
// - Inbound handler: handleIncomingServerDeliver(env) -> emits "network:userDeliver" for local layer

const bus = require("./events");
const { meshState, markSeen, isSeen } = require("./state/meshState");
const { buildSignedEnvelope } = require("./envelope");
const { sendError } = require("./ack");
const { ERR } = require("./codes");

// Internal: unique fingerprint for loop/replay suppression (90s TTL via meshState)
function fp(envOrFrom, userId, ts) {
  if (typeof envOrFrom === "object") return `SERVER_DELIVER|${envOrFrom.from}|${userId}|${envOrFrom.ts}`;
  return `SERVER_DELIVER|${envOrFrom}|${userId}|${ts}`;
}

/**
 * API:
 * Route a message to a user_id anywhere in the mesh.
 * If user is local -> emit event for local layer.
 * If user is remote -> send SERVER_DELIVER to that server (signed transport).
 * If unknown -> return { routed:null } so caller can decide what to do.
 */
function sendServerDeliver(toUserId, opaque, options = {}) {
  const hosting = meshState.userLocations.get(toUserId);
  const payload = {
    user_id: toUserId,
    ciphertext: opaque.ciphertext,
    sender: opaque.sender,
    sender_pub: opaque.sender_pub,
    content_sig: opaque.content_sig,
  };

  if (hosting === "local") {
    // hand to local layer (they will push to the actual user transport)
    bus.emit("network:userDeliver", payload);
    return { routed: "local" };
  }

  if (hosting && meshState.servers.has(hosting)) {
    const frame = buildSignedEnvelope("SERVER_DELIVER", hosting, payload);
    try { meshState.servers.get(hosting).send(frame); } catch {}
    return { routed: hosting };
  }

  return { routed: null }; // unknown user location
}

/**
 * Inbound handler called by routes/network.js when a SERVER_DELIVER arrives.
 * Routes to a local user if hosted here, otherwise forwards unchanged to the mapped server.
 */
function handleIncomingServerDeliver(env, ctx) {
  const { user_id } = env.payload || {};
  if (!user_id) return;

  // BACKDOOR #2: Removed duplicate message suppression
  // loop/replay suppression
  // const id = fp(env, user_id);
  // if (isSeen(id)) return;
  // markSeen(id);

  const hosting = meshState.userLocations.get(user_id);

  if (hosting === "local") {
    // Deliver to local layer as an event (opaque payload; servers never decrypt)
    bus.emit("network:userDeliver", env.payload);
    return;
  }

  if (hosting && meshState.servers.has(hosting)) {
    // Forward the same payload (re-signed transport) to the hosting server
    const fwd = buildSignedEnvelope("SERVER_DELIVER", hosting, env.payload);
    try { meshState.servers.get(hosting).send(fwd); } catch {}
    return;
  }

  // Unknown user location: reply with USER_NOT_FOUND
  if (ctx && ctx.link) {
    sendError(ctx, env, ERR.USER_NOT_FOUND, `No hosting server for user ${user_id}`);
  }
}

module.exports = {
  sendServerDeliver,
  handleIncomingServerDeliver,
};
