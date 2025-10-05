import { encryptMessage, decryptMessage } from "./crypto";
/*
RSA-OAEP (SHA-256) helpers from utils/crypto.js.
encryptMessage encrypts plaintext (which is one chunk’s base64url string) using the recipient’s public key.
decryptMessage decrypts the ciphertext using your private key when receiving.
*/

// ===== Base64url helpers (compatible with utils/crypto.js) =====
// Convert raw binary data (an ArrayBuffer or Uint8Array) into Base64URL text, which is safe to include in JSON payloads.
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
  // turn a base64url string back into an ArrayBuffer. Used on the receiver side after decrypting: you’ll get a base64url string representing the original chunk bytes.
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ===== SHA-256 helper (hex) =====
async function sha256Hex(bytes) {
  // Compute the SHA-256 hash of the full file contents, and return it as a lowercase hex string.
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer ?? bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ===== UUID v4 =====
function uuidv4() {
  // Generate a random UUID v4, Used for the file’s unique file_id.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
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

// Defines the slice size when splitting the file into chunks for transfer.
export const DEFAULT_CHUNK_SIZE = 16 * 1024; // 16 KiB per chunk

async function splitFileIntoChunks(file, chunkSize = DEFAULT_CHUNK_SIZE) {
  // Take a browser File object and produce an array of Uint8Array chunks of raw bytes.
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
 * 🟦 STREAMING FILE TRANSFER (instead of pre-building all frames)
 * Generates FILE_START → FILE_CHUNK* → FILE_END sequentially.
 * lets frontend send them one-by-one as they’re ready (streaming upload), rather than buffering the entire file in memory.
 */
export async function* streamFileTransfer(
  file,
  mode,
  toId,
  fromUserId,
  recipientPubB64Url
) {
  /*
  function* myGenerator() { ... }
  - declaring a generator function.
  - ➡️ A generator doesn’t run everything at once.
  - Instead, when you call it, it gives you a generator object — a special kind of iterator that you can pull values from one by one.
  - eg.
  function* numbers() {
  yield 1;
  yield 2;
  yield 3;
}
- when we call: const gen = numbers(); : don’t get [1, 2, 3] — instead you get a generator object.
- pull values like this:
```
gen.next(); // { value: 1, done: false }
gen.next(); // { value: 2, done: false }
gen.next(); // { value: 3, done: false }
gen.next(); // { value: undefined, done: true } // done: True -> no more values to yield
```
- yield: "Pause this function here, output this value to the caller, and let the caller resume me later when they call .next() again."
- The caller doesn’t need to know how many values will come. They just loop until the generator says it’s done.
- async function* myAsyncGenerator() { ... } -> It’s the asynchronous version of a generator.
- In a normal generator, each .next() returns immediately.
- But in an async generator, each .next() returns a Promise that resolves later.
- So you can use for await...of to loop over its values asynchronously.
  */
  const fileId = uuidv4();
  const wholeBuf = new Uint8Array(await file.arrayBuffer());
  const sha256 = await sha256Hex(wholeBuf);

  // FILE_START
  // Step 1 — Metadata Manifest - Emits a FILE_START frame
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

  // FILE_CHUNK*
  // ▶️ Step 2 — Encrypted Chunks
  const rawChunks = await splitFileIntoChunks(file, DEFAULT_CHUNK_SIZE);
  for (let i = 0; i < rawChunks.length; i++) {
    const raw = rawChunks[i];
    const b64Chunk = bufToBase64Url(raw.buffer);
    const ciphertext = await encryptMessage(b64Chunk, recipientPubB64Url); // TODO: question: encrypt the base64 version or the binary version?
    yield {
      type: "FILE_CHUNK",
      from: fromUserId,
      to: toId,
      ts: Date.now(),
      payload: {
        file_id: fileId,
        index: i,
        ciphertext,
      },
      sig: "",
    };
  }

  // Step 3 — End Marker
  // FILE_END
  yield {
    type: "FILE_END",
    from: fromUserId,
    to: toId,
    ts: Date.now(),
    payload: { file_id: fileId },
    sig: "",
  };
}

/**
 * 🟦 FileReceiver remains the same — handles reassembly
 */
export class FileReceiver {
  // Keeps a map file_id → {meta, chunks}.
  constructor() {
    this.files = new Map();
  }

  async handleMessage(msg, myPrivB64Url) {
    //Dispatches based on the type.
    const { type, payload } = msg;

    if (type === "FILE_START") {
      // Initializes an entry in this.files to start collecting chunks.
      // Stores metadata (size, sha256, name).
      this.files.set(payload.file_id, {
        meta: payload,
        chunks: new Map(),
      });
      return;
    }

    if (type === "FILE_CHUNK") {
      const entry = this.files.get(payload.file_id);
      if (!entry) return;

      //Decrypts chunk ciphertext using  RSA private key.
      const decryptedStr = await decryptMessage(
        payload.ciphertext,
        myPrivB64Url
      );
      // Converts the decrypted base64url string back to bytes.
      const bytes = new Uint8Array(base64UrlToBuf(decryptedStr));
      // Stores that byte block under its index.
      entry.chunks.set(payload.index, bytes);
      return;
    }

    if (type === "FILE_END") {
      const entry = this.files.get(payload.file_id);
      if (!entry) return;

      const { meta, chunks } = entry;
      // Reorders chunks by index.
      const ordered = [...chunks.keys()]
        .sort((a, b) => a - b)
        .map((k) => chunks.get(k));
      // Joins them into a Blob.
      const blob = new Blob(ordered, { type: "application/octet-stream" });

      const arr = new Uint8Array(await blob.arrayBuffer());
      // Computes SHA-256 again and compares with meta.sha256. → If mismatch ⇒ file corrupted → discard.
      const hash = await sha256Hex(arr);
      if (hash !== meta.sha256) {
        console.error("SOCP FILE: hash mismatch; discarding", meta.file_id);
        this.files.delete(meta.file_id);
        return;
      }

      this.files.delete(meta.file_id);

      // If OK, returns { blob, name } ready for download (URL.createObjectURL(blob)).
      return { blob, name: meta.name || "download.bin" };
    }
  }
}
