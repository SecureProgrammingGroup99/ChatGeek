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
// Works with or without the main app running.
// 1) Try to connect to MESH_WS_PORT
// 2) If ECONNREFUSED, start an ephemeral WS (same handlers) and test against it.

const WebSocket = require("ws");
const http = require("http");
require("dotenv").config();

const { attach } = require("../network/wsServer");

const PORT = parseInt(process.env.MESH_WS_PORT || "7081", 10);
const PEER_ID   = require("crypto").randomUUID();

function sendTestFrames(ws, portLabel) {
  console.log(`connected to ${portLabel}; sending SERVER_HELLO_LINK`);
  ws.send(JSON.stringify({
    type: "SERVER_HELLO_LINK",
    from: PEER_ID,
    to: "server_local",
    ts: Date.now(),
    payload: { host: "127.0.0.1", port: portLabel, pubkey: "dummy" },
  }));
  setTimeout(() => {
    console.log("sending HEARTBEAT");
    ws.send(JSON.stringify({
      type: "HEARTBEAT",
      from: PEER_ID,
      to: "*",
      ts: Date.now(),
      payload: { ping: 1 },
    }));
  }, 150);
}

function connectTo(port, label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.once("open", () => { sendTestFrames(ws, label); resolve(ws); });
    ws.once("error", (err) => reject(err));
    ws.on("message", (m) => console.log("<<", m.toString()));
  });
}

async function main() {
  try {
    // Try the configured port first (main app).
    await connectTo(PORT, `:${PORT}`);
    setTimeout(() => process.exit(0), 400);
  } catch (err) {
    if (err && (err.code === "ECONNREFUSED" || err.message.includes("ECONNREFUSED"))) {
      console.log(`[smoke] :${PORT} not listening; starting ephemeral WS`);
      // Start ephemeral WS server using your real handlers
      const server = http.createServer();
      const wss = new (require("ws").Server)({ server });
      attach(wss);
      server.listen(0, async () => {
        const ephPort = server.address().port;
        console.log(`[smoke] ephemeral WS listening on :${ephPort}`);
        try {
          await connectTo(ephPort, `:${ephPort}`);
          // Give the frames time to flow, then exit and the ephemeral server will die with the process
          setTimeout(() => process.exit(0), 400);
        } catch (e) {
          console.error("[smoke] failed to connect to ephemeral WS:", e.message);
          process.exit(2);
        }
      });
    } else {
      console.error("[smoke] unexpected error:", err && err.message);
      process.exit(2);
    }
  }
}

main();
