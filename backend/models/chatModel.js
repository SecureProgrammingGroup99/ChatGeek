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
const mongoose = require("mongoose");

const chatSchema = mongoose.Schema(
  {
    chat_id: {
      type: String,
      required: true,
      unique: true,
      default: () => require("uuid").v4(), // optional auto-uuid
    },
    chatName: { type: String, trim: true },
    isGroupChat: { type: Boolean, default: false },
    isCommunity: { type: Boolean, default: false },

    // store UUIDs, not ObjectIds
    users: [
      {
        type: String, // user_id strings
        required: true,
      },
    ],

    latestMessage: {
      type: String, // message_id (UUID)
      required: false,
    },

    groupAdmin: {
      type: String, // user_id of admin
      required: false,
    },

    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Chat", chatSchema);
