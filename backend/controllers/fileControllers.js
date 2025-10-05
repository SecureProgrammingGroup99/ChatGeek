// backend/controllers/fileControllers.js
const asyncHandler = require("express-async-handler");

// in-memory store for simulated uploads
const activeFiles = new Map(); // file_id -> { meta, chunks }

const handleFileStart = asyncHandler(async (req, res) => {
  const { type, from, to, ts, payload } = req.body || {};

  if (type !== "FILE_START" || !payload?.file_id) {
    return res.status(400).json({ error: "Invalid FILE_START envelope" });
  }

  activeFiles.set(payload.file_id, { meta: payload, chunks: [] });

  console.log("[SOCP][FILE_START]", JSON.stringify(payload, null, 2));

  // Simulate server confirmation (optional USER_DELIVER for manifest ACK)
  const ack = {
    type: "ACK",
    from: "server_1",
    to,
    ts: Date.now(),
    payload: { msg_ref: payload.file_id },
    sig: "<server_signature_placeholder>",
  };

  return res.status(200).json(ack);
});

const handleFileChunk = asyncHandler(async (req, res) => {
  const { type, from, to, ts, payload } = req.body || {};

  if (type !== "FILE_CHUNK" || !payload?.file_id) {
    return res.status(400).json({ error: "Invalid FILE_CHUNK envelope" });
  }

  const entry = activeFiles.get(payload.file_id);
  if (!entry) {
    console.warn(
      "[SOCP][WARN] Received chunk for unknown file_id",
      payload.file_id
    );
    return res.status(404).json({ error: "FILE_NOT_FOUND" });
  }

  // Save ciphertext only (no decryption at server per SOCP §9.4)
  entry.chunks.push({ index: payload.index, ciphertext: payload.ciphertext });
  console.log(
    `[SOCP][FILE_CHUNK] ${payload.file_id} index=${payload.index} size=${payload.ciphertext.length}`
  );

  const ack = {
    type: "ACK",
    from: "server_1",
    to,
    ts: Date.now(),
    payload: { msg_ref: `${payload.file_id}:${payload.index}` },
    sig: "<server_signature_placeholder>",
  };

  return res.status(200).json(ack);
});

const handleFileEnd = asyncHandler(async (req, res) => {
  const { type, from, to, ts, payload } = req.body || {};

  if (type !== "FILE_END" || !payload?.file_id) {
    return res.status(400).json({ error: "Invalid FILE_END envelope" });
  }

  const entry = activeFiles.get(payload.file_id);
  if (!entry) {
    console.warn("[SOCP][WARN] FILE_END for unknown file_id", payload.file_id);
    return res.status(404).json({ error: "FILE_NOT_FOUND" });
  }

  console.log(
    `[SOCP][FILE_END] ${payload.file_id} totalChunks=${entry.chunks.length}`
  );

  // Optional: verify SHA-256 if you want to recompute later
  // but server should not decrypt per SOCP rules.

  const deliver = {
    type: "USER_DELIVER",
    from: "server_1",
    to,
    ts: Date.now(),
    payload: {
      file_id: payload.file_id,
      name: entry.meta.name,
      size: entry.meta.size,
      sha256: entry.meta.sha256,
      chunks_received: entry.chunks.length,
      note: "File transfer complete (simulated)",
    },
    sig: "<server_signature_placeholder>",
  };

  activeFiles.delete(payload.file_id);
  return res.status(200).json(deliver);
});

module.exports = {
  handleFileStart,
  handleFileChunk,
  handleFileEnd,
};
