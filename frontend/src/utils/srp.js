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
/* eslint-env es2021 */
/* global BigInt */

import { b64u } from './base64url';

// ===== BigInt helpers =====
function bufToBigInt(buf) {
  let hex = Array.from(buf).map(b => b.toString(16).padStart(2,'0')).join('');
  return BigInt('0x' + hex);
}
function bigIntToBuf(n) {
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const bytes = hex.match(/.{1,2}/g)?.map(h => parseInt(h,16)) || [];
  return new Uint8Array(bytes);
}
function modPow(base, exp, mod) {
  let r = 1n, b = base % mod, e = exp;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return r;
}

// ===== WebCrypto helpers =====
async function sha256(...chunks) {
  const total = chunks.reduce((n,c)=>n+c.length,0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c,off); off += c.length; }
  const d = await crypto.subtle.digest('SHA-256', buf);
  return new Uint8Array(d);
}
const utf8 = (s) => new TextEncoder().encode(s);

// ===== Public API =====

// Fetch SRP params (N, g, hash) from backend
export async function fetchSrpParams(baseUrl) {
  const res = await fetch(`${baseUrl}/api/auth/srp/params`);
  if (!res.ok) throw new Error('SRP params fetch failed');
  return res.json();
}

// Compute SRP salt & verifier (v = g^x mod N) for registration
export async function computeSaltAndVerifier(params, username, password, saltBytes) {
  const N = bufToBigInt(b64u.dec(params.N));
  const g = BigInt(params.g);
  const s = saltBytes ?? crypto.getRandomValues(new Uint8Array(16));

  // xH = H(username ":" password)
  const xH = await sha256(utf8(`${username}:${password}`));
  // x = H(s || xH)
  const x = bufToBigInt(await sha256(s, xH));

  const v = modPow(g, x, N);

  return {
    pake_password: {
      scheme: 'srp-6a',
      group: 'rfc5054-4096',
      g: 5,
      hash: 'SHA-256',
      salt: b64u.enc(s),
      verifier: b64u.enc(bigIntToBuf(v)),
      k: 'derived',   // hint: compute at runtime as H(N||g)
      version: 1,
    }
  };
}
