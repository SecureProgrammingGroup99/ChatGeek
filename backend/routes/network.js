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
// Server-only SOCP handlers (handshake, discovery, presence skeleton, delivery skeleton).
const cfg = require('../network/config');
const { meshState } = require('../network/state/meshState');
const { connectPeer, announceSelf } = require('../network/peerClient');
const { rememberPeer } = require('../network/envelope');
const {
  handleRemoteAdvertise,
  handleRemoteRemove,
} = require('../network/presence');
const { handleIncomingServerDeliver } = require('../network/delivery');
const {
  handleIncomingPublicMessage,
  handleIncomingPublicAdd,
  handleIncomingPublicUpdated,
  handleIncomingPublicKeyShare,
} = require('../network/public');
const {
  handleIncomingFileStart,
  handleIncomingFileChunk,
  handleIncomingFileEnd,
} = require('../network/files');
const bus = require('../network/events');
const { ERR } = require('../network/codes');

function onServerHelloJoin(env, ctx) {
  // Only meaningful if THIS node is an introducer; otherwise ignore politely.
  // (Full introducer logic comes later if you need it.)
  console.log('[SOCP] SERVER_HELLO_JOIN (ignored; not an introducer)', env.payload);
}

function onServerWelcome(env, ctx) {
  // Received from an introducer: assignedId + peers[]
  const { assigned_id, peers } = env.payload || {};
  if (assigned_id && assigned_id !== cfg.SERVER_ID) {
    console.log('[SOCP] Welcome reassigned id:', assigned_id, '(was', cfg.SERVER_ID, ')');
    // We won't mutate env vars; store runtime self id for now:
    meshState.selfId = assigned_id;
  } else {
    meshState.selfId = cfg.SERVER_ID;
  }
  if (Array.isArray(peers)) {
    for (const p of peers) {
      if (!p?.server_id || !p?.url) continue;
      meshState.serverAddrs.set(p.server_id, { url: p.url, pubkey_b64url: p.pubkey_b64url });
      if (!meshState.servers.has(p.server_id)) connectPeer(p.url, p.server_id);
    }
  }
  // Announce ourselves so peers learn us too
  announceSelf();
}

function onServerAnnounce(env, ctx) {
  const { server_id, url, pubkey_b64url } = env.payload || {};
  if (!server_id || !url) return;
  rememberPeer(server_id, { url, pubkey_b64url }); // <-- store key+url
  if (!meshState.servers.has(server_id)) connectPeer(url, server_id);
}

function onServerHelloLink(env, ctx) {
  const fromId = env.from;
  if (!fromId) return;
  // Register link
  const link = ctx.link;
  link.url = (env.payload && env.payload.url) || link.url;
  if (env.payload && env.payload.pubkey_b64url) link.pubkey_b64url = env.payload.pubkey_b64url;
  meshState.servers.set(fromId, link);
  // Also remember advertised key/url so later frames can be verified
  rememberPeer(fromId, env.payload);
  console.log('[SOCP] Linked server:', fromId, 'at', link.url || '(unknown url)');
}

function onUserAdvertise(env, ctx)  { handleRemoteAdvertise(env); }
function onUserRemove(env, ctx)     { handleRemoteRemove(env); }

function onServerDeliver(env, ctx) {
  handleIncomingServerDeliver(env, ctx);
}

function onMsgPublicChannel(env, ctx)     { handleIncomingPublicMessage(env); }
function onPublicChannelAdd(env, ctx)     { handleIncomingPublicAdd(env); }
function onPublicChannelUpdated(env, ctx) { handleIncomingPublicUpdated(env); }
function onPublicChannelKeyShare(env,ctx) { handleIncomingPublicKeyShare(env); }

function onFileStart(env, ctx) { handleIncomingFileStart(env); }
function onFileChunk(env, ctx) { handleIncomingFileChunk(env); }
function onFileEnd(env, ctx)   { handleIncomingFileEnd(env); }

function onHeartbeat(env, ctx) {
  const fromId = env.from;
  if (fromId) meshState.lastSeen.set(fromId, Date.now());
}
function onAck(env, ctx)   { bus.emit("network:ack",   env.payload); }
function onError(env, ctx) { bus.emit("network:error", env.payload); }

const handlers = {
  // serverserver bootstraps
  SERVER_HELLO_JOIN: onServerHelloJoin,
  SERVER_WELCOME: onServerWelcome,
  SERVER_ANNOUNCE: onServerAnnounce,
  SERVER_HELLO_LINK: onServerHelloLink,

  // presence gossip (serverserver)
  USER_ADVERTISE: onUserAdvertise,
  USER_REMOVE: onUserRemove,

  // delivery (serverserver only)
  SERVER_DELIVER: onServerDeliver,

  // public channel (serverserver)
  MSG_PUBLIC_CHANNEL: onMsgPublicChannel,
  PUBLIC_CHANNEL_ADD: onPublicChannelAdd,
  PUBLIC_CHANNEL_UPDATED: onPublicChannelUpdated,
  PUBLIC_CHANNEL_KEY_SHARE: onPublicChannelKeyShare,

  // file relay
  FILE_START: onFileStart,
  FILE_CHUNK: onFileChunk,
  FILE_END: onFileEnd,

  // plumbing
  HEARTBEAT: onHeartbeat,
  ACK: onAck,
  ERROR: onError,
};

module.exports = { handlers };
