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
const { protect } = require("../middleware/authMiddleware");
const {
  accessChat,
  fetchChats,
  createGroupChat,
  renameGroup,
  addToGroup,
  removeFromGroup,
} = require("../controllers/chatControllers");

const router = express.Router();

// Direct (DM) chat creation + fetching
router.route("/").post(protect, accessChat).get(protect, fetchChats);
/*
This line means:

For HTTP POST /api/chat, Express will execute:
  1. protect
  2. then accessChat

  When a POST request comes in:
  1. Express builds a req (request) and res (response) object.
  2. It calls the first function (middleware1(req, res, next)).
  3. If that function calls next(), Express moves on to the next one (middleware2(req, res, next)).
  4. If any middleware sends a response or throws an error, the chain stops.

For HTTP GET /api/chat, Express will execute:
  1. protect
  2. then fetchChats
*/

// Group management
router.post("/group", protect, createGroupChat);
router.put("/rename", protect, renameGroup);
router.put("/group/add", protect, addToGroup);
router.put("/group/remove", protect, removeFromGroup);

module.exports = router;
