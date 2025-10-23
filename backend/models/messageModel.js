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

const messageSchema = mongoose.Schema(
  {
    message_id: {
      type: String,
      required: true,
      unique: true,
    },
    group_id: {
      type: String,
      required: true,
    },
    sender_id: {
      type: String,
      required: true,
    },
    ciphertext: {
      // Changed from content to ciphertext
      type: String,
      required: true,
    },
    sender_pub: {
      // Sender's public key for signature verification
      type: String,
      required: true,
    },
    content_sig: {
      // Signature over ciphertext|from|to|ts
      type: String,
      required: true,
    },
    timestamp: {
      // SOCP timestamp (Unix milliseconds)
      type: Number,
      required: true,
    },
    message_type: {
      // Direct message or public channel
      type: String,
      enum: [
        "MSG_DIRECT", //  Direct message (DM)
        "MSG_PUBLIC_CHANNEL", //  Public channel message
        "FILE_START", //  File manifest
        "FILE_CHUNK", //  File chunk
        "FILE_END", //  File completion notice
      ],
      required: true,
    },
    recipient_id: {
      // For direct messages (optional for public channel)
      type: String,
      required: false,
    },
    // Optional metadata for display
    meta: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    version: {
      type: Number,
      required: true,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// Index for querying messages by group and time
messageSchema.index({ group_id: 1, timestamp: -1 });

// Index for direct messages between users
messageSchema.index({ sender_id: 1, recipient_id: 1, timestamp: -1 });

const Message = mongoose.model("Message", messageSchema);
module.exports = Message;
