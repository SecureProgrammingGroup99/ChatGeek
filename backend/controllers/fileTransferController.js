// backend/controllers/fileTransferController.js
const fs = require("fs");
const path = require("path");
const base64url = require("base64url");
const FileTransfer = require("../models/fileTransferModel");
const { verifyTransportSignature } = require("../utils/cryptoHelpers");

const TRANSFERS_BASE = path.join(__dirname, "..", "..", "tmp", "transfers");
if (!fs.existsSync(TRANSFERS_BASE))
  fs.mkdirSync(TRANSFERS_BASE, { recursive: true });

// helper to send error frame back to a socket
function sendErrorSocket(ws, from, to, code, detail) {
  const err = {
    type: "ERROR",
    from,
    to,
    ts: Date.now(),
    payload: { code, detail },
    sig: "",
  };
  try {
    ws.send(JSON.stringify(err));
  } catch (e) {
    /* ignore */
  }
}

// Create/validate manifest
async function handleFileStart(serverContext, ws, frame) {
  // frame: { type, from, to, ts, payload, sig }
  const { payload, from, to } = frame;
  // verify sig if present
  if (frame.sig) {
    const ok = await verifyTransportSignature(frame.from, payload, frame.sig);
    if (!ok) {
      return sendErrorSocket(
        ws,
        serverContext.id || "server",
        from,
        "INVALID_SIG",
        "Invalid transport signature"
      );
    }
  }

  const { file_id, name, size, sha256, mode, group_id } = payload || {};
  if (!file_id || !name || !size || !sha256) {
    return sendErrorSocket(
      ws,
      serverContext.id || "server",
      from,
      "UNKNOWN_TYPE",
      "Missing manifest fields"
    );
  }

  // uniqueness check
  const existing = await FileTransfer.findOne({ file_id }).exec();
  if (existing && existing.status === "in_progress") {
    return sendErrorSocket(
      ws,
      serverContext.id || "server",
      from,
      "NAME_IN_USE",
      "file_id already in progress"
    );
  }

  // create record
  const chunk_size = payload.chunk_size || 64 * 1024; // default 64KiB
  const expected_chunks = Math.ceil(size / chunk_size);
  const temp_dir = path.join(TRANSFERS_BASE, file_id);
  fs.mkdirSync(temp_dir, { recursive: true });

  const rec = new FileTransfer({
    file_id,
    from,
    to,
    mode: mode || "dm",
    group_id: group_id || null,
    name,
    size,
    sha256,
    expected_chunks,
    chunk_size,
    temp_dir,
    status: "in_progress",
    received: {},
  });

  await rec.save();

  // forward to remote server if needed
  const location =
    serverContext.user_locations && serverContext.user_locations[to];
  if (
    location &&
    location.startsWith("server_") &&
    location !== serverContext.id
  ) {
    // forward with serverContext helper
    serverContext.forwardPeerDeliver(location, {
      type: "PEER_DELIVER",
      from: serverContext.id,
      to: location,
      ts: Date.now(),
      payload: {
        user_id: to,
        msg_type: "FILE_START",
        manifest: payload,
        sender: from,
      },
      sig: "", // server should sign payload. Need to implement signing too if needed.
    });
  } else {
    // ack receipt to sender
    ws.send(
      JSON.stringify({
        type: "ACK",
        from: serverContext.id,
        to: from,
        ts: Date.now(),
        payload: { msg_ref: file_id },
        sig: "",
      })
    );
  }
}

// Handle chunk
async function handleFileChunk(serverContext, ws, frame) {
  const { payload, from } = frame;
  if (!payload)
    return sendErrorSocket(
      ws,
      serverContext.id,
      from,
      "UNKNOWN_TYPE",
      "No payload"
    );

  if (frame.sig) {
    const ok = await verifyTransportSignature(frame.from, payload, frame.sig);
    if (!ok)
      return sendErrorSocket(
        ws,
        serverContext.id,
        from,
        "INVALID_SIG",
        "Invalid transport signature"
      );
  }

  const { file_id, index, ciphertext, iv, tag, wrapped_key } = payload;
  const rec = await FileTransfer.findOne({ file_id }).exec();
  if (!rec || rec.status !== "in_progress") {
    return sendErrorSocket(
      ws,
      serverContext.id,
      from,
      "USER_NOT_FOUND",
      "transfer not found or not in progress"
    );
  }

  if (typeof index !== "number" || index < 0 || index >= rec.expected_chunks) {
    return sendErrorSocket(
      ws,
      serverContext.id,
      from,
      "UNKNOWN_TYPE",
      "Invalid chunk index"
    );
  }

  // dedupe
  if (rec.received && rec.received.get(String(index))) {
    // duplicate: ignore silently or optionally send ACK
    return;
  }

  // validate iv/tag lengths
  try {
    const ivBuf = base64url.toBuffer(iv);
    const tagBuf = base64url.toBuffer(tag);
    if (ivBuf.length !== 12 || tagBuf.length !== 16) {
      return sendErrorSocket(
        ws,
        serverContext.id,
        from,
        "BAD_KEY",
        "Invalid iv/tag length"
      );
    }
  } catch (e) {
    return sendErrorSocket(
      ws,
      serverContext.id,
      from,
      "BAD_KEY",
      "Invalid base64url in iv/tag"
    );
  }

  // store ciphertext to disk (save as <temp_dir>/<index>.bin)
  const chunkPath = path.join(rec.temp_dir, String(index));
  const ciphertextBuf = base64url.toBuffer(ciphertext);
  fs.writeFileSync(chunkPath, ciphertextBuf);

  // mark received
  rec.received.set(String(index), true);
  rec.last_activity = new Date();
  await rec.save();

  // forward if recipient remote
  const location =
    serverContext.user_locations && serverContext.user_locations[rec.to];
  if (
    location &&
    location.startsWith("server_") &&
    location !== serverContext.id
  ) {
    serverContext.forwardPeerDeliver(location, {
      type: "PEER_DELIVER",
      from: serverContext.id,
      to: location,
      ts: Date.now(),
      payload: {
        user_id: rec.to,
        msg_type: "FILE_CHUNK",
        chunk: payload,
        sender: rec.from,
      },
      sig: "",
    });
  } else {
    // ack sender
    ws.send(
      JSON.stringify({
        type: "ACK",
        from: serverContext.id,
        to: from,
        ts: Date.now(),
        payload: { msg_ref: `${file_id}:${index}` },
        sig: "",
      })
    );
  }
}

async function handleFileEnd(serverContext, ws, frame) {
  const { payload, from } = frame;
  if (!payload || !payload.file_id)
    return sendErrorSocket(
      ws,
      serverContext.id,
      from,
      "UNKNOWN_TYPE",
      "Missing file_id"
    );

  const rec = await FileTransfer.findOne({ file_id: payload.file_id }).exec();
  if (!rec)
    return sendErrorSocket(
      ws,
      serverContext.id,
      from,
      "USER_NOT_FOUND",
      "file not found"
    );

  // check completeness
  const receivedCount = rec.received ? rec.received.size : 0;
  if (receivedCount !== rec.expected_chunks) {
    return sendErrorSocket(
      ws,
      serverContext.id,
      from,
      "TIMEOUT",
      "Missing chunks"
    );
  }

  rec.status = "complete";
  rec.last_activity = new Date();
  await rec.save();

  // forward FILE_END if remote
  const location =
    serverContext.user_locations && serverContext.user_locations[rec.to];
  if (
    location &&
    location.startsWith("server_") &&
    location !== serverContext.id
  ) {
    serverContext.forwardPeerDeliver(location, {
      type: "PEER_DELIVER",
      from: serverContext.id,
      to: location,
      ts: Date.now(),
      payload: {
        user_id: rec.to,
        msg_type: "FILE_END",
        file_id: rec.file_id,
        sender: rec.from,
      },
      sig: "",
    });
  } else {
    // notify recipient client (should implement sending a USER_DELIVER with metadata so client knows to reconstruct)
    // Implementation depends on socket mapping: e.g., find socket for rec.to and send JSON
  }

  // ack sender
  ws.send(
    JSON.stringify({
      type: "ACK",
      from: serverContext.id,
      to: from,
      ts: Date.now(),
      payload: { msg_ref: rec.file_id },
      sig: "",
    })
  );
}

module.exports = {
  handleFileStart,
  handleFileChunk,
  handleFileEnd,
};
