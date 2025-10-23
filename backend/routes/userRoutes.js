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
const express = require("express");
const {
  registerUser,
  getUserPublicKey,
  loginUser,
  searchUsers,
} = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");
const requireSession = require("../middleware/requireSession");
const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/pubkey/:user_id", getUserPublicKey);
router.get("/search", protect, searchUsers); // TODO: correct? to search users?

/**
 * GET /api/user/me
 * Auth: x-session-id header (checked by requireSession)
 * Returns safe fields, including privkey_store (needed client-side for decryption).
 */
router.get("/me", requireSession, async (req, res) => {
  const u = req.userDoc;

  // Whitelist the fields you want to expose to the client
  const safeUser = {
    user_id: u.user_id,
    pubkey: u.pubkey,
    privkey_store: u.privkey_store, // client will decrypt with their password
    meta: u.meta ?? null,
    version: u.version ?? 1,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };

  return res.json({ user: safeUser });
});

module.exports = router;
