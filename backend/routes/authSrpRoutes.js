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
const express = require('express');
const crypto = require('crypto');
const { randomUUID } = require('crypto');
const { SRP } = require('fast-srp-hap');       // <-- named export
const User = require('../models/userModel');   // <-- your Mongoose model
const { putSession } = require('../auth/sessionStore');

const router = express.Router();

/* ===========================
   Utils (work with BigInteger or Buffer)
   =========================== */

function bytesToBigInt(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const hex = buf.toString('hex');
  return BigInt('0x' + (hex || '0'));
}

function bigIntToBuf(n) {
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  return Buffer.from(hex, 'hex');
}

function paramToBuffer(v) {
  // Accept Buffer, Uint8Array, jsbn BigInteger, number, bigint
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v);
  if (typeof v === 'bigint') return bigIntToBuf(v);
  if (typeof v === 'number') return bigIntToBuf(BigInt(v));
  if (v && typeof v === 'object') {
    if (typeof v.toByteArray === 'function') {
      // jsbn BigInteger common path
      return Buffer.from(v.toByteArray());
    }
    if (typeof v.toString === 'function') {
      // hex string (base 16) from BigInteger
      let hex = v.toString(16);
      if (hex.length % 2) hex = '0' + hex;
      return Buffer.from(hex, 'hex');
    }
  }
  throw new TypeError('Unsupported param type for Buffer conversion');
}

function anyToBigInt(v) {
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return bytesToBigInt(v);
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(v);
  if (v && typeof v === 'object' && typeof v.toString === 'function') {
    const hex = v.toString(16);
    return BigInt('0x' + (hex || '0'));
  }
  throw new TypeError('Unsupported param type for BigInt conversion');
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

function sha256(...chunks) {
  const h = crypto.createHash('sha256');
  for (const c of chunks) h.update(c);
  return h.digest(); // Buffer
}

function hmacSha256(key, ...chunks) {
  const h = crypto.createHmac('sha256', key);
  for (const c of chunks) h.update(c);
  return h.digest(); // Buffer
}

// HKDF (extract+expand) to avoid Node version issues
function hkdfSha256(ikm, salt, info = Buffer.from('srp-6a chat link'), length = 32) {
  // Extract
  const prk = hmacSha256(salt, ikm);
  // Expand (single block sufficient for 32 bytes)
  const T1 = hmacSha256(prk, info, Buffer.from([1]));
  return T1.slice(0, length);
}

function stripLeadingZeros(buf) {
  let i = 0;
  while (i < buf.length && buf[i] === 0) i++;
  return buf.slice(i);
}

function b64uEnc(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64uDec(s) {
  return Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'), 'base64');
}

/* ===========================
   SRP group & constants
   =========================== */

const GROUP = SRP.params[4096]; // RFC5054 4096-bit; generator g=5
if (!GROUP) throw new Error('fast-srp-hap: SRP.params[4096] missing');

const N_BUF = paramToBuffer(GROUP.N);
const G_BUF = paramToBuffer(GROUP.g);
const N_BIG = anyToBigInt(GROUP.N);
const G_BIG = anyToBigInt(GROUP.g);

if (G_BIG !== 5n) {
  console.warn(' Unexpected SRP generator; expected g=5, got:', G_BIG.toString());
}

// k = H(N || g_minimal)
const G_MIN = stripLeadingZeros(G_BUF);
const K_MULTIPLIER = bytesToBigInt(sha256(N_BUF, G_MIN));

/* ===========================
   Ephemeral stores (replace with Redis/Mongo later if you want)
   =========================== */
const PENDING = new Map();  // login_id -> { user_id, sBuf, vBig, bBig, ABig, BBig, createdAt }

/* ===========================
   Routes
   =========================== */

// 0) Params for registration/login  client needs N, g, hash to compute verifier or A
router.get('/params', (_req, res) => {
  res.json({
    scheme: 'srp-6a',
    group: 'rfc5054-4096',
    g: 5,
    hash: 'SHA-256',
    N: b64uEnc(N_BUF),
  });
});

// (Optional) Registration here. If you already register elsewhere, you can delete this route.
router.post('/register', async (req, res) => {
  try {
    const { user_id, pubkey, privkey_store, srp: srpBody, meta } = req.body || {};
    if (!user_id || !pubkey || !privkey_store || !srpBody) {
      return res.status(400).json({ error: 'MISSING_FIELDS' });
    }
    const { salt, verifier, group, g, hash } = srpBody;
    if (group !== 'rfc5054-4096' || g !== 5 || hash !== 'SHA-256') {
      return res.status(400).json({ error: 'UNSUPPORTED_SRP_PARAMS' });
    }

    const saltBuf = b64uDec(salt);
    const vBuf = b64uDec(verifier);
    if (saltBuf.length < 16) return res.status(400).json({ error: 'BAD_SRP_VALUES', detail: 'salt too short' });

    const vBig = bytesToBigInt(vBuf);
    if (vBig <= 0n || vBig >= N_BIG) return res.status(400).json({ error: 'BAD_SRP_VALUES', detail: 'verifier out of range' });

    // Upsert by user_id
    await User.findOneAndUpdate(
      { user_id },
      {
        user_id,
        pubkey,
        privkey_store,
        pake_password: { scheme:'srp-6a', group:'rfc5054-4096', g:5, hash:'SHA-256', salt, verifier, k:'derived', version:1 },
        meta,
        version: 1,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('SRP register error', e);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// 1) Client  Server: send A  =>  Server replies with salt, B, login_id
// Body: { user_id, A }
router.post('/1', async (req, res) => {
  try {
    const { user_id, A } = req.body || {};
    if (!user_id || !A) return res.status(400).json({ error: 'MISSING_FIELDS' });

    const user = await User.findOne({ user_id }).lean();
    const hasUser = !!user && !!user.pake_password;

    const sBuf = hasUser ? b64uDec(user.pake_password.salt) : crypto.randomBytes(16);
    const vBig = hasUser ? bytesToBigInt(b64uDec(user.pake_password.verifier)) : 1n; // dummy to hide existence
    const ABig = bytesToBigInt(b64uDec(A));

    // Reject A  0 (mod N)
    if (ABig % N_BIG === 0n) return res.status(400).json({ error: 'BAD_A' });

    // b random; B = (k*v + g^b) mod N
    const bBig = bytesToBigInt(crypto.randomBytes(32));
    const gPowB = modPow(G_BIG, bBig, N_BIG);
    const BBig = ( (K_MULTIPLIER * vBig) + gPowB ) % N_BIG;

    const login_id = randomUUID();
    PENDING.set(login_id, { user_id, sBuf, vBig, bBig, ABig, BBig, createdAt: Date.now() });

    res.json({
      login_id,
      salt: b64uEnc(sBuf),
      B: b64uEnc(bigIntToBuf(BBig)),
      params: { group: 'rfc5054-4096', g: 5, hash: 'SHA-256' },
    });
  } catch (e) {
    console.error('SRP step1 error', e);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// 3) Client  Server: send M1; Server verifies; returns M2 + session
// Body: { login_id, M1 }
router.post('/3', async (req, res) => {
  try {
    const { login_id, M1 } = req.body || {};
    if (!login_id || !M1) return res.status(400).json({ error: 'MISSING_FIELDS' });

    const state = PENDING.get(login_id);
    if (!state) return res.status(400).json({ error: 'LOGIN_EXPIRED' });

    const { user_id, sBuf, vBig, bBig, ABig, BBig } = state;

    // u = H(A || B)
    const A_buf = bigIntToBuf(ABig);
    const B_buf = bigIntToBuf(BBig);
    const uBig = bytesToBigInt(sha256(A_buf, B_buf));

    // S = (A * v^u)^b mod N
    const Avu = (ABig * modPow(vBig, uBig, N_BIG)) % N_BIG;
    const SBig = modPow(Avu, bBig, N_BIG);
    const S_buf = bigIntToBuf(SBig);

    // K = HKDF-SHA256(S, salt=s, info="srp-6a chat link")
    const K = hkdfSha256(S_buf, sBuf);

    // Verify client proof: M1' = H(A || B || K)
    const M1_expected = sha256(A_buf, B_buf, K);
    const M1_buf = b64uDec(M1);
    if (M1_expected.length !== M1_buf.length ||
        !crypto.timingSafeEqual(M1_expected, M1_buf)) {
      PENDING.delete(login_id);
      return res.status(400).json({ error: 'BAD_PROOF' });
    }

    // Server proof: M2 = H(A || M1 || K)
    const M2 = sha256(A_buf, M1_buf, K);

    // Create session
    const session_id = randomUUID();
    const ttlMs = 1000 * 60 * 30; // 30 minutes
    const expiresAt = Date.now() + ttlMs;
    putSession(session_id, { user_id, K, expiresAt });

    // Cleanup
    PENDING.delete(login_id);

    res.json({
      M2: b64uEnc(M2),
      session_id,
      expires: Math.floor(expiresAt / 1000),
    });
  } catch (e) {
    console.error('SRP step3 error', e);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Optional: quick session checker for debugging
router.get('/session/:id', (req, res) => {
  const s = SESSIONS.get(req.params.id);
  if (!s) return res.status(404).json({ ok: false });
  res.json({ ok: true, user_id: s.user_id, expires: Math.floor(s.expiresAt/1000) });
});

module.exports = router;
