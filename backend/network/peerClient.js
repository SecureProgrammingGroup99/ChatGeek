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
const WebSocket = require('ws');
const cfg = require('./config');
const { meshState } = require('./state/meshState');
const { getSelfInfo } = require('./self');
const { buildSignedEnvelope } = require('./envelope');

function makeLink(ws, url) {
  const link = { url, send: (frame) => ws.send(JSON.stringify(frame)) };
  return link;
}

function sendHelloLink(ws) {
  const self = getSelfInfo();
  ws.send(JSON.stringify(buildSignedEnvelope(
    'SERVER_HELLO_LINK',
    '*',
    { url: self.url, pubkey_b64url: self.pubkey_b64url }
  )));
}

/**
 * Connect to a peer server by URL. If you know its id, pass it to register immediately.
 */
function connectPeer(url, knownServerId) {
  if (!url) return;
  for (const [, link] of meshState.servers) if (link && link.url === url) return;

  const ws = new WebSocket(url);
  const link = makeLink(ws, url);

  ws.on('open', () => {
    if (knownServerId) meshState.servers.set(knownServerId, link);
    sendHelloLink(ws);
  });

  ws.on('close', () => {
    for (const [id, l] of meshState.servers) if (l === link) meshState.servers.delete(id);
  });

  ws.on('error', () => { /* quiet */ });
  return ws;
}

function bootstrapIntroducers() {
  const self = getSelfInfo();
  if (!Array.isArray(cfg.INTRODUCERS) || cfg.INTRODUCERS.length === 0) {
    console.log('[SOCP] No introducers configured; skipping join');
    return;
  }
  for (const it of cfg.INTRODUCERS) {
    if (!it?.url) continue;
    const ws = new WebSocket(it.url);
    ws.on('open', () => {
      ws.send(JSON.stringify(buildSignedEnvelope(
        'SERVER_HELLO_JOIN',
        it.url,
        { url: self.url, pubkey_b64url: self.pubkey_b64url }
      )));
    });
  }
}

function announceSelf() {
  const self = getSelfInfo();
  const frame = buildSignedEnvelope(
    'SERVER_ANNOUNCE',
    '*',
    { server_id: self.server_id, url: self.url, pubkey_b64url: self.pubkey_b64url }
  );
  for (const [, link] of meshState.servers) {
    try { link.send(frame); } catch {}
  }
}

module.exports = { connectPeer, bootstrapIntroducers, announceSelf };
