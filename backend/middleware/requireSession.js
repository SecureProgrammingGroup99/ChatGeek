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
const { getSession } = require('../auth/sessionStore');
const User = require('../models/userModel');

/**
 * Reads x-session-id, verifies it, attaches req.session and req.userDoc.
 * Responds 401 on failure.
 */
module.exports = async function requireSession(req, res, next) {
  try {
    const sessionId = req.header('x-session-id');
    if (!sessionId) {
      return res.status(401).json({ error: 'NO_SESSION' });
    }
    const session = getSession(String(sessionId));
    if (!session) {
      return res.status(401).json({ error: 'INVALID_SESSION' });
    }

    // Load user doc (only once per request)
    const userDoc = await User.findOne({ user_id: session.user_id }).lean();
    if (!userDoc) {
      return res.status(401).json({ error: 'USER_NOT_FOUND' });
    }

    // Attach to req for downstream handlers
    req.session = session;    // { user_id, K, expiresAt }
    req.userDoc = userDoc;

    // Optional: sliding expiration (touch on access)
    // session.expiresAt = Date.now() + 1000*60*30;

    next();
  } catch (e) {
    console.error('requireSession error', e);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
};
