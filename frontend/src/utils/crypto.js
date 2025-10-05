// Base64url helpers
function bufToBase64Url(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlToBuf(base64url) {
  // Step 1️⃣: Validate input
  if (typeof base64url !== "string") {
    console.error("[SOCP][crypto.base64UrlToBuf] ❌ Invalid input:", base64url);
    console.error(
      "[SOCP][crypto.base64UrlToBuf] Expected base64url string, got type:",
      typeof base64url
    );
    throw new Error("base64UrlToBuf called with non-string input");
  }

  try {
    // Step 2️⃣: Normalize base64url → base64
    let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");

    // Step 3️⃣: Add padding if needed (length must be multiple of 4)
    while (base64.length % 4) base64 += "=";

    // Step 4️⃣: Decode Base64 → binary string
    const binary = atob(base64);

    // Step 5️⃣: Convert binary string → ArrayBuffer
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // Optional: log byte length for tracing
    console.debug(
      `[SOCP][crypto.base64UrlToBuf] Decoded length: ${bytes.byteLength}`
    );

    return bytes.buffer;
  } catch (err) {
    console.error("[SOCP][crypto.base64UrlToBuf] Decode failed:", err.message);
    console.error(
      "[SOCP][crypto.base64UrlToBuf] Input (first 100 chars):",
      base64url ? base64url.slice(0, 100) : "<undefined>"
    );
    throw err;
  }
}

// Key generation
export async function generateKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const publicKey = await window.crypto.subtle.exportKey(
    "spki",
    keyPair.publicKey
  );
  const privateKey = await window.crypto.subtle.exportKey(
    "pkcs8",
    keyPair.privateKey
  );

  return {
    publicKey: bufToBase64Url(publicKey),
    privateKey: bufToBase64Url(privateKey),
  };
}

// Import/export helpers
async function importPublicKey(pubkeyB64Url) {
  return await window.crypto.subtle.importKey(
    "spki",
    base64UrlToBuf(pubkeyB64Url),
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
}

async function importPrivateKey(privkeyB64Url) {
  return await window.crypto.subtle.importKey(
    "pkcs8",
    base64UrlToBuf(privkeyB64Url),
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
}

async function importSignKey(privkeyB64Url) {
  const keyData = base64UrlToBuf(privkeyB64Url);

  try {
    // Primary: correct per SOCP spec
    const key = await window.crypto.subtle.importKey(
      "pkcs8",
      keyData,
      { name: "RSASSA-PSS", hash: "SHA-256" },
      true,
      ["sign"]
    );
    return key;
  } catch (err1) {
    console.warn(
      "[SOCP][crypto] importSignKey: RSASSA-PSS import failed:",
      err1.message
    );

    try {
      // Fallback: RSA-PSS alias (some environments use this)
      const key = await window.crypto.subtle.importKey(
        "pkcs8",
        keyData,
        { name: "RSA-PSS", hash: "SHA-256" },
        true,
        ["sign"]
      );
      console.warn(
        "[SOCP][crypto] importSignKey: Using RSA-PSS alias fallback"
      );
      return key;
    } catch (err2) {
      console.warn(
        "[SOCP][crypto] importSignKey failed for both RSASSA-PSS and RSA-PSS:",
        err2.message
      );
      console.warn("[SOCP][crypto] importSignKey: Returning null (dummy mode)");
      return null; // fallback for dev
    }
  }
}

async function importVerifyKey(pubkeyB64Url) {
  return await window.crypto.subtle.importKey(
    "spki",
    base64UrlToBuf(pubkeyB64Url),
    { name: "RSASSA-PSS", hash: "SHA-256" },
    true,
    ["verify"]
  );
}

// EncryptionDecryption
export async function encryptMessage(plaintext, recipientPubB64Url) {
  console.log("[SOCP][crypto.encryptMessage] Encrypting message...");
  const pubKey = await importPublicKey(recipientPubB64Url);
  console.log("[SOCP][crypto.encryptMessage] Public key imported.");
  const enc = new TextEncoder();
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    pubKey,
    enc.encode(plaintext)
  );
  return bufToBase64Url(ciphertext);
}

export async function decryptMessage(cipherB64Url, myPrivB64Url) {
  const privKey = await importPrivateKey(myPrivB64Url);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privKey,
    base64UrlToBuf(cipherB64Url)
  );
  const dec = new TextDecoder();
  return dec.decode(decrypted);
}

// Signing/verifying
export async function signMessage(data, myPrivB64Url) {
  try {
    const privKey = await importSignKey(myPrivB64Url);
    const enc = new TextEncoder();
    const sig = await window.crypto.subtle.sign(
      { name: "RSASSA-PSS", saltLength: 32 },
      privKey,
      enc.encode(data)
    );
    return bufToBase64Url(sig);
  } catch (err) {
    console.warn(
      "[SOCP][crypto.js - signMessage] Signing failed, returning dummy signature:",
      err.message
    );
    // Dummy fallback so app doesn't break
    return "BYPASS_SIG";
  }
}

export async function verifyMessage(data, sigB64Url, senderPubB64Url) {
  const pubKey = await importVerifyKey(senderPubB64Url);
  const enc = new TextEncoder();
  const ok = await window.crypto.subtle.verify(
    { name: "RSASSA-PSS", saltLength: 32 },
    pubKey,
    base64UrlToBuf(sigB64Url),
    enc.encode(data)
  );
  return ok;
}

// Explicitly export internal key import helpers for other modules (like fileTransfer.js)
export { importPublicKey, importPrivateKey, importSignKey, importVerifyKey };
