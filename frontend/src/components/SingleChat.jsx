import React, { useEffect, useState, useRef } from "react";
import { ChatState } from "../Context/chatProvider";
import {
  Box,
  FormControl,
  IconButton,
  Input,
  Spinner,
  Text,
  useToast,
  InputGroup,
  InputRightElement,
  Button,
} from "@chakra-ui/react";
import { ArrowBackIcon } from "@chakra-ui/icons";
import { getSender, getSenderFull } from "../config/chatlogics";
import ProfileModel from "./misc/profileModel";
import UpdateGroupChatModal from "./misc/UpdateGroupChatModal";
import axios from "axios";
import ScrollableChat from "./ScrollableChat";
import io from "socket.io-client";
import "./styles.css";

import {
  encryptMessage,
  decryptMessage,
  signMessage,
  verifyMessage,
} from "../utils/crypto";
import { streamFileTransfer, FileReceiver } from "../utils/fileTransfer";
import { DUMMY_USERS } from "../utils/cryptoKeysDummy";

const ENDPOINT = "http://localhost:5001";
// eslint-disable-next-line
var socket, selectedChatCompare;

/* ------------------------------------------------------------------
   Centralized key manager (dummy now, real later)
------------------------------------------------------------------- */
const getMyKeys = () => {
    // In production, replace these with keys provisioned at login.
    let pub = localStorage.getItem("my_pubkey");
    let priv = localStorage.getItem("my_privkey");
  
    // Use the dummy sender keys as the default identity
    const defaultPub = DUMMY_USERS.sender.enc_pubkey;
    const defaultPriv = DUMMY_USERS.sender.enc_privkey;
  
    if (!pub || !priv) {
      localStorage.setItem("my_pubkey", defaultPub);
      localStorage.setItem("my_privkey", defaultPriv);
      pub = defaultPub;
      priv = defaultPriv;
    }
  
    return { pub, priv };
  };
  
  
  
/* ------------------------------------------------------------------
   Helper: build sign-data per spec
   DM (original MSG_DIRECT): ciphertext|from|to|ts
   Public (original MSG_PUBLIC_CHANNEL): ciphertext|from|ts
   NOTE: when we only have USER_DELIVER history, we may not know
   original type. We'll try DM-style first; if verify fails, try public-style.
------------------------------------------------------------------- */
const signDataDM = (ciphertext, from, to, ts) => `${ciphertext}${from}${to}${ts}`;
const signDataPublic = (ciphertext, from, ts) => `${ciphertext}${from}${ts}`;

/* ------------------------------------------------------------------
   Normalize + decrypt/verify a single USER_DELIVER frame
   - Bypass when sender_pub is null or content_sig === "BYPASS_SIG"
   - Otherwise decrypt with my private key and verify with sender_pub
------------------------------------------------------------------- */
const normalizeDeliveredFrame = async (frame, myPrivKey) => {
  const { payload } = frame || {};
  if (!payload) return { ...frame, plaintext: "[invalid payload]" };

  const { ciphertext, sender, sender_pub, content_sig } = payload;

  // Real crypto path
  try {
    const plaintext = await decryptMessage(ciphertext, myPrivKey);

    // Try DM verify first (includes 'to'); if fails, try public
    let ok = false;
    try {
      ok = await verifyMessage(
        signDataDM(ciphertext, frame.from, frame.to, frame.ts),
        content_sig,
        sender_pub
      );
    } catch (_) {/* ignore */}

    if (!ok) {
      try {
        ok = await verifyMessage(
          signDataPublic(ciphertext, frame.from, frame.ts),
          content_sig,
          sender_pub
        );
      } catch (_) {/* ignore */}
    }

    return { ...frame, plaintext: ok ? plaintext : "[invalid signature]", sender };
  } catch (err) {
    console.error("[SOCP] [normalizeDeliveredFrame] Decrypt failed:", err);
    return { ...frame, plaintext: "[normalizeDeliveredFrame] [decryption failed]", sender };
  }
};

const SingleChat = ({ fetchAgain, setFetchAgain }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  const [istyping, setIsTyping] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  const toast = useToast();

  const { selectedChat, setSelectedChat, user } = ChatState();
  const isDM = selectedChat && !selectedChat.isGroupChat && !selectedChat.isCommunity;
  const isGroup = selectedChat && selectedChat.isGroupChat;
  const isCommunity = selectedChat && selectedChat.isCommunity;

  /* ------------------------------------------------------------------
     Fetch chat history (messages + optional files)
     Expects array of USER_DELIVER frames for messages.
     (If/when you add a file-history endpoint, merge it here.)
  ------------------------------------------------------------------- */
  const fetchMessages = async () => {
    if (!selectedChat) return;

    try {
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      setLoading(true);

      // NEW: history returns a list of USER_DELIVER frames
      const { data: frames } = await axios.get(
        `/api/message/${selectedChat._id}`,
        config
      );

      const { priv } = getMyKeys();

      // Decrypt/verify (or bypass) every frame in history
      const normalized = await Promise.all(
        (frames || []).map((f) => normalizeDeliveredFrame(f, priv))
      );

      // If you add /api/file/history/:chatId later, fetch it and push entries like:
      // normalized.push({ type: "FILE", name, url, plaintext: `[File: ${name}]` })

      setMessages(normalized);
      setLoading(false);

      // Join room for realtime updates
      socket.emit("join chat", selectedChat._id);
    } catch (error) {
      console.error("[SOCP] fetchMessages error:", error);
      setLoading(false);
      toast({
        title: "Error Occurred",
        description: "Failed to load messages",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
    }
  };

  /* ------------------------------------------------------------------
     Send text message (build MSG_DIRECT or MSG_PUBLIC_CHANNEL)
     If missing keys → bypass (plaintext + BYPASS_SIG)
  ------------------------------------------------------------------- */
  const sendMessage = async (event) => {
    if (event.key !== "Enter" || !newMessage) return;
  
    try {
      const config = {
        headers: {
          "Content-type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
      };
  
      const { pub, priv } = getMyKeys();
      const ts = Date.now();
      const from = user._id;
      const plaintext = newMessage;
  
      // --- For DM ---
      if (isDM) {
        console.log("[SOCP][sendMessage] Preparing DM message");
        const dmRecipient = selectedChat.users.find((u) => u._id !== user._id);
        const to = dmRecipient._id;
        const recipientPub = dmRecipient?.pubkey || DUMMY_USERS.recipient.enc_pubkey;; // TODO: fallback to my own pubkey (testing)
        
        console.log("[SOCP][sendMessage] Encrypting message for recipient:", to);
        const ciphertext = await encryptMessage(plaintext, recipientPub);
        console.log("[SOCP][sendMessage] Encryption done, signing message");
        const toSign = signDataDM(ciphertext, from, to, ts);
        const content_sig = await signMessage(toSign, priv);
        
        console.log("[SOCP][sendMessage] DM encryption and signing done");
        const frame = {
          type: "MSG_DIRECT",
          from,
          to,
          ts,
          payload: { ciphertext, sender_pub: pub, content_sig },
          sig: "",
        };
  
        setNewMessage("");
        console.log("[SOCP][sendMessage] Outgoing DM frame:", frame);
  
        const { data } = await axios.post("/api/message", frame, config);
        socket.emit("new message", data);
        setMessages((prev) => [...prev, { ...data, plaintext }]);
        return;
      }
  
      // --- For GROUP ---
      if (isGroup) {
        const to = selectedChat._id;
        const members = selectedChat.users.filter((u) => u._id !== user._id);
  
        for (const member of members) {
          const recipientPub = member?.pubkey || DUMMY_USERS.recipient.enc_pubkey;; // TODO; fallback: my own key for testing
          const ciphertext = await encryptMessage(plaintext, recipientPub);
          const toSign = signDataPublic(ciphertext, from, ts);
          const content_sig = await signMessage(toSign, priv);
  
          const frame = {
            type: "MSG_PUBLIC_CHANNEL",
            from,
            to,
            ts,
            payload: { ciphertext, sender_pub: pub, content_sig },
            sig: "",
          };
  
          console.log("[SOCP][sendMessage] Outgoing group frame for", member._id, ":", frame);
          await axios.post("/api/message", frame, config);
          socket.emit("new message", frame);
        }
  
        setNewMessage("");
        setMessages((prev) => [...prev, { plaintext, from, to, ts, type: "MSG_PUBLIC_CHANNEL" }]);
        return;
      }
  
      // --- Community (unsupported) ---
      toast({
        title: "Unsupported Chat Type",
        description: "Community chats are disabled in this version.",
        status: "error",
        duration: 4000,
        isClosable: true,
        position: "bottom",
      });
    } catch (err) {
      console.error("[SOCP][sendMessage] error:", err);
      toast({
        title: "Error Occurred",
        description: "Failed to send message",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
    }
  };
  

  /* ------------------------------------------------------------------
     Send file (stream). If missing recipient pubkey → we still try
     to encrypt to self (fallback) OR you could bypass, but chunk
     bypass complicates reassembly; keep encryption if possible.
  ------------------------------------------------------------------- */
  const sendFile = async () => {
    if (!selectedFile) {
      console.warn("[SOCP][sendFile] No file selected — exiting early");
      return;
    }
  
    console.log("[SOCP][sendFile] Starting file send process...");
    console.log("[SOCP][sendFile] selectedFile:", selectedFile);
  
    try {
      const chatId = selectedChat?._id;
      const mode = isDM ? "dm" : "public";
      const { pub } = getMyKeys();
      const from = user._id;
  
      console.log("[SOCP][sendFile] chatId:", chatId);
      console.log("[SOCP][sendFile] mode:", mode);
      console.log("[SOCP][sendFile] sender (from):", from);
      console.log("[SOCP][sendFile] my pubkey (first 80 chars):", pub?.slice(0, 80) + "...");
  
      const config = {
        headers: {
          "Content-type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
      };
  
      // --- For Direct Messages ---
      if (isDM) {
        console.log("[SOCP][sendFile] Mode: Direct Message");
        const dmRecipient = selectedChat.users.find((u) => u._id !== user._id);
        console.log("[SOCP][sendFile] dmRecipient:", dmRecipient);
  
        const recipientPub = dmRecipient?.pubkey || DUMMY_USERS.recipient.enc_pubkey;
        console.log("[SOCP][sendFile] Using recipientPub (first 80 chars):", recipientPub?.slice(0, 80) + "...");
  
        try {
          for await (const frame of streamFileTransfer(
            selectedFile,
            mode,
            chatId,
            from,
            recipientPub
          )) {
            console.log("[SOCP][sendFile] Prepared frame:", frame);
  
            const endpoint = `/api/file/${frame.type.split("_")[1].toLowerCase()}`;
            console.log("[SOCP][sendFile] → POST", endpoint);
  
            const res = await axios.post(endpoint, frame, config);
            console.log("[SOCP][sendFile] ✔️ Frame sent successfully. Server response:", res.status);
  
            socket.emit("file send", frame);
            console.log("[SOCP][sendFile] 📡 Emitted 'file send' socket event");
          }
        } catch (innerErr) {
          console.error("[SOCP][sendFile] ❌ Error inside stream loop (DM):", innerErr);
          throw innerErr;
        }

    // ✅ Add local message just like sendMessage()
    const fileUrl = URL.createObjectURL(selectedFile);
    const newFileMsg = {
      type: "FILE",
      name: selectedFile.name,
      url: fileUrl,
      plaintext: `[File: ${selectedFile.name}]`,
      from: user._id,
      to: dmRecipient._id,
      ts: Date.now(),
    };

    setMessages((prev) => [...prev, newFileMsg]);
    socket.emit("new message", newFileMsg); // ✅ mirror to receiver
    console.log("[SOCP][sendFile] 📎 File message emitted via 'new message' socket event");

  
        toast({
          title: "File sent successfully!",
          status: "success",
          duration: 3000,
          isClosable: true,
        });
        setSelectedFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = ""; // ✅ Reset native file input value
          }
        console.log("[SOCP][sendFile] File cleared from UI after send");
        return;
      }
  
      // --- For Group Chats (SOCP fan-out) ---
      if (isGroup) {
        console.log("[SOCP][sendFile] Mode: Group Chat");
        const members = selectedChat.users.filter((u) => u._id !== user._id);
        console.log("[SOCP][sendFile] members:", members.map((m) => m._id));
  
        try {
          for (const member of members) {
            const recipientPub = member?.pubkey || DUMMY_USERS.recipient.enc_pubkey;
            console.log(`[SOCP][sendFile] Encrypting for member ${member._id}, pubkey starts:`, recipientPub?.slice(0, 80) + "...");
  
            for await (const frame of streamFileTransfer(
              selectedFile,
              mode,
              chatId,
              from,
              recipientPub
            )) {
              console.log(`[SOCP][sendFile] Prepared frame for member ${member._id}:`, frame);
  
              const endpoint = `/api/file/${frame.type.split("_")[1].toLowerCase()}`;
              console.log("[SOCP][sendFile] → POST", endpoint);
  
              const res = await axios.post(endpoint, frame, config);
              console.log(`[SOCP][sendFile] ✔️ Frame sent for ${member._id}. Server response:`, res.status);
  
              socket.emit("file send", frame);
              console.log(`[SOCP][sendFile] 📡 Emitted 'file send' for ${member._id}`);
            }
          }
        } catch (innerErr) {
          console.error("[SOCP][sendFile] ❌ Error inside stream loop (Group):", innerErr);
          throw innerErr;
        }

        const fileUrl = URL.createObjectURL(selectedFile);
        const newFileMsg = {
            type: "FILE",
            name: selectedFile.name,
            url: fileUrl,
            plaintext: `[File: ${selectedFile.name}]`,
            from: user._id,
            to: selectedChat._id,
            ts: Date.now(),
        };

        setMessages((prev) => [...prev, newFileMsg]);
        socket.emit("new message", newFileMsg);
        console.log("[SOCP][sendFile] 📎 File message broadcast via 'new message' socket event (group)");

  
        toast({
          title: "File sent to group successfully!",
          status: "success",
          duration: 3000,
          isClosable: true,
        });
        setSelectedFile(null);
        console.log("[SOCP][sendFile] File cleared from UI after group send");
        return;
      }
  
      // --- Unsupported Chat Type ---
      console.warn("[SOCP][sendFile] Unsupported chat type");
      toast({
        title: "Unsupported Chat Type",
        description: "Community file transfer not supported.",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    } catch (error) {
      console.error("[SOCP][sendFile] ❌ Top-level sendFile error:", error);
      toast({
        title: "File send failed",
        description: error?.message || "Unknown error",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    }
  };
  

  /* ------------------------------------------------------------------
     Socket lifecycle
  ------------------------------------------------------------------- */
  useEffect(() => {
    socket = io(ENDPOINT);
    socket.emit("setup", user);
    socket.on("connected", () => setSocketConnected(true));
    socket.on("typing", () => setIsTyping(true));
    socket.on("stop typing", () => setIsTyping(false));
  }, [user]);

  useEffect(() => {
    fetchMessages();
    selectedChatCompare = selectedChat;
    // eslint-disable-next-line
  }, [selectedChat]);

  /* ------------------------------------------------------------------
     Realtime messages (USER_DELIVER frames)
  ------------------------------------------------------------------- */
  useEffect(() => {
    const handler = async (frame) => {
      console.log("[SOCP][Message received] Incoming USER_DELIVER:", frame);
      const { priv } = getMyKeys();
      const normalized = await normalizeDeliveredFrame(frame, priv);

      // If you track per-chat filtering, you can check selectedChatCompare._id here.
      setMessages((prev) => [...prev, normalized]);
    };

    socket.on("message received", handler);
    return () => socket.off("message received", handler);
  }, []);

  /* ------------------------------------------------------------------
     Realtime file frames (FILE_START / CHUNK / END)
  ------------------------------------------------------------------- */
  useEffect(() => {
    const receiver = new FileReceiver();

    const fileHandler = async (frame) => {
      console.log("[SOCP] [File frame received] incoming file frame:", frame);
      const { priv } = getMyKeys();
      const result = await receiver.handleMessage(frame, priv);
      if (result) {
        const url = URL.createObjectURL(result.blob);
        setMessages((prev) => [
          ...prev,
          { type: "FILE", name: result.name, url, plaintext: `[File: ${result.name}]` },
        ]);
        toast({
          title: "File received!",
          description: result.name,
          status: "info",
          duration: 4000,
          isClosable: true,
        });
      }
    };

    socket.on("file received", fileHandler);
    return () => socket.off("file received", fileHandler);
  }, []);

  /* ------------------------------------------------------------------
     Typing handler
  ------------------------------------------------------------------- */
  const [lastTypeAt, setLastTypeAt] = useState(0);
  const typingHandler = (e) => {
    setNewMessage(e.target.value);
    if (!socketConnected) return;
    if (!typing) {
      setTyping(true);
      socket.emit("typing", selectedChat._id);
    }
    const now = Date.now();
    setLastTypeAt(now);
    setTimeout(() => {
      if (Date.now() - now >= 3000 && typing) {
        socket.emit("stop typing", selectedChat._id);
        setTyping(false);
      }
    }, 3000);
  };

  /* ------------------------------------------------------------------
     UI
  ------------------------------------------------------------------- */
  return (
    <>
      {selectedChat ? (
        <>
          {/* ---------- HEADER ---------- */}
          <Text
            fontSize={{ base: "20px", md: "30px" }}
            pb={3}
            px={2}
            w="100%"
            fontFamily="Work Sans"
            display="flex"
            justifyContent={{ base: "space-between" }}
            alignItems="center"
          >
            <IconButton
              display={{ base: "flex", md: "none" }}
              icon={<ArrowBackIcon />}
              onClick={() => setSelectedChat("")}
            />

            {isDM && (
              <>
                {getSender(user, selectedChat.users)}
                <ProfileModel user={getSenderFull(user, selectedChat.users)} />
              </>
            )}

            {isGroup && (
              <>
                {selectedChat.chatName.toUpperCase()}
                <UpdateGroupChatModal
                  fetchAgain={fetchAgain}
                  setFetchAgain={setFetchAgain}
                  fetchMessages={fetchMessages}
                />
              </>
            )}
          </Text>

          {/* ---------- CHAT AREA ---------- */}
          <Box
            display="flex"
            flexDir="column"
            justifyContent="flex-end"
            p={3}
            bg="#E8E8E8"
            w="100%"
            h="100%"
            borderRadius="lg"
            overflowY="hidden"
          >
            {loading ? (
              <Spinner size="xl" w={20} h={20} alignSelf="center" margin="auto" />
            ) : (
              <ScrollableChat messages={messages} />
            )}

            {/* ---------- INPUT ---------- */}
            {(isDM || isGroup) && (
              <FormControl onKeyDown={sendMessage} isRequired mt={3}>
                {istyping && (
                  <div className="typing" style={{ width: "5rem", marginBottom: 10 }}>
                    Typing
                    <div className="dot" />
                    <div className="dot" />
                    <div className="dot" />
                  </div>
                )}

                {selectedFile && (
                  <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="space-between"
                    bg="gray.100"
                    p={2}
                    mb={2}
                    borderRadius="md"
                  >
                    <Text>{selectedFile.name}</Text>
                    <Button size="sm" colorScheme="blue" onClick={sendFile}>
                      Send attachment
                    </Button>
                  </Box>
                )}

                <InputGroup>
                  <Input
                    variant="filled"
                    bg="#fff"
                    placeholder="Enter a Message"
                    onChange={typingHandler}
                    value={newMessage}
                  />
                  <InputRightElement>
                    <>
                      <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: "none" }}
                        onChange={(e) => {
                          if (e.target.files.length > 0) {
                            setSelectedFile(e.target.files[0]);
                          }
                        }}
                      />
                      <span
                        role="img"
                        aria-label="attach file"
                        style={{ cursor: "pointer" }}
                        onClick={() => fileInputRef.current.click()}
                      >
                        📎
                      </span>
                    </>
                  </InputRightElement>
                </InputGroup>
              </FormControl>
            )}

            {isCommunity && (
              <Box
                display="flex"
                justifyContent="center"
                alignItems="center"
                bg="#fff0f0"
                p={4}
                mt={4}
                borderRadius="lg"
                border="1px solid #ffcccc"
              >
                <Text color="red.600" fontWeight="semibold">
                  ❌ This feature is not supported in the current version. (Community chat)
                </Text>
              </Box>
            )}
          </Box>
        </>
      ) : (
        <Box display="flex" alignItems="center" justifyContent="center" h="100%">
          <Text fontSize="3xl" pb={3} fontFamily="Work Sans">
            Click on a User to start Chatting
          </Text>
        </Box>
      )}
    </>
  );
};

export default SingleChat;
