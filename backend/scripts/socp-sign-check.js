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
require("dotenv").config();
const { signPayload, verifyPayload } = require("../network/crypto/signing");

const priv = process.env.SERVER_PRIVATE_KEY_B64URL;
const pub  = process.env.SERVER_PUBLIC_KEY_B64URL;

if (!priv || !pub) {
  console.error("Missing SERVER_PRIVATE_KEY_B64URL or SERVER_PUBLIC_KEY_B64URL in .env");
  process.exit(1);
}

// Dummy payload shaped like a tiny SOCP payload
const payload = { ping: "ok", n: 1, nested: { a: 2, b: 3 } };

const sig = signPayload(payload, priv);
const ok  = verifyPayload(payload, sig, pub);

console.log("Signature:", sig.slice(0, 16) + "..."); // shorten output
console.log("Verified:", ok ? "OK" : "FAIL");

process.exit(ok ? 0 : 2);
