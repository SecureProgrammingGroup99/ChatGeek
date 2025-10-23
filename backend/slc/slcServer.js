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
const https = require("https");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const { verifyAndConsume, initReplayStore } = require("./slcReplay");
const envelopeSchema = require("./schema/slcEnvelope.schema.json");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateEnvelope = ajv.compile(envelopeSchema);

async function startSlcServer(app) {
  if (process.env.SLC_ENABLED !== "true") {
    console.log("[SLC] disabled (set SLC_ENABLED=true to enable)");
    return null;
  }

  await initReplayStore();

  const SLC_BIND = process.env.SLC_BIND || "127.0.0.1:9443";
  const SLC_CA = process.env.SLC_CA || "secure-keystore/localCA.crt";
  const SLC_CERT = process.env.SLC_CERT || "secure-keystore/router.crt";
  const SLC_KEY = process.env.SLC_KEY || "secure-keystore/router.key";
  const SLC_MAX_BODY = parseInt(process.env.SLC_MAX_BODY || "65536", 10);
  const SLC_ALLOWED = (process.env.SLC_ALLOWED_CLIENTS || "ui.local").split(",");

  const [host, portStr] = SLC_BIND.split(":");
  const port = parseInt(portStr, 10);

  const options = {
    key: fs.readFileSync(path.resolve(SLC_KEY)),
    cert: fs.readFileSync(path.resolve(SLC_CERT)),
    ca: fs.readFileSync(path.resolve(SLC_CA)),
    requestCert: true,
    rejectUnauthorized: true,
    minVersion: "TLSv1.3",
  };

  const server = https.createServer(options, (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("ok");
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocket.Server({ server, path: "/slc" });

  const broadcast = (obj) => {
    const s = JSON.stringify(obj);
    wss.clients.forEach((c) => {
      if (c.readyState === WebSocket.OPEN) {
        try {
          c.send(s);
        } catch (_) {}
      }
    });
  };

  wss.on("connection", (ws, req) => {
    const peer = req.socket.getPeerCertificate(true);
    const authorized = req.client && req.client.authorized === true;

    if (!authorized || !peer || !peer.subject || !peer.subject.CN) {
      try { ws.close(1008, "unauthorized"); } catch (_) {}
      return;
    }

    const clientCN = peer.subject.CN;
    if (!SLC_ALLOWED.includes(clientCN)) {
      try { ws.close(1008, "forbidden"); } catch (_) {}
      return;
    }

    console.log("[SLC] client connected:", clientCN);

    ws.on("message", async (buf) => {
      try {
        if (!buf) return;
        const text = buf.toString();
        if (text.length > SLC_MAX_BODY) {
          ws.send(JSON.stringify({ error: "payload_too_large" }));
          ws.close(1009, "too_big");
          return;
        }

        const msg = JSON.parse(text);
        if (!validateEnvelope(msg)) {
          ws.send(JSON.stringify({ error: "invalid_envelope", details: validateEnvelope.errors }));
          return;
        }

        const ok = await verifyAndConsume(clientCN, msg.nonce, msg.counter);
        if (!ok) {
          ws.send(JSON.stringify({ error: "replay_or_counter_error" }));
          return;
        }

        const op = String(msg.op || "").toUpperCase();
        const body = msg.body || {};
        const net = app.locals && app.locals.network;
        const files = app.locals && app.locals.fileService;

        switch (op) {
          case "SEND_CHAT": {
            const toUserId = body.to || body.toUserId || body.recipient || body.payload?.to;
            const chatId = body.chatId || body.payload?.chatId || body.payload?.chat_id;

            if (!toUserId) {
              ws.send(JSON.stringify({ ok: false, error: "missing_destination" }));
              break;
            }

            const payloadForNetwork = body.ciphertext
              ? { ciphertext: body.ciphertext, signature: body.signature || body.content_sig || body.sig }
              : body.content
              ? { content: body.content }
              : body.payload || {};

            try {
              const result = await net.sendServerDeliver(toUserId, payloadForNetwork, { chatId });
              ws.send(JSON.stringify({ ok: true, result }));
            } catch (err) {
              ws.send(JSON.stringify({ ok: false, error: err.message || "deliver_failed" }));
            }
            break;
          }

          case "FILE_START": {
            const b = body || {};
            const toUserId = b.to || b.toUserId || b.payload?.to;
            const chatId = b.chatId || b.payload?.chatId;
            const file_id = b.file_id || b.payload?.file_id;
            const name = b.name || b.payload?.name;
            const size = b.size || b.payload?.size;
            const totalChunks = b.totalChunks ?? b.payload?.totalChunks;
            if (!toUserId || !chatId || !file_id || !name || !size || totalChunks == null) {
              ws.send(JSON.stringify({ ok: false, error: "missing_fields" }));
              break;
            }
            await files.sendFileStart(toUserId, { chatId, file_id, name, size, totalChunks });
            ws.send(JSON.stringify({ ok: true }));
            break;
          }

          case "FILE_CHUNK": {
            const b = body || {};
            const toUserId = b.to || b.toUserId || b.payload?.to;
            const chatId = b.chatId || b.payload?.chatId;
            const file_id = b.file_id || b.payload?.file_id;
            const index = b.index ?? b.seq ?? b.payload?.index;
            const ciphertext = b.ciphertext || b.chunk || b.payload?.ciphertext;
            if (!toUserId || !chatId || !file_id || index == null || !ciphertext) {
              ws.send(JSON.stringify({ ok: false, error: "missing_fields" }));
              break;
            }
            await files.sendFileChunk(toUserId, { chatId, file_id, index, ciphertext });
            ws.send(JSON.stringify({ ok: true }));
            break;
          }

          case "FILE_END": {
            const b = body || {};
            const toUserId = b.to || b.toUserId || b.payload?.to;
            const chatId = b.chatId || b.payload?.chatId;
            const file_id = b.file_id || b.payload?.file_id;
            const sha256 = b.sha256 || b.checksum || b.payload?.sha256;
            if (!toUserId || !chatId || !file_id || !sha256) {
              ws.send(JSON.stringify({ ok: false, error: "missing_fields" }));
              break;
            }
            await files.sendFileEnd(toUserId, { chatId, file_id, sha256 });
            ws.send(JSON.stringify({ ok: true }));
            break;
          }

          default:
            ws.send(JSON.stringify({ ok: false, error: "unknown_op" }));
        }
      } catch (e) {
        ws.send(JSON.stringify({ ok: false, error: "server_error", message: e.message }));
      }
    });
  });

  if (app.locals?.network?.on) {
    const net = app.locals.network;
    net.on("userDeliver", (p) => broadcast({ event: "dm", payload: p }));
    net.on("presenceUpdate", (p) => broadcast({ event: "presence", payload: p }));
    net.on("publicMessage", (p) => broadcast({ event: "publicMessage", payload: p }));
    net.on("ack", (p) => broadcast({ event: "ack", payload: p }));
    net.on("error", (p) => broadcast({ event: "error", payload: p }));
  }

  if (app.locals?.fileService?.on) {
    const f = app.locals.fileService;
    f.on("fileStart", (p) => broadcast({ event: "fileStart", payload: p }));
    f.on("fileChunk", (p) => broadcast({ event: "fileChunk", payload: p }));
    f.on("fileEnd", (p) => broadcast({ event: "fileEnd", payload: p }));
  }

  server.listen(port, host, () => console.log(`[SLC] listening on wss://${host}:${port}/slc`));
  return { server, wss };
}

module.exports = { startSlcServer };
