const asyncHandler = require("express-async-handler");
const Message = require("../models/messageModel");
const User = require("../models/userModel");
const Group = require("../models/groupModel");
const { v4: uuidv4 } = require("uuid");

/* ------------------------------------------------------------------
   /api/message (SOCP v1.3 compliant)
   Accepts full JSON envelope from client
------------------------------------------------------------------- */
// ! important: POST /api/message

const sendMessage = asyncHandler(async (req, res) => {
  const frame = req.body || {};

  // -------------------------------
  // 1. Basic validation of envelope
  // -------------------------------
  if (!frame?.type || !frame?.from || !frame?.to) {
    return res.status(400).json({
      ok: false,
      error: "Invalid envelope: missing type/from/to",
    });
  }

  const { type, from, to, ts, payload, sig } = frame;
  const timestamp = Number.isInteger(ts) ? ts : Date.now();
  const toUserId = to;
  const chatId = null;

  // -------------------------------
  // 2. Decide mode + payload for network
  // -------------------------------
  let mode, payloadForNetwork;

  if (payload?.ciphertext) {
    const signature = payload.content_sig;
    if (!signature) {
      return res
        .status(400)
        .json({ ok: false, error: "missing_signature_for_ciphertext" });
    }
    mode = "encrypted";
    payloadForNetwork = {
      ciphertext: payload.ciphertext,
      signature: signature,
    };
  } else if (
    typeof payload?.content === "string" &&
    payload.content.length > 0
  ) {
    mode = "plaintext";
    payloadForNetwork = { content: payload.content };
  } else {
    return res.status(400).json({ ok: false, error: "missing_message_body" });
  }

  // -------------------------------
  // 3. Save message locally
  // -------------------------------
  const message_id = uuidv4();
  const messageDoc = {
    message_id,
    group_id: type === "MSG_PUBLIC_CHANNEL" ? "public" : "direct",
    sender_id: from,
    recipient_id: type === "MSG_DIRECT" ? to : null,
    ciphertext: payload.ciphertext || null,
    sender_pub: payload.sender_pub || null,
    content_sig: payload.content_sig || null,
    timestamp,
    message_type: type,
    version: 1,
  };

  try {
    await Message.create(messageDoc);

    if (type === "MSG_PUBLIC_CHANNEL") {
      await Group.updateOne(
        { group_id: "public" },
        { $set: { "meta.latest_message": message_id } }
      );
    }

    // -------------------------------
    // 4. Forward to overlay network (same as SLC)
    // -------------------------------
    if (!req.app.locals?.network?.sendServerDeliver) {
      console.error("[SOCP][sendMessage] ❌ network_api_missing");
      return res.status(500).json({ ok: false, error: "network_api_missing" });
    }

    await req.app.locals.network.sendServerDeliver(
      toUserId,
      payloadForNetwork,
      { chatId, mode }
    );

    // -------------------------------
    // 5. Local HTTP ack (to sender only)
    // -------------------------------
    return res.status(200).json({
      ok: true,
      payload_ofSender: frame,
    });
  } catch (err) {
    console.error("[SOCP][sendMessage] Error:", err);
    return res.status(500).json({
      type: "ERROR",
      from: req.app.locals.server_id || "server_1",
      to: from || "unknown",
      ts: Date.now(),
      payload: { code: "SERVER_ERROR", detail: err.message },
      sig: "",
    });
  }
});
/* ------------------------------------------------------------------
   GET ALL MESSAGES IN CHAT OR GROUP
------------------------------------------------------------------- */
const allMessage = asyncHandler(async (req, res) => {
  const { chatId } = req.params; // can be group_id or 'direct'

  try {
    const messages = await Message.find({ group_id: chatId })
      .sort({ timestamp: 1 })
      .lean();

    // Optional: attach display sender info
    const enriched = await Promise.all(
      messages.map(async (m) => {
        const sender = await User.findOne({ user_id: m.sender_id }).select(
          "user_id login_email meta.display_name meta.avatar_url"
        );
        return { ...m, sender };
      })
    );

    res.status(200).json(enriched);
  } catch (err) {
    console.error("[SOCP][allMessage] DB error:", err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = { sendMessage, allMessage };
