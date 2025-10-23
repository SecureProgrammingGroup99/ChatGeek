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
// Periodic HEARTBEAT and liveness monitor for peer links.

const cfg = require("./config");
const { meshState } = require("./state/meshState");
const { buildSignedEnvelope } = require("./envelope");
const { connectPeer } = require("./peerClient");

let hbTimer = null;
let monitorTimer = null;

function sendToAllPeers(frame) {
  for (const [, link] of meshState.servers) {
    try { link.send(frame); } catch {}
  }
}

function startHeartbeats() {
  // 1) Transmit a heartbeat to everyone every HEARTBEAT_MS
  if (!hbTimer) {
    hbTimer = setInterval(() => {
      const frame = buildSignedEnvelope("HEARTBEAT", "*", {});
      sendToAllPeers(frame);
    }, Math.max(1000, cfg.HEARTBEAT_MS || 15000));
  }

  // 2) Monitor liveness and evict/reconnect dead links
  if (!monitorTimer) {
    monitorTimer = setInterval(() => {
      const now = Date.now();
      const deadline = Math.max(3000, cfg.PEER_DEAD_MS || 45000);
      for (const [sid, link] of meshState.servers) {
        const last = meshState.lastSeen.get(sid) || 0;
        if (now - last > deadline) {
          // Mark dead: drop the link and try to reconnect if we know an address
          try { if (link.ws && link.ws.readyState === 1) link.ws.close(1001, "peer dead"); } catch {}
          meshState.servers.delete(sid);
          // Attempt reconnect from our side (if we know their URL)
          const addr = meshState.serverAddrs.get(sid);
          if (addr?.url) connectPeer(addr.url, sid);
          // Optional: log once
          // console.warn("[SOCP] peer dead -> evicted:", sid);
        }
      }
    }, 2000); // check every 2s
  }
}

function stopHeartbeats() {
  if (hbTimer) clearInterval(hbTimer), hbTimer = null;
  if (monitorTimer) clearInterval(monitorTimer), monitorTimer = null;
}

module.exports = { startHeartbeats, stopHeartbeats };
