import { encryptMessage, decryptMessage, importPublicKey } from "./crypto";

/* ===========================================================
   🔐 SOCP File Transfer (v1.3)
   RSA-4096 OAEP (SHA-256) — no AES, no IVs, no tags.
   Every chunk is directly RSA-OAEP-encrypted.
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
=========================================================== */
export async function* streamFileTransfer(
  file,
  mode,
  toId,
  fromUserId,
  recipientPubB64Url
) {
  const fileId = uuidv4();
  const fullBuf = new Uint8Array(await file.arrayBuffer());
  const sha256 = await sha256Hex(fullBuf);

  // --- 1️⃣ FILE_START ---
  yield {
    type: "FILE_START",
    from: fromUserId,
    to: toId,
    ts: Date.now(),
    payload: {
      file_id: fileId,
      name: file.name ?? "download.bin",
      size: file.size,
      sha256,
      mode, // "dm" | "public"
    },
    sig: "",
  };

  // --- 2️⃣ FILE_CHUNK* ---
  const pubKey = await importPublicKey(recipientPubB64Url);
  const rawChunks = await splitFileIntoChunks(file, MAX_RSA_OAEP_BLOCK);

  for (let i = 0; i < rawChunks.length; i++) {
    const raw = rawChunks[i];
    try {
      const ciphertextBuf = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        pubKey,
        raw
      );
      yield {
        type: "FILE_CHUNK",
        from: fromUserId,
        to: toId,
        ts: Date.now(),
        payload: {
          file_id: fileId,
          index: i,
          ciphertext: bufToBase64Url(ciphertextBuf),
        },
        sig: "",
      };
    } catch (err) {
      console.error(
        `[SOCP][streamFileTransfer] Encryption failed at chunk ${i}:`,
        err
      );
      throw err;
    }
  }

  // --- 3️⃣ FILE_END ---
  yield {
    type: "FILE_END",
    from: fromUserId,
    to: toId,
    ts: Date.now(),
    payload: { file_id: fileId },
    sig: "",
  };

  console.log(
    "[SOCP][streamFileTransfer] Completed for",
    file.name,
    "total chunks:",
    rawChunks.length
  );
}

/* ===========================================================
   🟩 FILE RECEIVER (reassembly & verification)
=========================================================== */
export class FileReceiver {
  constructor() {
    this.files = new Map(); // file_id → { meta, chunks }
  }

  async handleMessage(msg, myPrivB64Url) {
    const { type, payload } = msg;

    if (type === "FILE_START") {
      this.files.set(payload.file_id, { meta: payload, chunks: new Map() });
      return;
    }

    if (type === "FILE_CHUNK") {
      const entry = this.files.get(payload.file_id);
      if (!entry) return;

      try {
        const decryptedBuf = await decryptMessage(
          payload.ciphertext,
          myPrivB64Url
        );
        const bytes = new Uint8Array(decryptedBuf);
        entry.chunks.set(payload.index, bytes);
      } catch (err) {
        console.error("[SOCP][FileReceiver] Decrypt failed:", err);
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
        console.error(
          "[SOCP][FileReceiver] SHA-256 mismatch — discarding",
          meta.file_id
        );
        this.files.delete(meta.file_id);
        return;
      }

      this.files.delete(meta.file_id);
      return { blob, name: meta.name || "download.bin" };
    }
  }
}
