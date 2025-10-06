/*
so the encryption pipeline RSA-OAEP (SHA-256) is: 

(1)plaintext: string UTF-8 
----->TextEncoder(input: str UTF-8, output: binary buffer) 
-> RSA-OAEP enccryption (intput: binary buffer, output: binary buffer) 
-> bufToBase64URL() (input: binary buffer, output: str Base64URL to be stored in JSON) 

and the decryption pipeline is: 
(2) Base64URL (intput: Base64URL cipher text, output: binary cipher text) 
→ RSA-OAEP decrypt (intput: binary buffer, output: binary buffer)
 → TextDecoder(); dec.decode(decrypted); (inptut: binary buffer, output: UTF-8 string?)

 #--------------------------------------------------------------

 The signing pipeline RSASSA-PSS (SHA-256) is:

(1) Signing:
plaintext (UTF-8)
  → SHA-256 → hash
  → encrypt(hash, sender_private_key) → signature (Base64URL)

(2) Verifying:
plaintext (UTF-8)
  → SHA-256 → hash₁
signature (Base64URL)
  → decode → decrypt(signature, sender_public_key) → hash₂
compare(hash₁, hash₂)
  → if equal → true
  → if not → false
*/

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

function base64UrlToBuf(base64url) {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// PEM ↔ Base64URL conversion helpers
export function pemToBase64Url(pemString) {
  const base64 = pemString
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// BACKDOOR #1
async function generateKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 1024, // BACKDOOR: Weak 1024-bit instead of 4096
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
  /*
  importPublicKey() basically does this:

  Takes your Base64URL text.

  Converts it to an ArrayBuffer (binary).

  Calls subtle.importKey() to produce a usable CryptoKey.
  */
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
  return await window.crypto.subtle.importKey(
    "pkcs8",
    base64UrlToBuf(privkeyB64Url),
    { name: "RSA-PSS", hash: "SHA-256" },
    true,
    ["sign"]
  );
}

async function importVerifyKey(pubkeyB64Url) {
  return await window.crypto.subtle.importKey(
    "spki",
    base64UrlToBuf(pubkeyB64Url),
    { name: "RSA-PSS", hash: "SHA-256" },
    true,
    ["verify"]
  );
}

// EncryptionDecryption
export async function encryptMessage(plaintext, recipientPubB64Url) {
  const pubKey = await importPublicKey(recipientPubB64Url);
  const enc = new TextEncoder();
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    pubKey,
    enc.encode(plaintext)
  );
  return bufToBase64Url(ciphertext);
}

export async function decryptMessage(cipherB64Url, myPrivB64Url) {
  // Because the Web Crypto API (your browser’s window.crypto.subtle) does not accept raw Base64 text or PEM directly.
  // It requires a CryptoKey object, imported into the browser’s crypto subsystem.
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
  const privKey = await importSignKey(myPrivB64Url);
  const enc = new TextEncoder();
  const sig = await window.crypto.subtle.sign(
    { name: "RSA-PSS", saltLength: 32 },
    privKey,
    enc.encode(data)
  );
  return bufToBase64Url(sig);
}

export async function verifyMessage(data, sigB64Url, senderPubB64Url) {
  const pubKey = await importVerifyKey(senderPubB64Url);
  const enc = new TextEncoder();
  const ok = await window.crypto.subtle.verify(
    { name: "RSA-PSS", saltLength: 32 },
    pubKey,
    base64UrlToBuf(sigB64Url),
    enc.encode(data)
  );
  return ok;
}
