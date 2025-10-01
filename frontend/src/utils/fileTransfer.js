import { encryptMessage, decryptMessage } from "./crypto";

// ===== Base64url helpers (compatible with utils/crypto.js) =====
function bufToBase64Url(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBuf(base64url) {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ===== SHA-256 helper (hex) =====
async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer ?? bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ===== UUID v4 =====
function uuidv4() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Fallback
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(
    16,
    20
  )}-${h.slice(20)}`;
}

// ===== Chunking =====
export const DEFAULT_CHUNK_SIZE = 16 * 1024; // 16 KiB per chunk

async function splitFileIntoChunks(file, chunkSize = DEFAULT_CHUNK_SIZE) {
  const chunks = [];
  let offset = 0;
  while (offset < file.size) {
    const slice = file.slice(offset, offset + chunkSize);
    const buf = new Uint8Array(await slice.arrayBuffer());
    chunks.push(buf);
    offset += chunkSize;
  }
  return chunks;
}

/**
 * prepareFileTransfer
 * Turns a File/Blob into a sequence of SOCP messages:
 *   FILE_START → FILE_CHUNK* → FILE_END
 *
 * @param {File|Blob} file
 * @param {"dm"|"public"} mode
 * @param {string} toId            // user_id for DM, or "public" (or channel id) for public
 * @param {string} fromUserId
 * @param {string} recipientPubB64Url // RSA-4096 SPKI in base64url (from utils/crypto.generateKeyPair or server directory)
 * @returns {Promise<Array<Object>>}  // array of JSON frames ready to send over WS
 */
export async function prepareFileTransfer(
  file,
  mode,
  toId,
  fromUserId,
  recipientPubB64Url
) {
  const fileId = uuidv4();

  // Compute whole-file SHA-256 (hex) for integrity verification at receiver
  const wholeBuf = new Uint8Array(await file.arrayBuffer());
  const sha256 = await sha256Hex(wholeBuf);

  // FILE_START (manifest header)
  const startMsg = {
    type: "FILE_START",
    from: fromUserId,
    to: toId,
    ts: Date.now(),
    payload: {
      file_id: fileId,
      name: file.name ?? "download.bin",
      size: file.size ?? wholeBuf.byteLength,
      sha256,
      mode, // "dm" | "public"
    },
    sig: "", // optional transport sig; E2E content is carried inside payloads
  };

  // Create encrypted FILE_CHUNK messages.
  // IMPORTANT:
  // Josh's encryptMessage takes a *string*. To preserve binary chunks exactly,
  // we first base64url-encode the raw bytes, then encrypt that string.
  // Receiver will decrypt → base64url string → decode back to bytes.
  const rawChunks = await splitFileIntoChunks(file, DEFAULT_CHUNK_SIZE);

  const chunkMsgs = [];
  for (let i = 0; i < rawChunks.length; i++) {
    const raw = rawChunks[i];
    const b64Chunk = bufToBase64Url(raw.buffer); // encode raw bytes to base64url string
    const ciphertext = await encryptMessage(b64Chunk, recipientPubB64Url); // RSA-OAEP over string
    chunkMsgs.push({
      type: "FILE_CHUNK",
      from: fromUserId,
      to: toId,
      ts: Date.now(),
      payload: {
        file_id: fileId,
        index: i,
        ciphertext, // base64url of RSA ciphertext (from encryptMessage)
      },
      sig: "", // optional transport sig
    });
  }

  // FILE_END (signals completion)
  const endMsg = {
    type: "FILE_END",
    from: fromUserId,
    to: toId,
    ts: Date.now(),
    payload: { file_id: fileId },
    sig: "",
  };

  return [startMsg, ...chunkMsgs, endMsg];
}

/**
 * FileReceiver
 * Collects FILE_* messages, decrypts, reassembles, verifies hash,
 * and returns a { blob, name } when the transfer completes.
 */
export class FileReceiver {
  constructor() {
    // file_id -> { meta, chunks: Map<index, Uint8Array> }
    this.files = new Map();
  }

  /**
   * @param {Object} msg             // a parsed JSON frame
   * @param {string} myPrivB64Url    // RSA-4096 PKCS8 private key (base64url)
   * @returns {Promise<{blob: Blob, name: string} | undefined>}
   */
  async handleMessage(msg, myPrivB64Url) {
    const { type, payload } = msg;

    if (type === "FILE_START") {
      this.files.set(payload.file_id, {
        meta: payload,
        chunks: new Map(),
      });
      return;
    }

    if (type === "FILE_CHUNK") {
      const entry = this.files.get(payload.file_id);
      if (!entry) return;

      // Decrypt → base64url string of original bytes → decode to Uint8Array
      const decryptedStr = await decryptMessage(
        payload.ciphertext,
        myPrivB64Url
      );
      const bytes = new Uint8Array(base64UrlToBuf(decryptedStr));
      entry.chunks.set(payload.index, bytes);
      return;
    }

    if (type === "FILE_END") {
      const entry = this.files.get(payload.file_id);
      if (!entry) return;

      const { meta, chunks } = entry;

      // Reassemble in order: 0..N-1
      const ordered = [...chunks.keys()]
        .sort((a, b) => a - b)
        .map((k) => chunks.get(k));
      const blob = new Blob(ordered, { type: "application/octet-stream" });

      // Verify SHA-256
      const arr = new Uint8Array(await blob.arrayBuffer());
      const hash = await sha256Hex(arr);
      if (hash !== meta.sha256) {
        console.error(
          "SOCP FILE: hash mismatch; discarding file_id",
          meta.file_id
        );
        this.files.delete(meta.file_id);
        return;
      }

      // Clean up and return the reconstructed file
      this.files.delete(meta.file_id);
      return { blob, name: meta.name || "download.bin" };
    }
  }
}
