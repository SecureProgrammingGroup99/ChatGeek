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
const WebSocket = require("ws");
const port = 9999;
const wss = new WebSocket.Server({ port }, () => {
  console.log(`[dummy-peer] listening on :${port}`);
});
wss.on("connection", (ws) => {
  console.log("[dummy-peer] connection from ChatGeek");
  ws.on("message", (m) => console.log("[dummy-peer] <<", m.toString()));
  // Send a heartbeat every 5s so you can see traffic both ways
  const t = setInterval(
    () =>
      ws.send(
        JSON.stringify({
          type: "HEARTBEAT",
          from: "dummy-peer",
          to: "*",
          ts: Date.now(),
          payload: {},
        })
      ),
    5001
  );
  ws.on("close", () => clearInterval(t));
});
