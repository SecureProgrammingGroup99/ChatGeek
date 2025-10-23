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
// Server-only WS with handshake, verification, validation, liveness & limits.
const http = require("http");
const WebSocket = require("ws");
const meshCfg = require("./config");
const { handlers } = require("../routes/network");
const { verifyIncoming } = require("./envelope");
const { sendError } = require("./ack");
const { ERR } = require("./codes");
const { meshState } = require("./state/meshState");
const { validateEnvelope, validateByType } = require("./validators");
const bus = require("./events");

// import inbound handler
const { handleInboundEnvelope } = require("./inbound");

const FIRST_FRAME_TYPES = new Set(["SERVER_HELLO_JOIN", "SERVER_HELLO_LINK"]);
const ALLOWED_TYPES = new Set(Object.keys(handlers));

function looksLikeEnvelope(x) {
  return (
    x &&
    typeof x === "object" &&
    typeof x.type === "string" &&
    x.payload &&
    typeof x.payload === "object" &&
    typeof x.ts === "number"
  );
}

function attach(wss) {
  wss.on("connection", (ws, req) => {
    let handshakeDone = false;

    // Per-connection link and simple token-bucket rate limiter
    const link = {
      send: (frame) => ws.send(JSON.stringify(frame)),
      ws,
      url: undefined,
      pubkey_b64url: undefined,
    };
    ws._socpLink = link;

    const rate = { tokens: 50, cap: 50, refillPerSec: 25, last: Date.now() };
    function takeToken() {
      const now = Date.now();
      const dt = (now - rate.last) / 1000;
      rate.tokens = Math.min(rate.cap, rate.tokens + dt * rate.refillPerSec);
      rate.last = now;
      if (rate.tokens < 1) return false;
      rate.tokens -= 1;
      return true;
    }

    ws.on("close", () => {
      for (const [sid, l] of meshState.servers)
        if (l === link) meshState.servers.delete(sid);
    });

    ws.on("message", async (buf) => {
      if (buf.length > meshCfg.MAX_WS_PAYLOAD_BYTES) {
        try { ws.close(1009, "payload too large"); } catch {}
        return;
      }

      let env;
      try { env = JSON.parse(buf.toString("utf8")); } catch { return; }
      if (!looksLikeEnvelope(env)) return;

      const ctx = { link, req };

      if (!takeToken()) {
        sendError(ctx, env, ERR.RATE_LIMIT, "too many frames");
        return;
      }

      if (!ALLOWED_TYPES.has(env.type)) {
        sendError(ctx, env, ERR.UNKNOWN_TYPE, "Not a server message type");
        return;
      }

      if (!handshakeDone) {
        if (!FIRST_FRAME_TYPES.has(env.type)) {
          try { ws.close(1008, "Expected server hello"); } catch {}
          return;
        }
        handshakeDone = true;
      }

      if (env.from) meshState.lastSeen.set(env.from, Date.now());

      const v = verifyIncoming(env);
      if (!v.ok) {
        sendError(ctx, env, v.reason, "Verification failed");
        return;
      }

      const ve = validateEnvelope(env);
      if (!ve.ok) {
        sendError(
          ctx,
          env,
          ve.reason === "BAD_TIMESTAMP" ? ERR.BAD_TIMESTAMP : ERR.BAD_PAYLOAD,
          "Envelope invalid"
        );
        return;
      }

      const vp = validateByType(env.type, env.payload);
      if (!vp.ok) {
        sendError(ctx, env, ERR.BAD_PAYLOAD, vp.reason || "Payload invalid");
        return;
      }

      // NEW: Try to handle inbound messages first
      const inboundResult = handleInboundEnvelope(bus, {
        op: env.type,
        from: env.from,
        to: env.to,
        ts: env.ts,
        body: env.payload,
      });

      if (!inboundResult.ok && inboundResult.error !== "unknown_op") {
        console.warn("[SOCP][Inbound] Drop:", inboundResult.error);
      }

      // Keep legacy handler if still needed (Finlays)
      const fn = handlers[env.type];
      if (typeof fn === "function") {
        try { await fn(env, ctx); }
        catch (e) { console.warn("[SOCP] Handler error:", e?.message); }
      }
    });
  });
}

function startMeshWebSocket() {
  const server = http.createServer();
  const wss = new WebSocket.Server({
    server,
    maxPayload: meshCfg.MAX_WS_PAYLOAD_BYTES,
  });
  attach(wss);

  server.on("error", (err) => {
    console.error("[SOCP] WS server error:", err.message);
  });

  server.listen(meshCfg.MESH_WS_PORT, () => {
    console.log(`[SOCP] Server-only WS listening on :${meshCfg.MESH_WS_PORT}`);
  });

  return { server, wss };
}

module.exports = { startMeshWebSocket, attach };
