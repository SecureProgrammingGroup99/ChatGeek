const asyncHandler = require("express-async-handler");
const Message = require("../models/messageModel");
const User = require("../models/userModel");
const Chat = require("../models/chatModel");

// =======================================================
// Unified handler for both legacy DB messages and SOCP v1.3 envelopes
// =======================================================
const sendMessage = asyncHandler(async (req, res) => {
  const body = req.body || {};

  // --- Case 1: Legacy DB message (chatId + content) ---
  if (body.chatId && body.content) {
    const { content, chatId } = body;

    try {
      const newMessage = {
        sender: req.user._id,
        content,
        chat: chatId,
      };

      let message = await Message.create(newMessage);
      message = await message.populate("sender", "name pic");
      message = await message.populate("chat");
      message = await User.populate(message, {
        path: "chat.users",
        select: "name pic email",
      });

      await Chat.findByIdAndUpdate(chatId, { latestMessage: message });
      return res.json(message);
    } catch (error) {
      console.error("[SOCP][Legacy] DB message failed:", error);
      res.status(400);
      throw new Error(error.message);
    }
  }

  // --- Case 2: SOCP envelope (type + from + to + payload) ---
  const { type, from, to, ts, payload } = body;

  if (!type || !from || !to || !payload) {
    console.log("[SOCP][ERROR] Invalid message envelope:", body);
    return res.status(400).json({ error: "Invalid SOCP envelope" });
  }

  console.log("[SOCP][RX]", type, "from", from, "to", to);

  if (type === "MSG_DIRECT") {
    const deliver = {
      type: "USER_DELIVER",
      from: "server_1",
      to: to,
      ts: Date.now(),
      payload: {
        ciphertext: payload.ciphertext,
        sender: from,
        sender_pub: payload.sender_pub,
        content_sig: payload.content_sig,
      },
      sig: "<server_signature_placeholder>",
    };

    console.log("[SOCP][DM_DELIVER]", JSON.stringify(deliver, null, 2));
    return res.status(200).json(deliver);
  }

  if (type === "MSG_PUBLIC_CHANNEL") {
    const deliver = {
      type: "USER_DELIVER",
      from: "server_1",
      to: "public_channel",
      ts: Date.now(),
      payload: {
        ciphertext: payload.ciphertext,
        sender: from,
        sender_pub: payload.sender_pub,
        content_sig: payload.content_sig,
      },
      sig: "<server_signature_placeholder>",
    };

    console.log("[SOCP][PUB_DELIVER]", JSON.stringify(deliver, null, 2));
    return res.status(200).json(deliver);
  }

  console.log("[SOCP][WARN] Unsupported message type:", type);
  return res.status(400).json({ error: "Unsupported message type" });
});

// =======================================================
const allMessage = asyncHandler(async (req, res) => {
  try {
    const messages = await Message.find({ chat: req.params.chatId })
      .populate("sender", "name pic email")
      .populate("chat");
    res.json(messages);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

module.exports = { sendMessage, allMessage };
