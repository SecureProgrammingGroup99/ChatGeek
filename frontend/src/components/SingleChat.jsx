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
  pemToBase64Url,
} from "../utils/crypto";
import { streamFileTransfer, FileReceiver } from "../utils/fileTransfer";

const ENDPOINT = "http://localhost:5001";
let socket, selectedChatCompare;

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
const signDataDM = (ciphertext, from, to, ts) => `${ciphertext}${from}${to}${ts}`;
const signDataPublic = (ciphertext, from, ts) => `${ciphertext}${from}${ts}`;

const normalizePriv = (pk) => {
  if (!pk) return null;
  return pk.includes("BEGIN PRIVATE KEY") ? pemToBase64Url(pk) : pk;
};

// Normalize + decrypt USER_DELIVER frames
const normalizeDeliveredFrame = async (frame, myPrivKey) => {
  const { payload } = frame || {};
  if (!payload || !myPrivKey) return { ...frame, plaintext: "[invalid payload]" };

  // SOCP v1.3 structure
  const { ciphertext, sender_pub, content_sig } = payload;
  const sender = frame.from; // <-- Correct field location
  const normalizedSenderPub = sender_pub.includes("BEGIN PUBLIC KEY")
  ? pemToBase64Url(sender_pub)
  : sender_pub;

  try {
    const plaintext = await decryptMessage(ciphertext, myPrivKey);

<<<<<<< HEAD
    // Prepare canonical verification inputs (SOCP §12)
    const dmString = `${ciphertext}${frame.from}${frame.to}${frame.ts}`;
    const pubString = `${ciphertext}${frame.from}${frame.ts}`;

=======
    // Verify (DM first, then public fallback)
>>>>>>> bee8af7 (Adi's  Bug fixes)
    let ok = false;

    // Try DM pattern first
    try {
      ok = await verifyMessage(dmString, content_sig, normalizedSenderPub);

    } catch (err) {
    
    }

    // Fallback: public channel pattern
    if (!ok) {
      try {
        ok = await verifyMessage(pubString, content_sig, normalizedSenderPub);
      } catch (err) {
      }
    }

    return {
      ...frame,
      from: sender,
      plaintext: ok ? plaintext : "[invalid signature]",
      successful: ok,
    };
  } catch (err) {
    return { ...frame, plaintext: "[decryption failed]", from: sender };
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
  const { selectedChat, setSelectedChat, user, privateKey } = ChatState();
  const fileInputRef = useRef(null);
  const toast = useToast();

<<<<<<< HEAD


  const myPrivKey = privateKey;
  const myPubKey = user.pubkey;

    // convert PEM → Base64URL if needed
  // derive a normalized version
  const normalizedMyPrivKey = myPrivKey.includes("BEGIN PRIVATE KEY")
  ? pemToBase64Url(myPrivKey)
  : myPrivKey;
=======
  const myPrivKey = privateKey ?? null;
  const myPubKey = user?.pubkey ?? null;
>>>>>>> bee8af7 (Adi's  Bug fixes)

  const isDM = selectedChat && !selectedChat.isGroupChat && !selectedChat.isCommunity;
  const isGroup = selectedChat && selectedChat.isGroupChat;
  const isCommunity = selectedChat && selectedChat.isCommunity;

  /* ------------------------------------------------------------------
     Fetch chat history (messages)
  ------------------------------------------------------------------- */
  const fetchMessages = async () => {
    if (!selectedChat || !user?.token || !myPrivKey) return;

    try {
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      setLoading(true);

      const { data: frames } = await axios.get(
        `/api/message/${selectedChat.chat_id}`,
        config
      );

      const normalizedKey = normalizePriv(myPrivKey);
      const normalized = await Promise.all(
<<<<<<< HEAD
        (frames || []).map((f) => normalizeDeliveredFrame(f, normalizedMyPrivKey))
      ); // TODO: f might not be compatible to normalizeDeliveredFrame
=======
        (frames || []).map((f) => normalizeDeliveredFrame(f, normalizedKey))
      );
>>>>>>> bee8af7 (Adi's  Bug fixes)
      setMessages(normalized);
      setLoading(false);

      socket.emit("join chat", selectedChat.chat_id);
    } catch (error) {

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

  // ------------------------------------------------------------------
  // Send text message (DM or Group)
  // ------------------------------------------------------------------
  const sendMessage = async (event) => {
    if (event.key !== "Enter" || !newMessage) return;
    if (!myPrivKey || !myPubKey) {
      toast({
        title: "Key not loaded",
        description: "Load/import your private key to send.",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      const config = {
        headers: {
          "Content-type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
      };

      const ts = Date.now();
      const from = user.user_id;
      const plaintext = newMessage;

      if (!selectedChat?.users || selectedChat.users.length < 2) {
        toast({
          title: "Chat not ready",
          description: "Please reselect or reload the chat.",
          status: "warning",
          duration: 3000,
          isClosable: true,
        });
        return;
      }

      // ---------- Direct Message ----------
      if (isDM) {
        const dmRecipient = selectedChat.users.find((u) => u.user_id !== user.user_id);
        const to = dmRecipient?.user_id;
        const recipientPub = dmRecipient?.pubkey;
<<<<<<< HEAD
        if (!recipientPub) {
=======
        if (!to || !recipientPub) {
          console.error("[SOCP] ❌ DM recipient missing info");
>>>>>>> bee8af7 (Adi's  Bug fixes)
          return;
        }

        const normalizedRecipientPub = recipientPub.includes("BEGIN PUBLIC KEY")
          ? pemToBase64Url(recipientPub)
          : recipientPub;
        const ciphertext = await encryptMessage(plaintext, normalizedRecipientPub);
<<<<<<< HEAD
        const toSign = signDataDM(ciphertext, from, to, ts);
        // derive a normalized version (PEM → Base64URL if needed)
        const normalizedMyPrivKey = myPrivKey.includes("BEGIN PRIVATE KEY")
        ? pemToBase64Url(myPrivKey)
        : myPrivKey;

        const content_sig = await signMessage(toSign, normalizedMyPrivKey);

=======
        const content_sig = await signMessage(
          signDataDM(ciphertext, from, to, ts),
          normalizePriv(myPrivKey)
        );
>>>>>>> bee8af7 (Adi's  Bug fixes)

        const frame = {
          type: "MSG_DIRECT",
          from,
          to,
          ts,
          payload: { ciphertext, sender_pub: myPubKey, content_sig },
          sig: "",
        };

        setNewMessage("");
        const { data: response } = await axios.post("/api/message", frame, config);
        const ok = response?.ok === true;

        // Local echo
        const newFrame = { ...frame, plaintext, successful: ok };
        setMessages((prev) => [...prev, newFrame]);
<<<<<<< HEAD
        const compat = {
          chat: { users: selectedChat.users },
          sender: { user_id: user.user_id },
          frame, // include full SOCP frame if you want backend compatibility later
        };
        socket.emit("new message", compat);
=======

        // Keep your existing event for legacy compatibility
        socket.emit("new message", response);
>>>>>>> bee8af7 (Adi's  Bug fixes)
        return;
      }

      // ---------- Group Message ----------
      if (isGroup) {
        const to = selectedChat.chat_id;
        const members = selectedChat.users.filter((u) => u.user_id !== user.user_id);

        let lastFrame = null;
        let okAll = true;

        for (const member of members) {
          const recipientPub = member?.pubkey;
          if (!recipientPub) continue;

          const normalizedRecipientPub = recipientPub.includes("BEGIN PUBLIC KEY")
            ? pemToBase64Url(recipientPub)
            : recipientPub;
          const ciphertext = await encryptMessage(plaintext, normalizedRecipientPub);
          const content_sig = await signMessage(
            signDataPublic(ciphertext, from, ts),
            normalizePriv(myPrivKey)
          );

          const frame = {
            type: "MSG_PUBLIC_CHANNEL",
            from,
            to, // group_id
            ts,
            payload: { ciphertext, sender_pub: myPubKey, content_sig },
            sig: "",
          };

          try {
            const { data } = await axios.post("/api/message", frame, config);
            if (!data?.ok) okAll = false;
          } catch {
            okAll = false;
          }

<<<<<<< HEAD
          const compat = {
            chat: { users: selectedChat.users },
            sender: { user_id: user.user_id },
            frame, // include full SOCP frame if you want backend compatibility later
          };
          socket.emit("new message", compat); // your existing behavior
          lastFrame = frame;                 // use the last-built frame as representative
=======
          socket.emit("new message", frame);
          lastFrame = frame;
>>>>>>> bee8af7 (Adi's  Bug fixes)
        }

        setNewMessage("");
        if (lastFrame) {
          const echoFrame = { ...lastFrame, plaintext, successful: okAll };
          setMessages((prev) => [...prev, echoFrame]);
        }
        return;
<<<<<<< HEAD
    }
    } 
    catch (err) {
=======
      }
    } catch (err) {
      console.error("[SOCP][sendMessage] error:", err);
>>>>>>> bee8af7 (Adi's  Bug fixes)
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

  // ------------------------------------------------------------------
  // Send File (never transmit blob URLs)
  // ------------------------------------------------------------------
  const sendFile = async () => {
    if (!selectedFile) return;
    if (!myPrivKey || !myPubKey) {
      toast({
        title: "Key not loaded",
        description: "Load/import your private key to send files.",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      const chatId = selectedChat?.chat_id;
      const mode = isDM ? "dm" : "public";
      const from = user.user_id;

      const config = {
        headers: {
          "Content-type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
      };

      // ---------- DM File ----------
      if (isDM) {
        const dmRecipient = selectedChat.users.find((u) => u.user_id !== user.user_id);
        const to = dmRecipient?.user_id;
        const recipientPub = dmRecipient?.pubkey;
<<<<<<< HEAD
        if (!recipientPub) {
=======
        if (!to || !recipientPub) {
          console.error("[SOCP] ❌ Recipient missing for file send");
>>>>>>> bee8af7 (Adi's  Bug fixes)
          return;
        }

        const normalizedRecipientPub = recipientPub.includes("BEGIN PUBLIC KEY")
          ? pemToBase64Url(recipientPub)
          : recipientPub;

        // Stream frames (network)
        for await (const frame of streamFileTransfer(
          selectedFile,
          mode,
          chatId,
          from,
          normalizedRecipientPub,
          normalizePriv(myPrivKey)
        )) {
          const endpoint = `/api/file/${frame.type.split("_")[1].toLowerCase()}`;
          await axios.post(endpoint, frame, config);
          socket.emit("file send", frame);
        }

        // Local optimistic bubble (local URL only; not transmitted)
        const localUrl = URL.createObjectURL(selectedFile);
        const tempMsg = {
          type: "FILE",
          name: selectedFile.name,
          localUrl,           // local-only
          plaintext: `[File: ${selectedFile.name}]`,
          from,
          to,
          ts: Date.now(),
          successful: false,
          temporary: true,    // will be deduped when frames loop back
        };
<<<<<<< HEAD

        setMessages((prev) => [...prev, newFileMsg]);
        const compat = {
          chat: { users: selectedChat.users },
          sender: { user_id: user.user_id },
          frame: newFileMsg,
        };
        socket.emit("new message", compat);
=======
        setMessages((prev) => [...prev, tempMsg]);
>>>>>>> bee8af7 (Adi's  Bug fixes)

        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        toast({ title: "File sent!", status: "success", duration: 2500, isClosable: true });
        return;
      }

      // ---------- Group File ----------
      if (isGroup) {
        const members = selectedChat.users.filter((u) => u.user_id !== user.user_id);

        for (const member of members) {
          const recipientPub = member?.pubkey;
          if (!recipientPub) continue;

          const normalizedRecipientPub = recipientPub.includes("BEGIN PUBLIC KEY")
            ? pemToBase64Url(recipientPub)
            : recipientPub;

          for await (const frame of streamFileTransfer(
            selectedFile,
            mode,
            chatId,
            from,
            normalizedRecipientPub,
            normalizePriv(myPrivKey)
          )) {
            const endpoint = `/api/file/${frame.type.split("_")[1].toLowerCase()}`;
            await axios.post(endpoint, frame, config);
            socket.emit("file send", frame);
          }
        }

        // Local optimistic bubble
        const localUrl = URL.createObjectURL(selectedFile);
        const tempMsg = {
          type: "FILE",
          name: selectedFile.name,
          localUrl,
          plaintext: `[File: ${selectedFile.name}]`,
          from,
          to: chatId,
          ts: Date.now(),
          successful: false,
          temporary: true,
        };
        setMessages((prev) => [...prev, tempMsg]);

<<<<<<< HEAD
        setMessages((prev) => [...prev, newFileMsg]);
        const compat = {
          chat: { users: selectedChat.users },
          sender: { user_id: user.user_id },
          frame: newFileMsg,
        };
        socket.emit("new message", compat); //! SECURITY WARNING: can we send the full file url and plaintext here?
=======
>>>>>>> bee8af7 (Adi's  Bug fixes)
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        toast({ title: "File sent to group!", status: "success", duration: 2500, isClosable: true });
      }
    } catch (err) {
      toast({
        title: "File send failed",
        description: err.message,
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    }
  };

  // ------------------------------------------------------------------
  // Socket Lifecycle (connect only when user + key exist)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!user?.user_id || !myPrivKey) return;
    socket = io(ENDPOINT);
    socket.emit("setup", user);
    socket.on("connected", () => setSocketConnected(true));
    socket.on("typing", () => setIsTyping(true));
    socket.on("stop typing", () => setIsTyping(false));
    return () => {
      socket.off("connected");
      socket.off("typing");
      socket.off("stop typing");
    };
  }, [user?.user_id, myPrivKey]);

  useEffect(() => {
    if (!selectedChat || !myPrivKey) return;
    fetchMessages();
    selectedChatCompare = selectedChat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat, myPrivKey]);

  // Debug: log message changes
  useEffect(() => {
  }, [messages]);

  /* ------------------------------------------------------------------
     Realtime messages (USER_DELIVER frames)
  ------------------------------------------------------------------- */
  useEffect(() => {
    if (!myPrivKey) return;
    const handler = async (frame) => {
<<<<<<< HEAD

      // derive a normalized version (PEM → Base64URL if needed)
      const normalizedMyPrivKey = myPrivKey.includes("BEGIN PRIVATE KEY")
        ? pemToBase64Url(myPrivKey)
        : myPrivKey;
      const normalized = await normalizeDeliveredFrame(frame, normalizedMyPrivKey);

      // If you track per-chat filtering, you can check selectedChatCompare._id here.
=======
      console.log("[SOCP][Message received] Incoming USER_DELIVER:", frame);
      const normalized = await normalizeDeliveredFrame(frame, normalizePriv(myPrivKey));
>>>>>>> bee8af7 (Adi's  Bug fixes)
      setMessages((prev) => [...prev, normalized]);
    };
    socket.on("message received", handler);
    return () => socket.off("message received", handler);
  }, [myPrivKey]);

  /* ------------------------------------------------------------------
     Realtime file frames (FILE_START / CHUNK / END)
  ------------------------------------------------------------------- */
  useEffect(() => {
    if (!myPrivKey) return;
    const receiver = new FileReceiver();

    const fileHandler = async (frame) => {
<<<<<<< HEAD
=======
      console.log("[SOCP] [File frame received] incoming file frame:", frame);
      const result = await receiver.handleMessage(frame, normalizePriv(myPrivKey));
      if (!result) return;
>>>>>>> bee8af7 (Adi's  Bug fixes)

      // Build a local blob URL in THIS browser
      const localUrl = URL.createObjectURL(result.blob);

      const newFileMsg = {
        type: "FILE",
        name: result.name,
        localUrl,                 // local-only (never transmitted)
        plaintext: `[File: ${result.name}]`,
        from: frame.from,
        to: frame.to,
        ts: frame.ts,
        successful: true,
      };

      // Dedup any temporary local bubble from the sender side
      setMessages((prev) => {
        const filtered = prev.filter(
          (m) =>
            !(
              m.type === "FILE" &&
              m.temporary === true &&
              m.name === result.name &&
              m.from === user.user_id
            )
        );
        return [...filtered, newFileMsg];
      });

      toast({
        title: "File received!",
        description: result.name,
        status: "info",
        duration: 4000,
        isClosable: true,
      });
    };

    socket.on("file received", fileHandler);
    return () => socket.off("file received", fileHandler);
  }, [myPrivKey, user?.user_id]);

  // ------------------------------------------------------------------
  // Typing
  // ------------------------------------------------------------------
  const [lastTypeAt, setLastTypeAt] = useState(0);
  const typingHandler = (e) => {
    setNewMessage(e.target.value);
    if (!socketConnected) return;
    if (!typing) {
      setTyping(true);
      socket.emit("typing", selectedChat.chat_id);
    }
    setLastTypeAt(Date.now());
    setTimeout(() => {
      socket.emit("stop typing", selectedChat.chat_id);
      setTyping(false);
    }, 3000);
  };

  // ------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------
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
<<<<<<< HEAD
                {(selectedChat?.chatName
                  ? selectedChat.chatName.toUpperCase()
                  : "NAME UNKNOWN")}
=======
                {selectedChat.chatName?.toUpperCase?.() || selectedChat.name?.toUpperCase?.() || "GROUP"}
>>>>>>> bee8af7 (Adi's  Bug fixes)
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
                        onClick={() => fileInputRef.current?.click()}
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
