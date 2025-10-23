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

// ===== BigInt helpers (same as srp.js) =====
function bufToBigInt(buf) {
  return BigInt('0x' + Array.from(buf).map(b=>b.toString(16).padStart(2,'0')).join(''));
}
function bigIntToBuf(n) {
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  return new Uint8Array((hex.match(/.{1,2}/g) || []).map(h => parseInt(h,16)));
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
  const buf = new Uint8Array(total); let off = 0;
  for (const c of chunks) { buf.set(c,off); off += c.length; }
  const d = await crypto.subtle.digest('SHA-256', buf);
  return new Uint8Array(d);
}
const utf8 = (s) => new TextEncoder().encode(s);

// HKDF-SHA256 (browser)
async function hkdfSha256IKM(ikm, salt, info, length = 32) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

const INFO = utf8('srp-6a chat link');

// ===== Client login flow =====
export async function srpLogin({ baseUrl = '', user_id, password }) {
  // 1) Choose random a, compute A = g^a mod N (fetch N from params route)
  const paramsRes = await fetch(`${baseUrl}/api/auth/srp/params`);
  if (!paramsRes.ok) throw new Error('SRP params fetch failed');
  const params = await paramsRes.json();
  const N = bufToBigInt(b64u.dec(params.N));
  const g = BigInt(params.g);

  const aBytes = crypto.getRandomValues(new Uint8Array(32));
  const a = bufToBigInt(aBytes);
  const A = modPow(g, a, N);

  // Send A
  const r1 = await fetch(`${baseUrl}/api/auth/srp/1`, {
    method: 'POST',
    headers: { 'content-type':'application/json' },
    body: JSON.stringify({ user_id, A: b64u.enc(bigIntToBuf(A)) })
  });
  if (!r1.ok) {
    const e = await r1.json().catch(()=>({}));
    throw new Error(`SRP step1 failed: ${e?.error || r1.status}`);
  }
  const { login_id, salt, B } = await r1.json();

  // 2) Compute u, x, S, K; make M1
  const s = b64u.dec(salt);
  const Bbig = bufToBigInt(b64u.dec(B));

  // Reject B  0 (mod N)
  if (Bbig % N === 0n) throw new Error('Server sent bad B');

  // k = H(N || g)
  // (compute same as server)
  const gBytes = bigIntToBuf(g);
  // strip leading zeros for g
  let gi = 0; while (gi < gBytes.length && gBytes[gi] === 0) gi++;
  const kBytes = await sha256(b64u.dec(params.N), gBytes.slice(gi));
  const k = bufToBigInt(kBytes);

  // u = H(A || B)
  const uBytes = await sha256(bigIntToBuf(A), bigIntToBuf(Bbig));
  const u = bufToBigInt(uBytes);

  // x = H( s || H(username ":" password) )
  const xH = await sha256(utf8(`${user_id}:${password}`));
  const xBytes = await sha256(s, xH);
  const x = bufToBigInt(xBytes);

  // S = (B - k * g^x) ^ (a + u*x) mod N
  const gx = modPow(g, x, N);
  let base = (Bbig - (k * gx) % N) % N;
  if (base < 0n) base += N;
  const exp = (a + u * x) % (N - 1n); // safe exponent
  const S = modPow(base, exp, N);
  const Sbytes = bigIntToBuf(S);

  // K = HKDF-SHA256(S, salt=s, info="srp-6a chat link")
  const K = await hkdfSha256IKM(Sbytes, s, INFO, 32);

  // M1 = H(A || B || K)
  const M1 = await sha256(bigIntToBuf(A), bigIntToBuf(Bbig), K);

  // 3) Send M1, receive M2 + session
  const r3 = await fetch(`${baseUrl}/api/auth/srp/3`, {
    method: 'POST',
    headers: { 'content-type':'application/json' },
    body: JSON.stringify({ login_id, M1: b64u.enc(M1) })
  });
  if (!r3.ok) {
    const e = await r3.json().catch(()=>({}));
    throw new Error(`SRP step3 failed: ${e?.error || r3.status}`);
  }
  const { M2, session_id, expires } = await r3.json();

  // Verify M2 = H(A || M1 || K)
  const M2_expected = await sha256(bigIntToBuf(A), M1, K);
  const M2_bytes = b64u.dec(M2);
  if (M2_bytes.length !== M2_expected.length ||
      !M2_bytes.every((v,i)=>v===M2_expected[i])) {
    throw new Error('Server M2 verification failed');
  }

  // Return link key K (for HMAC on link frames) + session id
  return {
    session_id,
    expires,
    K,                // Uint8Array (32 bytes)
    K_b64u: b64u.enc(K) // if you need to persist in memory (NOT localStorage)
  };
}
