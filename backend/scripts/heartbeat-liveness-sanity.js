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
// Connects as a dummy peer, sends SERVER_HELLO_LINK, then idles.
// Expect the server to evict and close the connection after PEER_DEAD_MS.

require("dotenv").config();
const WebSocket = require("ws");

const PORT = parseInt(process.env.MESH_WS_PORT || "7081", 10);
const URL  = `ws://127.0.0.1:${PORT}`;
const PEER_ID = require("crypto").randomUUID();
const MAX_WAIT_MS = parseInt(process.env.HB_SANITY_TIMEOUT_MS || "30000", 10); // script exit guard

function send(ws, frame) {
  ws.send(JSON.stringify(frame));
}
const now = () => Date.now();

console.log(`[hb-sanity] connecting to ${URL} as ${PEER_ID} `);
const ws = new WebSocket(URL);

ws.on("open", () => {
  console.log("[hb-sanity] connected; sending SERVER_HELLO_LINK (no heartbeats will follow) ");
  send(ws, {
    type: "SERVER_HELLO_LINK",
    from: PEER_ID,
    to: "*",
    ts: now(),
    // Note: pubkey is only needed for signature verification of later frames.
    // HELLO_LINK itself can be unsigned during bootstrap, so 'dummy' is fine here.
    payload: { url: "ws://dummy-peer", pubkey_b64url: "dummy" },
  });

  // Safety exit if nothing happens
  setTimeout(() => {
    console.error("[hb-sanity] timed out waiting for server to evict/close");
    process.exit(1);
  }, MAX_WAIT_MS);
});

ws.on("close", (code, reason) => {
  console.log(`[hb-sanity] connection closed by server (evicted). code=${code} reason=${reason.toString()}`);
  process.exit(0);
});

ws.on("error", (e) => {
  console.error("[hb-sanity] ws error:", e.message);
  process.exit(2);
});
