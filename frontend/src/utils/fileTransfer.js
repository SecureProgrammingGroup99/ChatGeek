import {
  encryptMessage,
  decryptMessage,
  signMessage,
  verifyMessage,
} from "./crypto";

/* ===========================================================
     🔐 SOCP File Transfer (v1.3 — Secure Version)
     - Uses existing crypto helpers (encryptMessage, decryptMessage)
     - Each frame optionally signed by sender's private key
     - No importPublicKey dependency
  =========================================================== */

// ---------- Base64URL helpers ----------
export function bufToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlToBuf(base64url) {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ---------- SHA-256 helper ----------
export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer ?? bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------- UUID ----------
function uuidv4() {
  if (crypto.randomUUID) return crypto.randomUUID();
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

// ---------- Constants ----------
export const MAX_RSA_OAEP_BLOCK = 446; // bytes for 4096-bit key + SHA-256

// ---------- Chunking ----------
async function splitFileIntoChunks(file, chunkSize = MAX_RSA_OAEP_BLOCK) {
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

/* ===========================================================
     🟦 STREAMING FILE TRANSFER
     Yields FILE_START → FILE_CHUNK* → FILE_END sequentially.
     Requires:
       - senderPrivKeyB64url (for signing)
       - recipientPubKeyB64url (for encryption)
  =========================================================== */
export async function* streamFileTransfer(
  file,
  mode,
  chatId,
  fromUserId,
  recipientPubKeyB64url,
  senderPrivKeyB64url
) {
  if (!file || !recipientPubKeyB64url || !senderPrivKeyB64url) {
    return;
  }

  const fileId = uuidv4();
  const fullBuf = new Uint8Array(await file.arrayBuffer());
  const sha256 = await sha256Hex(fullBuf);

  // --- 1️⃣ FILE_START ---
  const startPayload = {
    file_id: fileId,
    name: file.name ?? "download.bin",
    size: file.size,
    sha256,
    mode, // "dm" | "public"
  };
  const startSig = await signMessage(
    JSON.stringify(startPayload),
    senderPrivKeyB64url
  );
  yield {
    type: "FILE_START",
    from: fromUserId,
    to: chatId,
    ts: Date.now(),
    payload: startPayload,
    sig: startSig,
  };

  // --- 2️⃣ FILE_CHUNK* ---
  const rawChunks = await splitFileIntoChunks(file, MAX_RSA_OAEP_BLOCK);

  for (let i = 0; i < rawChunks.length; i++) {
    const raw = rawChunks[i];
    try {
      const ciphertext = await encryptMessage(raw, recipientPubKeyB64url);
      const payload = { file_id: fileId, index: i, ciphertext };
      const sig = await signMessage(
        JSON.stringify(payload),
        senderPrivKeyB64url
      );

      yield {
        type: "FILE_CHUNK",
        from: fromUserId,
        to: chatId,
        ts: Date.now(),
        payload,
        sig,
      };
    } catch (err) {
      throw err;
    }
  }

  // --- 3️⃣ FILE_END ---
  const endPayload = { file_id: fileId };
  const endSig = await signMessage(
    JSON.stringify(endPayload),
    senderPrivKeyB64url
  );
  yield {
    type: "FILE_END",
    from: fromUserId,
    to: chatId,
    ts: Date.now(),
    payload: endPayload,
    sig: endSig,
  };
}

/* ===========================================================
     🟩 FILE RECEIVER (reassembly & verification)
  =========================================================== */
export class FileReceiver {
  constructor() {
    this.files = new Map(); // file_id → { meta, chunks }
  }

  async handleMessage(msg, myPrivB64Url) {
    const { type, payload, sig } = msg;

    if (!payload) {
      return;
    }

    if (type === "FILE_START") {
      this.files.set(payload.file_id, { meta: payload, chunks: new Map() });
      return;
    }

    if (type === "FILE_CHUNK") {
      const entry = this.files.get(payload.file_id);
      if (!entry) return;

      try {
        const decrypted = await decryptMessage(
          payload.ciphertext,
          myPrivB64Url
        );
        const bytes =
          decrypted instanceof ArrayBuffer
            ? new Uint8Array(decrypted)
            : new Uint8Array(await decrypted.arrayBuffer?.());
        entry.chunks.set(payload.index, bytes);
      } catch (err) {
        console.error(`[SOCP][sending files] ❌ Decryption failed`, err);
      }
      return;
    }

    if (type === "FILE_END") {
      const entry = this.files.get(payload.file_id);
      if (!entry) return;

      const { meta, chunks } = entry;
      const ordered = [...chunks.keys()]
        .sort((a, b) => a - b)
        .map((k) => chunks.get(k));
      const blob = new Blob(ordered, { type: "application/octet-stream" });

      const arr = new Uint8Array(await blob.arrayBuffer());
      const hash = await sha256Hex(arr);

      if (hash !== meta.sha256) {
        this.files.delete(meta.file_id);
        return;
      }

      this.files.delete(meta.file_id);
      return { blob, name: meta.name || "download.bin" };
    }
  }
}
