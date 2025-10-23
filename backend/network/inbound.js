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
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Minimal, tolerant schema for SOCP envelopes (peer-facing)
const envelopeSchema = {
  type: "object",
  required: ["op", "ts"],
  properties: {
    op: { type: "string" },
    from: { type: "string" },
    to: { type: ["string","null"] },
    ts: { type: "number" },
    nonce: { type: ["string","number","null"] },
    counter: { type: ["number","null"] },
    body: { type: "object" }
  },
  additionalProperties: true
};
const validate = ajv.compile(envelopeSchema);

// Map: external `op` -> local bus event + normalizer
const handlers = {
  // Direct message to a specific local user
  "DELIVER_DM": (bus, env) => {
    const b = env.body || {};
    // We expect either plaintext (content) or encrypted (ciphertext + signature)
    const payload = b.ciphertext
      ? { ciphertext: b.ciphertext, signature: b.signature || b.content_sig || b.sig, chatId: b.chatId }
      : b.content
      ? { content: b.content, chatId: b.chatId }
      : { ...b };
    // Emit for local delivery
    bus.emit("network:userDeliver", {
      from: env.from,
      to: env.to,
      ts: env.ts,
      ...payload,
    });
  },

  // Broadcast to public channel
  "PUBLIC_BROADCAST": (bus, env) => {
    const b = env.body || {};
    const payload = b.ciphertext
      ? { ciphertext: b.ciphertext, signature: b.signature || b.content_sig || b.sig }
      : b.content
      ? { content: b.content }
      : { ...b };
    bus.emit("network:publicMessage", {
      from: env.from,
      ts: env.ts,
      ...payload,
    });
  },

  // Presence changes
  "USER_ADVERTISE": (bus, env) => {
    const b = env.body || {};
    bus.emit("network:presenceUpdate", {
      type: "USER_ADVERTISE",
      userId: b.userId || env.from,
      displayName: b.displayName,
      pubkey: b.publicKey || b.pubkey,
      ts: env.ts,
    });
  },
  "USER_REMOVE": (bus, env) => {
    const b = env.body || {};
    bus.emit("network:presenceUpdate", {
      type: "USER_REMOVE",
      userId: b.userId || env.from,
      ts: env.ts,
    });
  },

  // File transfer into this node
  "FILE_START": (bus, env) => {
    const b = env.body || {};
    bus.emit("network:fileStart", {
      from: env.from,
      to: env.to,
      ts: env.ts,
      chatId: b.chatId,
      file_id: b.file_id || b.fileId,
      name: b.name || b.fileName,
      size: b.size || b.fileSize,
      totalChunks: b.totalChunks,
    });
  },
  "FILE_CHUNK": (bus, env) => {
    const b = env.body || {};
    bus.emit("network:fileChunk", {
      from: env.from,
      to: env.to,
      ts: env.ts,
      chatId: b.chatId,
      file_id: b.file_id || b.fileId,
      index: b.index ?? b.seq,
      ciphertext: b.ciphertext || b.chunk,
    });
  },
  "FILE_END": (bus, env) => {
    const b = env.body || {};
    bus.emit("network:fileEnd", {
      from: env.from,
      to: env.to,
      ts: env.ts,
      chatId: b.chatId,
      file_id: b.file_id || b.fileId,
      sha256: b.sha256 || b.checksum,
    });
  },

  // Acks / errors
  "ACK": (bus, env) => {
    bus.emit("network:ack", { from: env.from, ts: env.ts, body: env.body || {} });
  },
  "ERROR": (bus, env) => {
    bus.emit("network:error", { from: env.from, ts: env.ts, body: env.body || {} });
  },
};

// Public API: validate + dispatch
function handleInboundEnvelope(bus, env) {
  if (!validate(env)) {
    return { ok: false, error: "invalid_envelope", details: validate.errors };
  }
  const op = String(env.op || "").toUpperCase();
  const fn = handlers[op];
  if (!fn) {
    return { ok: false, error: "unknown_op", op };
  }
  try {
    fn(bus, env);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || "handler_failed" };
  }
}

module.exports = { handleInboundEnvelope };
