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
const SESSIONS = new Map(); // session_id -> { user_id, K: Buffer, expiresAt: number }

/** Add or replace a session */
function putSession(session_id, sessionObj) {
  SESSIONS.set(session_id, sessionObj);
}

/** Get a session or null if missing/expired */
function getSession(session_id) {
  const s = SESSIONS.get(session_id);
  if (!s) return null;
  if (Date.now() >= s.expiresAt) {
    SESSIONS.delete(session_id);
    return null;
  }
  return s;
}

function deleteSession(session_id) {
  SESSIONS.delete(session_id);
}

/** Optional: periodically purge expired entries */
function purgeExpired() {
  const now = Date.now();
  for (const [id, s] of SESSIONS.entries()) {
    if (now >= s.expiresAt) SESSIONS.delete(id);
  }
}

module.exports = { putSession, getSession, deleteSession, purgeExpired, SESSIONS };
