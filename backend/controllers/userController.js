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
const User = require("../models/userModel");
const Group = require("../models/groupModel");
const GroupMember = require("../models/groupMemberModel");
const generateToken = require("../config/generateToken");

const registerUser = async (req, res) => {
  try {
    const { user_id, login_email, pubkey, privkey_store, pake_password, meta } =
      req.body;

    const existingUser = await User.findOne({ login_email });
    if (existingUser) {
      return res.status(400).json({ error: "EMAIL_IN_USE" });
    }

    // Create new user
    const user = await User.create({
      user_id,
      login_email,
      pubkey,
      privkey_store,
      pake_password,
      meta: meta || {},
      version: 1,
    });
    console.log("User created:", user);

    // Add user to public channel
    const publicGroup = await Group.findOne({ group_id: "public" });
    if (publicGroup) {
      console.log("Adding user to public channel");
      // in real implementation, encrypt the group key with the user's public key
      const wrappedKey = "placeholder_wrapped_key"; // Replace with actual RSA-OAEP encryption

      await GroupMember.create({
        group_id: "public",
        member_id: user_id,
        role: "member",
        wrapped_key: wrappedKey,
      });
    }
    console.log("User added to public channel");

    res.status(201).json({
      success: true,
      user: {
        user_id: user.user_id,
        pubkey: user.pubkey,
        meta: user.meta,
        token: generateToken(user.user_id), //  Add token
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "REGISTRATION_FAILED" });
  }
};

const getUserPublicKey = async (req, res) => {
  try {
    const { user_id } = req.params;

    const user = await User.findOne({ user_id }, "pubkey user_id");
    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    res.json({ pubkey: user.pubkey });
  } catch (error) {
    res.status(500).json({ error: "KEY_RETRIEVAL_FAILED" });
  }
};

const loginUser = async (req, res) => {
  try {
    const { login_email, password } = req.body;
    console.log("Login attempt with data:", req.body);
    const user = await User.findOne({ login_email });
    if (!user) {
      console.log("User not found!");
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    console.log("User found:", user.user_id);
    console.log("User data:", {
      hasPubkey: !!user.pubkey,
      hasPrivkeyStore: !!user.privkey_store,
      hasPakePassword: !!user.pake_password,
    });

    // TEMPORARY: For testing, we'll skip proper PAKE verification
    // In production, you'd implement proper PAKE verification here
    console.log("PAKE verification skipped for testing");

    // Return user data needed for frontend
    res.json({
      success: true,
      user: {
        user_id: user.user_id,
        pubkey: user.pubkey,
        privkey_store: user.privkey_store, // The encrypted private key
        meta: user.meta,
        token: generateToken(user.user_id), //  Add token
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "LOGIN_FAILED", details: error.message });
  }
};

const searchUsers = async (req, res) => {
  try {
    const keyword = req.query.search
      ? {
          $or: [
            {
              "meta.display_name": { $regex: req.query.search, $options: "i" },
            },
            { login_email: { $regex: req.query.search, $options: "i" } },
          ],
        }
      : {};

    // Exclude yourself from results
    const users = await User.find(keyword)
      .find({ user_id: { $ne: req.user?.user_id } })
      .select("-privkey_store -pake_password");

    res.json(users);
  } catch (error) {
    console.error("[SOCP][searchUsers] error:", error);
    res.status(500).json({ error: "SEARCH_FAILED" });
  }
};

module.exports = {
  registerUser,
  getUserPublicKey,
  loginUser,
  searchUsers,
};
