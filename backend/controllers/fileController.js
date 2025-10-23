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
const asyncHandler = require("express-async-handler");

// Michelle sends a SOCP-like envelope. We accept both flat and envelope forms.
// Flat form:
//   { chatId, toUserId, fileId, fileName, fileSize, totalChunks }
// Envelope form (already unwrapped by FE is fine too):
//   { type, from, to, ts, payload:{ file_id, index?, ciphertext? }, sig }

// ! important: POST /api/file/start
/* ------------------------------------------------------------------
   POST /api/file/start
   SOCP v1.3  File Manifest (Sender  Server)
------------------------------------------------------------------- */
exports.fileStart = asyncHandler(async (req, res) => {
  const frame = req.body || {};

  // -------------------------------
  // 1. Validate envelope
  // -------------------------------
  if (!frame?.type || !frame?.from || !frame?.to || !frame?.payload) {
    return res.status(400).json({
      ok: false,
      error: "Invalid envelope: missing type/from/to/payload",
    });
  }

  const { type, from, to, ts, payload, sig } = frame;
  const timestamp = Number.isInteger(ts) ? ts : Date.now();

  if (type !== "FILE_START") {
    return res
      .status(400)
      .json({ ok: false, error: `Unexpected type: ${type}` });
  }

  if (
    !payload.file_id ||
    !payload.name ||
    !payload.size ||
    !payload.sha256 ||
    !payload.mode
  ) {
    return res.status(400).json({
      ok: false,
      error: "Invalid payload: missing file_id/name/size/sha256/mode",
    });
  }

  // -------------------------------
  // 2. Forward to internal file service
  // -------------------------------
  try {
    await req.app.locals.fileService.sendFileStart(to, {
      file_id: payload.file_id,
      name: payload.name,
      size: payload.size,
      sha256: payload.sha256,
      mode: payload.mode,
    });

    //! previously Akash did:   await req.app.locals.fileService.sendFileStart(toUserId, {chatId, file_id:fileId, name:fileName, size:fileSize, totalChunks}); -> Where does totalChunks come frome???

    // -------------------------------
    // 3. Send response (like /api/message)
    // -------------------------------
    return res.status(200).json({ ok: true, payload_ofSender: frame });
  } catch (err) {
    console.error("[SOCP][fileStart] Error:", err);
    return res.status(500).json({
      type: "ERROR",
      from: req.app.locals.server_id || "server_1",
      to: from || "unknown",
      ts: Date.now(),
      payload: { code: "SERVER_ERROR", detail: err.message },
      sig: "",
    });
  }
});

// ! important: POST /api/file/chunk
/* ------------------------------------------------------------------
   POST /api/file/chunk
   SOCP v1.3  File Chunk (encrypted, streamed)
------------------------------------------------------------------- */
exports.fileChunk = asyncHandler(async (req, res) => {
  const frame = req.body || {};

  // -------------------------------
  // 1. Validate envelope
  // -------------------------------
  if (!frame?.type || !frame?.from || !frame?.to || !frame?.payload) {
    return res.status(400).json({
      ok: false,
      error: "Invalid envelope: missing type/from/to/payload",
    });
  }

  const { type, from, to, ts, payload, sig } = frame;
  const timestamp = Number.isInteger(ts) ? ts : Date.now();

  if (type !== "FILE_CHUNK") {
    return res
      .status(400)
      .json({ ok: false, error: `Unexpected type: ${type}` });
  }

  if (
    !payload.file_id ||
    payload.index === undefined ||
    payload.index === null ||
    !payload.ciphertext
  ) {
    return res.status(400).json({
      ok: false,
      error: "Invalid payload: missing file_id/index/ciphertext",
    });
  }

  // -------------------------------
  // 2. Forward chunk to file service (stream mode)
  // -------------------------------
  try {
    await req.app.locals.fileService.sendFileChunk(to, {
      file_id: payload.file_id,
      index: payload.index,
      ciphertext: payload.ciphertext,
    });
    //! previously Akash did:   await req.app.locals.fileService.sendFileChunk(toUserId, {chatId, file_id:fileId, index:seq, ciphertext:chunk}); what is chatid?

    // -------------------------------
    // 3. Send SOCP-style response
    // -------------------------------
    return res.status(200).json({
      ok: true,
      payload_ofSender: frame,
    });
  } catch (err) {
    console.error("[SOCP][fileChunk] Error:", err);
    return res.status(500).json({
      type: "ERROR",
      from: req.app.locals.server_id || "server_1",
      to: from || "unknown",
      ts: Date.now(),
      payload: { code: "SERVER_ERROR", detail: err.message },
      sig: "",
    });
  }
});

// ! important: POST /api/file/end
/* ------------------------------------------------------------------
   POST /api/file/end
   SOCP v1.3  File Transfer Completion (Sender  Server)
------------------------------------------------------------------- */
exports.fileEnd = asyncHandler(async (req, res) => {
  const frame = req.body || {};

  // -------------------------------
  // 1. Validate envelope
  // -------------------------------
  if (!frame?.type || !frame?.from || !frame?.to || !frame?.payload) {
    return res.status(400).json({
      ok: false,
      error: "Invalid envelope: missing type/from/to/payload",
    });
  }

  const { type, from, to, ts, payload, sig } = frame;
  const timestamp = Number.isInteger(ts) ? ts : Date.now();

  if (type !== "FILE_END") {
    return res
      .status(400)
      .json({ ok: false, error: `Unexpected type: ${type}` });
  }

  if (!payload.file_id) {
    return res.status(400).json({
      ok: false,
      error: "Invalid payload: missing file_id",
    });
  }

  // -------------------------------
  // 2. Forward to file service
  // -------------------------------
  try {
    await req.app.locals.fileService.sendFileEnd(to, {
      file_id: payload.file_id,
    });
    //!previously Akash did:   await req.app.locals.fileService.sendFileEnd(toUserId, {chatId, file_id:fileId, sha256:checksum}); ? where does checksum come from
    // -------------------------------
    // 4. Send SOCP-style response
    // -------------------------------
    return res.status(200).json({
      ok: true,
      payload_ofSender: frame,
    });
  } catch (err) {
    console.error("[SOCP][fileEnd] Error:", err);
    return res.status(500).json({
      type: "ERROR",
      from: req.app.locals.server_id || "server_1",
      to: from || "unknown",
      ts: Date.now(),
      payload: { code: "SERVER_ERROR", detail: err.message },
      sig: "",
    });
  }
});
