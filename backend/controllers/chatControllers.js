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
// ================================================================
//  backend/controllers/chatControllers.js
//  Minimal modification: preserve all behaviour
//  Only accessChat() and fetchChats() now hydrate .users array
// ================================================================

const asyncHandler = require("express-async-handler");
const { v4: uuidv4 } = require("uuid");
const Group = require("../models/groupModel");
const GroupMember = require("../models/groupMemberModel");
const User = require("../models/userModel");

/* ------------------------------------------------------------------
   ACCESS OR CREATE DIRECT CHAT (1-on-1)
------------------------------------------------------------------- */
const accessChat = asyncHandler(async (req, res) => {
  const { userId } = req.body; // recipient UUID
  const currentUser = req.user.user_id;
  console.log(
    "[SOCP][accessChat] Current user:",
    currentUser,
    "Target user:",
    userId
  );

  if (!userId) {
    console.warn("[SOCP][accessChat]  Missing userId in request body");
    return res.status(400).json({ error: "userId required" });
  }

  try {
    //  Check if a DM 'group' already exists for this pair
    const existing = await Group.findOne({
      $or: [
        { name: `${currentUser}-${userId}` },
        { name: `${userId}-${currentUser}` },
      ],
    });

    //  CHANGED SECTION
    if (existing) {
      console.log(
        `[SOCP][accessChat]  Found existing DM: ${existing.group_id}`
      );

      // fetch members and users for compatibility with frontend
      const members = await GroupMember.find({
        group_id: existing.group_id,
      }).select("member_id");
      const users = await User.find({
        user_id: { $in: members.map((m) => m.member_id) },
      }).select("-pake_password -privkey_store");

      return res.status(200).json({
        ...existing.toObject(),
        chat_id: existing.group_id,
        isGroupChat: users.length > 2,
        users,
      });
    }

    //  Otherwise create a new "direct chat" group
    const newGroupId = uuidv4();
    const newGroup = await Group.create({
      group_id: newGroupId,
      creator_id: currentUser,
      name: `${currentUser}-${userId}`,
      meta: { description: "Direct message channel" },
    });

    // Add both participants to GroupMember table
    const wrappedKey = "BYPASS_WRAPPED_KEY"; // TODO: generate real encrypted key later
    await GroupMember.insertMany([
      {
        group_id: newGroupId,
        member_id: currentUser,
        role: "member",
        wrapped_key: wrappedKey,
      },
      {
        group_id: newGroupId,
        member_id: userId,
        role: "member",
        wrapped_key: wrappedKey,
      },
    ]);

    console.log(`[SOCP][accessChat]  Created new DM: ${newGroupId}`);

    //  CHANGED SECTION
    const members = await GroupMember.find({
      group_id: newGroupId,
    }).select("member_id");
    const users = await User.find({
      user_id: { $in: members.map((m) => m.member_id) },
    }).select("-pake_password -privkey_store");

    return res.status(201).json({
      ...newGroup.toObject(),
      chat_id: newGroup.group_id,
      isGroupChat: users.length > 2,
      users,
    });
  } catch (err) {
    console.error("[SOCP][accessChat] DB error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------
   FETCH ALL GROUPS (DMs + GROUPS) FOR A USER
------------------------------------------------------------------- */
const fetchChats = asyncHandler(async (req, res) => {
  const currentUser = req.user.user_id;

  try {
    // Find all group memberships for this user
    const memberships = await GroupMember.find({
      member_id: currentUser,
    }).select("group_id role");
    const groupIds = memberships.map((m) => m.group_id);

    // Get group details
    const groups = await Group.find({ group_id: { $in: groupIds } })
      .sort({ updatedAt: -1 })
      .lean();

    //  CHANGED SECTION
    const enriched = await Promise.all(
      groups.map(async (g) => {
        const members = await GroupMember.find({
          group_id: g.group_id,
        }).select("member_id");
        const users = await User.find({
          user_id: { $in: members.map((m) => m.member_id) },
        }).select("-pake_password -privkey_store");
        return {
          ...g,
          chat_id: g.group_id,
          isGroupChat: users.length > 2,
          users,
        };
      })
    );
    //

    return res.status(200).json(enriched);
  } catch (err) {
    console.error("[SOCP][fetchChats] DB error:", err);
    res.status(400).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------
   CREATE GROUP CHAT (multi-user)
------------------------------------------------------------------- */
const createGroupChat = asyncHandler(async (req, res) => {
  const { name, users } = req.body; // users: array of user_id
  const currentUser = req.user.user_id;

  if (!name || !Array.isArray(users) || users.length < 2) {
    return res
      .status(400)
      .json({ error: "At least 2 users + group name required" });
  }

  try {
    const group_id = uuidv4();
    const group = await Group.create({
      group_id,
      creator_id: currentUser,
      name,
      meta: { description: "SOCP group chat" },
    });

    const allMembers = [...users, currentUser];
    const wrappedKey = "BYPASS_WRAPPED_KEY";

    await Promise.all(
      allMembers.map((uid) =>
        GroupMember.create({
          group_id,
          member_id: uid,
          role: uid === currentUser ? "owner" : "member",
          wrapped_key: wrappedKey,
        })
      )
    );

    const memberCount = await GroupMember.countDocuments({ group_id });

    res.status(201).json({ ...group._doc, member_count: memberCount });
  } catch (err) {
    console.error("[SOCP][createGroupChat] DB error:", err);
    res.status(400).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------
   RENAME GROUP
------------------------------------------------------------------- */
const renameGroup = asyncHandler(async (req, res) => {
  const { group_id, newName } = req.body;

  if (!group_id || !newName) {
    return res.status(400).json({ error: "Missing group_id or newName" });
  }

  try {
    const updated = await Group.findOneAndUpdate(
      { group_id },
      { $set: { name: newName } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.status(200).json(updated);
  } catch (err) {
    console.error("[SOCP][renameGroup] DB error:", err);
    res.status(400).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------
   ADD MEMBER TO GROUP
------------------------------------------------------------------- */
const addToGroup = asyncHandler(async (req, res) => {
  const { group_id, user_id } = req.body;

  if (!group_id || !user_id) {
    return res.status(400).json({ error: "Missing group_id or user_id" });
  }

  try {
    const exists = await GroupMember.findOne({ group_id, member_id: user_id });
    if (exists) {
      return res.status(400).json({ error: "User already in group" });
    }

    await GroupMember.create({
      group_id,
      member_id: user_id,
      role: "member",
      wrapped_key: "BYPASS_WRAPPED_KEY",
    });

    const updatedCount = await GroupMember.countDocuments({ group_id });
    res.status(200).json({ group_id, member_count: updatedCount });
  } catch (err) {
    console.error("[SOCP][addToGroup] DB error:", err);
    res.status(400).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------
   REMOVE MEMBER FROM GROUP
------------------------------------------------------------------- */
const removeFromGroup = asyncHandler(async (req, res) => {
  const { group_id, user_id } = req.body;

  if (!group_id || !user_id) {
    return res.status(400).json({ error: "Missing group_id or user_id" });
  }

  try {
    const removed = await GroupMember.findOneAndDelete({
      group_id,
      member_id: user_id,
    });
    if (!removed) {
      return res.status(404).json({ error: "User not in group" });
    }

    const remaining = await GroupMember.countDocuments({ group_id });
    res.status(200).json({ group_id, remaining });
  } catch (err) {
    console.error("[SOCP][removeFromGroup] DB error:", err);
    res.status(400).json({ error: err.message });
  }
});

module.exports = {
  accessChat,
  fetchChats,
  createGroupChat,
  renameGroup,
  addToGroup,
  removeFromGroup,
};
