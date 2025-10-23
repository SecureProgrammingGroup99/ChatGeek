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
// Serverserver file relay shells.
// Outbound API (local layer calls us):
//   sendFileStart(toUserId, { file_id, name, size, sha256, mode? })
//   sendFileChunk(toUserId, { file_id, index, ciphertext })
//   sendFileEnd(toUserId, { file_id })
// Inbound handlers (routes/network.js calls us):
//   handleIncomingFileStart/Chunk/End(env)
// We do loop suppression + routing; local layer handles storage/UI.

const bus = require("./events");
const { meshState, markSeen, isSeen } = require("./state/meshState");
const { buildSignedEnvelope } = require("./envelope");

// ---- helpers ----
function fp(type, from, fileId, index = "") {
  return `${type}|${from}|${fileId}|${index}`;
}
function routeToHosting(toUserId, frameType, payload) {
  const hosting = meshState.userLocations.get(toUserId);
  if (hosting === "local") {
    // hand-off to local layer
    bus.emit(
      frameType === "FILE_START" ? "network:fileStart" :
      frameType === "FILE_CHUNK" ? "network:fileChunk" :
      "network:fileEnd",
      payload
    );
    return { routed: "local" };
  }
  if (hosting && meshState.servers.has(hosting)) {
    const env = buildSignedEnvelope(frameType, hosting, payload);
    try { meshState.servers.get(hosting).send(env); } catch {}
    return { routed: hosting };
  }
  return { routed: null }; // unknown user
}

// API:
function sendFileStart(toUserId, meta) {
  // meta: { file_id, name, size, sha256, mode? }
  return routeToHosting(toUserId, "FILE_START", { to_user: toUserId, ...meta });
}
function sendFileChunk(toUserId, chunk) {
  // chunk: { file_id, index, ciphertext }
  return routeToHosting(toUserId, "FILE_CHUNK", { to_user: toUserId, ...chunk });
}
function sendFileEnd(toUserId, tail) {
  // tail: { file_id }
  return routeToHosting(toUserId, "FILE_END", { to_user: toUserId, ...tail });
}

// ---- Inbound handlers (called from routes/network.js) ----
function handleIncomingFileStart(env) {
  const p = env.payload || {};
  if (!p.file_id || !p.to_user) return;
  const id = fp("FILE_START", env.from, p.file_id);
  if (isSeen(id)) return; markSeen(id);
  const hosting = meshState.userLocations.get(p.to_user);
  if (hosting === "local") {
    bus.emit("network:fileStart", p);
    return;
  }
  if (hosting && meshState.servers.has(hosting)) {
    const fwd = buildSignedEnvelope("FILE_START", hosting, p);
    try { meshState.servers.get(hosting).send(fwd); } catch {}
  }
}

function handleIncomingFileChunk(env) {
  const p = env.payload || {};
  if (!p.file_id || !p.to_user || typeof p.index !== "number") return;
  const id = fp("FILE_CHUNK", env.from, p.file_id, p.index);
  if (isSeen(id)) return; markSeen(id);
  const hosting = meshState.userLocations.get(p.to_user);
  if (hosting === "local") {
    bus.emit("network:fileChunk", p);
    return;
  }
  if (hosting && meshState.servers.has(hosting)) {
    const fwd = buildSignedEnvelope("FILE_CHUNK", hosting, p);
    try { meshState.servers.get(hosting).send(fwd); } catch {}
  }
}

function handleIncomingFileEnd(env) {
  const p = env.payload || {};
  if (!p.file_id || !p.to_user) return;
  const id = fp("FILE_END", env.from, p.file_id);
  if (isSeen(id)) return; markSeen(id);
  const hosting = meshState.userLocations.get(p.to_user);
  if (hosting === "local") {
    bus.emit("network:fileEnd", p);
    return;
  }
  if (hosting && meshState.servers.has(hosting)) {
    const fwd = buildSignedEnvelope("FILE_END", hosting, p);
    try { meshState.servers.get(hosting).send(fwd); } catch {}
  }
}

module.exports = {
  // outbound
  sendFileStart,
  sendFileChunk,
  sendFileEnd,
  // inbound
  handleIncomingFileStart,
  handleIncomingFileChunk,
  handleIncomingFileEnd,
};
