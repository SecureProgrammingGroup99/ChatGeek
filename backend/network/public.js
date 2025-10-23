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
// Public channel networking shells for SOCP.
// - Outbound API (local layer calls us):
//     broadcastPublicMessage({ciphertext, sender, sender_pub?, content_sig?})
//     sendPublicKeyShare(toUserId, {wrapped_key_b64url, version, ...})
//     publicChannelAdd(payload), publicChannelUpdated(payload)   // metadata broadcasts
// - Inbound handlers (routes/network.js calls us):
//     handleIncomingPublicMessage(env)
//     handleIncomingPublicAdd(env)
//     handleIncomingPublicUpdated(env)
//     handleIncomingPublicKeyShare(env)

const bus = require("./events");
const { meshState, markSeen, isSeen } = require("./state/meshState");
const { buildSignedEnvelope } = require("./envelope");

// --- dedupe helpers ---
function fp(env, extra = "") {
  return `${env.type}|${env.from}|${env.ts}|${extra}`;
}
function sendToAllPeers(frame, excludeServerId) {
  for (const [sid, link] of meshState.servers) {
    if (excludeServerId && sid === excludeServerId) continue;
    try { link.send(frame); } catch {}
  }
}

// API:
// Fan-out a public message to all peers (servers route only; clients decrypt).
function broadcastPublicMessage(opaque) {
  const frame = buildSignedEnvelope("MSG_PUBLIC_CHANNEL", "*", {
    ciphertext: opaque.ciphertext,
    sender: opaque.sender,
    sender_pub: opaque.sender_pub,
    content_sig: opaque.content_sig,
  });

  // Immediately raise for local layer too (so their UI can show it instantly)
  bus.emit("network:publicMessage", frame.payload);

  // Send to peers
  sendToAllPeers(frame);
}

// Send a key share for a specific user (route to hosting server or local layer)
function sendPublicKeyShare(toUserId, payload) {
  const hosting = meshState.userLocations.get(toUserId);

  // Emit to local layer if hosted here
  if (hosting === "local") {
    bus.emit("network:publicKeyShare", { user_id: toUserId, ...payload });
    return { routed: "local" };
  }

  // Route to the user's hosting server if known
  if (hosting && meshState.servers.has(hosting)) {
    const frame = buildSignedEnvelope("PUBLIC_CHANNEL_KEY_SHARE", hosting, {
      user_id: toUserId,
      ...payload, // e.g., { wrapped_key_b64url, version, ... }
    });
    try { meshState.servers.get(hosting).send(frame); } catch {}
    return { routed: hosting };
  }

  return { routed: null }; // unknown user
}

// Broadcast public channel membership or metadata adds/updates (opaque to network layer)
function publicChannelAdd(payload) {
  const frame = buildSignedEnvelope("PUBLIC_CHANNEL_ADD", "*", payload);
  sendToAllPeers(frame);
}
function publicChannelUpdated(payload) {
  const frame = buildSignedEnvelope("PUBLIC_CHANNEL_UPDATED", "*", payload);
  sendToAllPeers(frame);
}

// ========== Inbound handlers (called from routes/network.js) ==========

// Receive a public message: emit to local layer and forward to peers once
function handleIncomingPublicMessage(env) {
  const id = fp(env, env.payload?.ciphertext?.slice(0, 16) || "");
  if (isSeen(id)) return;
  markSeen(id);

  // Hand to local layer (no decryption on server)
  bus.emit("network:publicMessage", env.payload);

  // Forward to peers except origin to prevent loops
  sendToAllPeers(env, env.from);
}

// Receive metadata events
function handleIncomingPublicAdd(env) {
  const id = fp(env);
  if (isSeen(id)) return;
  markSeen(id);
  bus.emit("network:publicUpdate", { type: "ADD", payload: env.payload });
  sendToAllPeers(env, env.from);
}

function handleIncomingPublicUpdated(env) {
  const id = fp(env);
  if (isSeen(id)) return;
  markSeen(id);
  bus.emit("network:publicUpdate", { type: "UPDATED", payload: env.payload });
  sendToAllPeers(env, env.from);
}

// Receive a key share: route to local layer if the user is local; otherwise forward
function handleIncomingPublicKeyShare(env) {
  const toUserId = env.payload?.user_id;
  if (!toUserId) return;

  const id = fp(env, toUserId);
  if (isSeen(id)) return;
  markSeen(id);

  const hosting = meshState.userLocations.get(toUserId);
  if (hosting === "local") {
    bus.emit("network:publicKeyShare", env.payload);
    return;
  }
  if (hosting && meshState.servers.has(hosting)) {
    // Forward unchanged (re-signed transport not necessary; we forward the original envelope)
    // If you prefer, you can rewrap: buildSignedEnvelope("PUBLIC_CHANNEL_KEY_SHARE", hosting, env.payload)
    try { meshState.servers.get(hosting).send(env); } catch {}
  }
}

module.exports = {
  // outbound
  broadcastPublicMessage,
  sendPublicKeyShare,
  publicChannelAdd,
  publicChannelUpdated,
  // inbound
  handleIncomingPublicMessage,
  handleIncomingPublicAdd,
  handleIncomingPublicUpdated,
  handleIncomingPublicKeyShare,
};
