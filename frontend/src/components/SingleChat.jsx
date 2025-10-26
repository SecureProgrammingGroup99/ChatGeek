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
let socket;
let selectedChatCompare = null;

// --------------------------------------------------------------
// Helpers
// --------------------------------------------------------------
const normalizeKey = (key) =>
  !key ? null : key.includes("BEGIN ") ? pemToBase64Url(key) : key;

const signDataDM = (ciphertext, from, to, ts) => `${ciphertext}${from}${to}${ts}`;
const signDataPublic = (ciphertext, from, ts) => `${ciphertext}${from}${ts}`;

const getGroupTitle = (c) => {
  if (!c) return "GROUP";
  const t =
    c.chatName || c.name || c.group_name || c.title || c.meta?.display_name;
  return (t && String(t)) ? t : "GROUP";
};

const frameBelongsHere = (frame, me, current) => {
  if (!current) return false;
  const isGroup = !!current.isGroupChat;

  if (isGroup) {
    return frame.type === "MSG_PUBLIC_CHANNEL" && frame.to === current.chat_id;
  }

  const peer =
    (current.users || []).find((u) => u.user_id !== me.user_id)?.user_id || null;
  if (!peer) return false;
  const aToB = frame.from === me.user_id && frame.to === peer;
  const bToA = frame.from === peer && frame.to === me.user_id;
  return frame.type === "MSG_DIRECT" && (aToB || bToA);
};

// Normalize + decrypt USER_DELIVER frames
const normalizeDeliveredFrame = async (frame, myPrivKeyNormalized) => {
  const { payload } = frame || {};
  if (!payload || !myPrivKeyNormalized) {
    return { ...frame, plaintext: "[invalid payload]" };
  }

  const { ciphertext, sender_pub, content_sig } = payload;
  const sender = frame.from;
  const normalizedSenderPub = normalizeKey(sender_pub);

  try {
    const plaintext = await decryptMessage(ciphertext, myPrivKeyNormalized);

    const dmString = `${ciphertext}${frame.from}${frame.to}${frame.ts}`;
    const pubString = `${ciphertext}${frame.from}${frame.ts}`;

    let ok = false;
    try {
      ok = await verifyMessage(dmString, content_sig, normalizedSenderPub);
    } catch (_) {}

    if (!ok) {
      try {
        ok = await verifyMessage(pubString, content_sig, normalizedSenderPub);
      } catch (_) {}
    }

    return {
      ...frame,
      from: sender,
      plaintext: ok ? plaintext : "[invalid signature]",
      successful: ok,
    };
  } catch (_) {
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

  const myPrivKey = privateKey ?? null;
  const myPubKey = user?.pubkey ?? null;

  const isDM = selectedChat && !selectedChat.isGroupChat && !selectedChat.isCommunity;
  const isGroup = selectedChat && selectedChat.isGroupChat;
  const isCommunity = selectedChat && selectedChat.isCommunity;

  // --------------------------------------------------------------
  // Fetch chat history
  // --------------------------------------------------------------
  const fetchMessages = async () => {
    if (!selectedChat || !user?.token || !myPrivKey) return;

    try {
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      setLoading(true);

      const { data: frames } = await axios.get(
        `/api/message/${selectedChat.chat_id}`,
        config
      );

      const normalizedKey = normalizeKey(myPrivKey);
      const normalized = await Promise.all(
        (frames || []).map((f) => normalizeDeliveredFrame(f, normalizedKey))
      );

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

  // --------------------------------------------------------------
  // Send text message (DM / Group)
  // --------------------------------------------------------------
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

      // ---------- DM ----------
      if (isDM) {
        const dmRecipient = selectedChat.users.find(
          (u) => u.user_id !== user.user_id
        );
        const to = dmRecipient?.user_id;
        const recipientPub = dmRecipient?.pubkey;
        if (!to || !recipientPub) return;

        const normalizedRecipientPub = normalizeKey(recipientPub);
        const ciphertext = await encryptMessage(plaintext, normalizedRecipientPub);
        const content_sig = await signMessage(
          signDataDM(ciphertext, from, to, ts),
          normalizeKey(myPrivKey)
        );

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

        // local echo
        setMessages((prev) => [...prev, { ...frame, plaintext, successful: ok }]);

        // keep existing compatibility shape
        socket.emit("new message", {
          chat: { users: selectedChat.users },
          sender: { user_id: user.user_id },
          frame,
        });
        return;
      }

      // ---------- Group ----------
      if (isGroup) {
        const to = selectedChat.chat_id;
        const members = selectedChat.users.filter((u) => u.user_id !== user.user_id);

        const normalizedPriv = normalizeKey(myPrivKey);
        let okAll = true;
        let lastFrame = null;

        for (const member of members) {
          const recipientPub = member?.pubkey;
          if (!recipientPub) continue;

          const normalizedRecipientPub = normalizeKey(recipientPub);
          const ciphertext = await encryptMessage(plaintext, normalizedRecipientPub);
          const content_sig = await signMessage(
            signDataPublic(ciphertext, from, ts),
            normalizedPriv
          );

          const frame = {
            type: "MSG_PUBLIC_CHANNEL",
            from,
            to, // group id
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

          socket.emit("new message", {
            chat: { users: selectedChat.users },
            sender: { user_id: user.user_id },
            frame,
          });
          lastFrame = frame;
        }

        setNewMessage("");
        if (lastFrame) {
          setMessages((prev) => [
            ...prev,
            { ...lastFrame, plaintext, successful: okAll },
          ]);
        }
      }
    } catch (err) {
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

  // --------------------------------------------------------------
  // Send File
  // --------------------------------------------------------------
  const sendFile = async () => {
    if (!selectedFile || !myPrivKey || !myPubKey) return;

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

      if (isDM) {
        const dmRecipient = selectedChat.users.find(
          (u) => u.user_id !== user.user_id
        );
        const to = dmRecipient?.user_id;
        const recipientPub = dmRecipient?.pubkey;
        if (!to || !recipientPub) return;

        const normalizedRecipientPub = normalizeKey(recipientPub);

        for await (const frame of streamFileTransfer(
          selectedFile,
          mode,
          chatId,
          from,
          normalizedRecipientPub,
          normalizeKey(myPrivKey)
        )) {
          const endpoint = `/api/file/${frame.type.split("_")[1].toLowerCase()}`;
          await axios.post(endpoint, frame, config);
          socket.emit("file send", frame);
        }

        const localUrl = URL.createObjectURL(selectedFile);
        const newFileMsg = {
          type: "FILE",
          name: selectedFile.name,
          localUrl, // local-only
          plaintext: `[File: ${selectedFile.name}]`,
          from,
          to,
          ts: Date.now(),
          successful: true,
        };

        setMessages((prev) => [...prev, newFileMsg]);
        socket.emit("new message", {
          chat: { users: selectedChat.users },
          sender: { user_id: user.user_id },
          frame: newFileMsg,
        });

        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        toast({ title: "File sent successfully!", status: "success" });
        return;
      }

      // Group
      if (isGroup) {
        const members = selectedChat.users.filter((u) => u.user_id !== user.user_id);

        for (const member of members) {
          const recipientPub = member?.pubkey;
          if (!recipientPub) continue;

          const normalizedRecipientPub = normalizeKey(recipientPub);

          for await (const frame of streamFileTransfer(
            selectedFile,
            mode,
            chatId,
            from,
            normalizedRecipientPub,
            normalizeKey(myPrivKey)
          )) {
            const endpoint = `/api/file/${frame.type.split("_")[1].toLowerCase()}`;
            await axios.post(endpoint, frame, config);
            socket.emit("file send", frame);
          }
        }

        const localUrl = URL.createObjectURL(selectedFile);
        const newFileMsg = {
          type: "FILE",
          name: selectedFile.name,
          localUrl,
          plaintext: `[File: ${selectedFile.name}]`,
          from,
          to: chatId,
          ts: Date.now(),
          successful: true,
        };

        setMessages((prev) => [...prev, newFileMsg]);
        socket.emit("new message", {
          chat: { users: selectedChat.users },
          sender: { user_id: user.user_id },
          frame: newFileMsg,
        });

        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        toast({ title: "File sent to group!", status: "success" });
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

  // --------------------------------------------------------------
  // Socket lifecycle
  // --------------------------------------------------------------
  useEffect(() => {
    if (!user?.user_id || !myPrivKey) return;

    socket = io(ENDPOINT);
    socket.emit("setup", user);

    const onConnected = () => setSocketConnected(true);
    const onTyping = () => setIsTyping(true);
    const onStopTyping = () => setIsTyping(false);

    socket.on("connected", onConnected);
    socket.on("typing", onTyping);
    socket.on("stop typing", onStopTyping);

    return () => {
      socket.off("connected", onConnected);
      socket.off("typing", onTyping);
      socket.off("stop typing", onStopTyping);
      socket.disconnect();
    };
  }, [user?.user_id, myPrivKey]);

  // When switching chats, clear and refetch
  useEffect(() => {
    if (!selectedChat || !myPrivKey) return;
    setMessages([]);
    selectedChatCompare = selectedChat;
    fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat, myPrivKey]);

  // --------------------------------------------------------------
  // Realtime message frames
  // --------------------------------------------------------------
  useEffect(() => {
    if (!myPrivKey) return;

    const handler = async (frame) => {
      if (!frameBelongsHere(frame, user, selectedChatCompare)) return;

      const normalized = await normalizeDeliveredFrame(
        frame,
        normalizeKey(myPrivKey)
      );
      setMessages((prev) => [...prev, normalized]);
    };

    socket.on("message received", handler);
    return () => socket.off("message received", handler);
  }, [myPrivKey, user]);

  // --------------------------------------------------------------
  // Realtime file frames
  // --------------------------------------------------------------
  useEffect(() => {
    if (!myPrivKey) return;
    const receiver = new FileReceiver();

    const fileHandler = async (frame) => {
      if (!frameBelongsHere(frame, user, selectedChatCompare)) return;

      const result = await receiver.handleMessage(frame, normalizeKey(myPrivKey));
      if (!result) return;

      const localUrl = URL.createObjectURL(result.blob);
      const newFileMsg = {
        type: "FILE",
        name: result.name,
        localUrl, // local-only
        plaintext: `[File: ${result.name}]`,
        from: frame.from,
        to: frame.to,
        ts: frame.ts,
        successful: true,
      };

      setMessages((prev) => [...prev, newFileMsg]);

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
  }, [myPrivKey, user]);

  // --------------------------------------------------------------
  // Typing indicator
  // --------------------------------------------------------------
  const [lastTypeAt, setLastTypeAt] = useState(0);
  const typingHandler = (e) => {
    setNewMessage(e.target.value);
    if (!socketConnected || !selectedChat) return;
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

  // --------------------------------------------------------------
  // UI
  // --------------------------------------------------------------
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
                {getGroupTitle(selectedChat).toUpperCase()}
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
                  This feature is not supported in the current version. (Community chat)
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
