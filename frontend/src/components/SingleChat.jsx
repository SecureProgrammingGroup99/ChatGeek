import React, { useEffect, useState, useRef  } from 'react'
import { ChatState } from '../Context/chatProvider'
import { Box, FormControl, IconButton, Input, Spinner, Text, useToast, InputGroup, InputRightElement, Button} from '@chakra-ui/react';
import { ArrowBackIcon} from '@chakra-ui/icons';
import { getSender, getSenderFull } from '../config/chatlogics';
import ProfileModel from './misc/profileModel';
import UpdateGroupChatModal from './misc/UpdateGroupChatModal';
import axios from 'axios';
import ScrollableChat from './ScrollableChat';
import io from 'socket.io-client'
import './styles.css'
import { encryptMessage, decryptMessage, signMessage, verifyMessage } from "../utils/crypto";
import { streamFileTransfer, FileReceiver } from "../utils/fileTransfer";

const ENDPOINT = "http://localhost:5001";
// eslint-disable-next-line
var socket, selectedChatCompare;

const SingleChat = ({ fetchAgain, setFetchAgain }) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newMessage, setNewMessage] = useState("")
    const [socketConnected, setSocketConnected] = useState(false);
    const [typing, setTyping] = useState(false);
    const [istyping, setIsTyping] = useState(false);
    const toast = useToast();

    const { selectedChat, setSelectedChat, user, notification, setNotification } = ChatState();
    // Determine chat type based on selectedChat flags
    const isDM = selectedChat && !selectedChat.isGroupChat && !selectedChat.isCommunity;
    const isGroup = selectedChat && selectedChat.isGroupChat;
    const isCommunity = selectedChat && selectedChat.isCommunity;
    // Debug: print the attributes of user object
    console.log("[DBG] User object:", user);
    // Debug: print the attributes of selectedChat object
    console.log("[DBG] SelectedChat object:", selectedChat);

    // TODO: file attachment state and ref
    const [selectedFile, setSelectedFile] = useState(null);
    const fileInputRef = useRef(null);


    // 1- fetchMessages
    // Purpose: Pulls full chat history for the selected chat.
    // Verifies + decrypts each message per SOCP spec (RSA-OAEP + RSASSA-PSS).
    // Populates messages state with plaintext included for rendering.
    const fetchMessages = async () => {
        if (!selectedChat) return;

        try {
            const config = {
                headers: {
                    Authorization: `Bearer ${user.token}`,
                },
            };

            setLoading(true);

            const { data } = await axios.get(
                `/api/message/${selectedChat._id}`,
                config
            );

            const myPrivKey = localStorage.getItem("my_privkey");

            const decrypted = await Promise.all(
            data.map(async (m) => {
                try {
                // verify signature with sender’s pubkey
                const ok = await verifyMessage(m.ciphertext, m.content_sig, m.sender.pubkey);
                if (!ok) return { ...m, plaintext: "[invalid signature]" };

                // decrypt with my private key
                const plain = await decryptMessage(m.ciphertext, myPrivKey);
                return { ...m, plaintext: plain };
                } catch {
                return { ...m, plaintext: "[decryption failed]" };
                }
            })
            );

            setMessages(decrypted);
            setLoading(false);

            socket.emit("join chat", selectedChat._id);

        } catch (error) {
            toast({
                title: "Error Occured!",
                description: "Failed to Load the Messages",
                status: "error",
                duration: 5000,
                isClosable: true,
                position: "bottom",
            });
        }
    };

    // 2- sendMessage
    // Purpose: Handles user hitting Enter.
    // Posts to backend /api/message, then emits via socket for instant update.
    const BYPASS_SIG = "BYPASS_SIG"; // marker to indicate no real signature/encryption
    const sendMessage = async (event) => {
        if (event.key !== "Enter" || !newMessage) return;
      
        try {
          const config = {
            headers: {
              "Content-type": "application/json",
              Authorization: `Bearer ${user.token}`,
            },
          };
      
          // reset input quickly
          setNewMessage("");
      
          // --- Local keys (will be base64url RSA keys) ---
          const myPubKey = localStorage.getItem("my_pubkey"); //TODO: correct?
          const ts = Date.now();
          const ciphertext = newMessage;   // TODO: replace with real RSA-OAEP encryption output
          const signature = BYPASS_SIG;    // TODO: replace with RSASSA-PSS signature
          const from = user._id;
      
          let frame = null;
      
          // ---------- Direct Message ----------
          if (isDM) {
            const recipient = selectedChat.users.find((u) => u._id !== user._id);
            const to = recipient._id;
      
            frame = {
              type: "MSG_DIRECT",
              from,
              to,
              ts,
              payload: {
                ciphertext,
                sender_pub: myPubKey,
                content_sig: signature,
              },
              sig: "", // TODO: client->server link sig not required under HTTPS
            };
          }
      
          // ---------- Group Chat ----------
          else if (isGroup) {
            frame = {
              type: "MSG_PUBLIC_CHANNEL",
              from,
              to: selectedChat._id, // group chat ID
              ts,
              payload: {
                ciphertext,
                sender_pub: myPubKey,
                content_sig: signature,
              },
              sig: "", // TODO: transport sig; may be added by server
            };
          }
      
          // ---------- Community (unsupported) ----------
          else if (isCommunity) {
            toast({
              title: "Unsupported Chat Type",
              description: "Community chats are disabled in this version.",
              status: "error",
              duration: 4000,
              isClosable: true,
              position: "bottom",
            });
            return;
          }
      
          if (!frame) return;
      
          console.log("[SOCP] Outgoing frame:", frame);
      
          // send to backend as JSON envelope
          const { data } = await axios.post("/api/message", frame, config);
      
          // propagate instantly to socket peers
          socket.emit("new message", data);
      
          // local optimistic update
          setMessages((prev) => [...prev, { ...data, plaintext: newMessage }]);
        } catch (error) {
          console.error("[SOCP] sendMessage error:", error);
          toast({
            title: "Error Occured!",
            description: "Failed to send the Message",
            status: "error",
            duration: 5000,
            isClosable: true,
            position: "bottom",
          });
        }
      };

    // 2.5- sendFile
    const sendFile = async () => {
    if (!selectedFile) return;
    
    try {
        const chatId = selectedChat._id;
        const mode = isDM ? "dm" : "public";
        const recipientPub = selectedChat.isGroupChat
        ? selectedChat.groupAdmin.pubkey // or derive per user later
        : selectedChat.users.find((u) => u._id !== user._id).pubkey;
    
        const config = {
        headers: {
            "Content-type": "application/json",
            Authorization: `Bearer ${user.token}`,
        },
        };
    
        // Stream out FILE_START → FILE_CHUNK → FILE_END
        for await (const frame of streamFileTransfer(
        selectedFile,
        mode,
        chatId,
        user._id,
        recipientPub
        )) {
        console.log("[SOCP] sending frame:", frame);
        await axios.post(`/api/file/${frame.type.split("_")[1].toLowerCase()}`, frame, config);
        socket.emit("file send", frame);
        }
    
        toast({
        title: "File sent successfully!",
        status: "success",
        duration: 3000,
        isClosable: true,
        });
        setSelectedFile(null);
    } catch (error) {
        console.error("[SOCP] sendFile error:", error);
        toast({
        title: "File send failed",
        description: error.message,
        status: "error",
        duration: 4000,
        isClosable: true,
        });
    }
    };
        
    // 3- useEffect for socket lifecycle
    // Purpose: Initializes socket connection when component mounts.
    // Announces user to server (setup) and sets up typing indicator listeners.
    // Runs once when the component mounts ([] dependency array).
    useEffect(() => {
        socket = io(ENDPOINT);
        socket.emit("setup", user);
        socket.on("connected", () => setSocketConnected(true));
        socket.on("typing", () => setIsTyping(true));
        socket.on("stop typing", () => setIsTyping(false));

        // eslint-disable-next-line
    }, []);

    // 4- useEffect for selectedChat changes: Refetch on Chat Change
    // Purpose: When user switches chats, reload messages and update selectedChatCompare.
    // Runs every time selectedChat changes.
    useEffect(() => {
        fetchMessages();
        selectedChatCompare = selectedChat;
        // eslint-disable-next-line
    }, [selectedChat]);

    // 5- useEffect for incoming messages: Handle Incoming Socket Messages
    // Purpose: Handles real-time incoming messages via socket.
    // Decrypts/validates or treats as plaintext if BYPASS_SIG.
    // If message is for another chat → goes to notifications.
    // If current chat → adds to UI immediately.
    useEffect(() => {
        const handler = async (frame) => {
          console.log("[SOCP] Incoming USER_DELIVER:", frame);
      
          // Extract payload
          const { payload } = frame;
          const { ciphertext, sender, sender_pub, content_sig } = payload;
      
          const myPrivKey = localStorage.getItem("my_privkey");
          const myUserId = user._id;
      
          if (!myPrivKey) {
            console.error("[SOCP] Missing my_privkey in localStorage!");
            return;
          }
      
          let plaintext;
          try {
            // Step 1: Decrypt ciphertext (RSA-OAEP)
            plaintext = await decryptMessage(ciphertext, myPrivKey);
      
            // Step 2: Verify signature over (ciphertext || from || to || ts)
            const ok = await verifyMessage(
              ciphertext + frame.from + frame.to + frame.ts,
              content_sig,
              sender_pub
            );
      
            if (!ok) {
              console.warn("[SOCP] Signature verification failed!");
              plaintext = "[invalid signature]";
            }
          } catch (err) {
            console.error("[SOCP] Error decrypting/verifying message:", err);
            plaintext = "[decryption failed]";
          }
      
          const decryptedMessage = {
            ...frame,
            plaintext,
            sender,
          };
      
          console.log("[SOCP] Decrypted/verified message:", decryptedMessage);
      
          // Deliver to chat if active, else notification
          if (!selectedChatCompare || selectedChatCompare._id !== decryptedMessage.chat?._id) {
            if (!notification.includes(decryptedMessage)) {
              setNotification([decryptedMessage, ...notification]);
              setFetchAgain(!fetchAgain);
            }
          } else {
            setMessages((prev) => [...prev, decryptedMessage]);
          }
        };
      
        socket.on("message received", handler);
        return () => socket.off("message received", handler);
        // eslint-disable-next-line
    }, [notification, fetchAgain]);
      
    
    // 5.5 - useEffect for incoming file frames
    useEffect(() => {
    const receiver = new FileReceiver();
    const fileHandler = async (frame) => {
        console.log("[SOCP] incoming file frame:", frame);
    
        const myPrivKey = localStorage.getItem("my_privkey");
        const result = await receiver.handleMessage(frame, myPrivKey);
    
        if (result) {
        // File fully received
        const url = URL.createObjectURL(result.blob);
        setMessages((prev) => [
            ...prev,
            {
            type: "FILE",
            name: result.name,
            url,
            plaintext: `[File received: ${result.name}]`,
            },
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
      
    
    // 6- typingHandler: 
    // Purpose: Tracks input typing state.
    // Emits "typing" and "stop typing" events to socket peers.
    const typingHandler = (e) => {
        setNewMessage(e.target.value);

        if (!socketConnected) return;

        if (!typing) {
            setTyping(true);
            socket.emit("typing", selectedChat._id);
        }
        let lastTypingTime = new Date().getTime();
        var timerLength = 3000;
        setTimeout(() => {
            var timeNow = new Date().getTime();
            var timeDiff = timeNow - lastTypingTime;
            if (timeDiff >= timerLength && typing) {
                socket.emit("stop typing", selectedChat._id);
                setTyping(false);
            }
        }, timerLength);
    };


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
                    <Spinner
                    size="xl"
                    w={20}
                    h={20}
                    alignSelf="center"
                    margin="auto"
                    />
                ) : (
                    <ScrollableChat messages={messages} />
                )}
        
                {/* ---------- MESSAGE INPUT ---------- */}
        
                {(isDM || isGroup) && (
                    <FormControl onKeyDown={sendMessage} isRequired mt={3}>
                    {istyping && (
                        <div
                        className="typing"
                        style={{
                            width: "5rem",
                            borderRadius: "10px",
                            marginBottom: "10px",
                            backgroundColor: "#dedede",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                        }}
                        >
                        Typing
                        <div className="dot" />
                        <div className="dot" />
                        <div className="dot" />
                        </div>
                    )}
                    {/* If a file is selected, show file preview field */}
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
                            {/* hidden file input */}
                            <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: "none" }}
                            onChange={(e) => {
                                if (e.target.files.length > 0) {
                                setSelectedFile(e.target.files[0]);  // store selected File object
                                }
                            }}
                            />
                            {/* 📎 icon that triggers the file picker */}
                            <span
                            role="img"
                            aria-label="attach file"
                            style={{ cursor: "pointer" }}
                            onClick={() => 
                                {fileInputRef.current.click(); 
                                console.log("📎  is clicked!, fileInputRef is ", fileInputRef)}}  // opens local file picker
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
                        ❌ This feature is not supported in the current version. (Community chat detected)
                    </Text>
                    </Box>
                )}
                </Box>
            </>
            ) : (
            <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                h="100%"
            >
                <Text fontSize="3xl" pb={3} fontFamily="Work Sans">
                Click on a User to start Chatting
                </Text>
            </Box>
            )}
        </>
    );
}

export default SingleChat