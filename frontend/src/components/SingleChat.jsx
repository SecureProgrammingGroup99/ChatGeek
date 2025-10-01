import React, { useEffect, useState } from 'react'
import { ChatState } from '../Context/chatProvider'
import { Box, FormControl, IconButton, Input, Spinner, Text, useToast } from '@chakra-ui/react';
import { ArrowBackIcon } from '@chakra-ui/icons';
import { getSender, getSenderFull } from '../config/chatlogics';
import ProfileModel from './misc/profileModel';
import UpdateGroupChatModal from './misc/UpdateGroupChatModal';
import axios from 'axios';
import ScrollableChat from './ScrollableChat';
import io from 'socket.io-client'
import './styles.css'
import { encryptMessage, decryptMessage, signMessage, verifyMessage } from "../utils/crypto";

const ENDPOINT = "http://localhost:5001";
// eslint-disable-next-line
var socket, selectedChatCompare;


const SingleChat = ({ fetchAgain, setFetchAgain }) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newMessage, setNewMessage] = useState()
    const [socketConnected, setSocketConnected] = useState(false);
    const [typing, setTyping] = useState(false);
    const [istyping, setIsTyping] = useState(false);
    const toast = useToast();

    const { selectedChat, setSelectedChat, user, notification, setNotification } = ChatState();

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

    const BYPASS_SIG = "BYPASS_SIG"; // marker to indicate no real signature/encryption

    const sendMessage = async (event) => {
      if (event.key === "Enter" && newMessage) {
        console.log("[DBG] sendMessage triggered with:", newMessage);
    
        try {
          const config = {
            headers: {
              "Content-type": "application/json",
              Authorization: `Bearer ${user.token}`,
            },
          };
    
          // Clear input ASAP (optional)
          setNewMessage("");
    
          // DEBUG: show whether private key exists (for later)
          const myPrivKey = localStorage.getItem("my_privkey");
          console.log("[DBG] myPrivKey loaded?", !!myPrivKey);
    
          // pick first recipient (for group chat, loop later)
          const recipient = selectedChat.users.find((u) => u._id !== user._id);
          console.log("[DBG] recipient:", recipient);
          console.log("[DBG] recipient.pubkey loaded?", !!recipient?.pubkey);
    
          // ---------- BYPASS ENCRYPTION ----------
          // We will send plaintext in `ciphertext` + a marker signature so the receiver can treat it as plaintext.
          // This avoids calling encryptMessage() / signMessage() for local testing.
          const ciphertext = newMessage; // plaintext fallback for testing
          const signature = BYPASS_SIG;
    
          const { data } = await axios.post(
            "/api/message",
            {
                content: ciphertext,
              content_sig: signature, //this is ignored by the backend route
              chatId: selectedChat._id,
            },
            config
          );
    
          console.log("[DBG] axios POST /api/message returned:", data);
    
          // emit socket event to other clients
          socket.emit("new message", data);
          console.log("[DBG] socket.emit(new message) sent:", data);
    
          // append locally for immediate UI feedback (store plaintext in plaintext field)
          setMessages([...messages, { ...data, plaintext: newMessage }]);
        } catch (error) {
          console.error("[DBG] sendMessage error:", error);
          toast({
            title: "Error Occured!",
            description: "Failed to send the Message",
            status: "error",
            duration: 5000,
            isClosable: true,
            position: "bottom",
          });
        }
      }
    };
    
      

    useEffect(() => {
        socket = io(ENDPOINT);
        socket.emit("setup", user);
        socket.on("connected", () => setSocketConnected(true));
        socket.on("typing", () => setIsTyping(true));
        socket.on("stop typing", () => setIsTyping(false));

        // eslint-disable-next-line
    }, []);

    useEffect(() => {
        fetchMessages();
        selectedChatCompare = selectedChat;
        // eslint-disable-next-line
    }, [selectedChat]);

    useEffect(() => {
        // handler function so we can remove it cleanly later
        const handler = async (newMessageReceived) => {
          console.log("[DBG] Incoming socket message:", newMessageReceived);
      
          const myPrivKey = localStorage.getItem("my_privkey");
          console.log("[DBG] myPrivKey loaded on receive?", !!myPrivKey);
      
          let decrypted;
          try {
            // If message was sent with BYPASS_SIG, treat ciphertext as plaintext directly
            if (newMessageReceived.content_sig === "BYPASS_SIG") {
              console.log("[DBG] BYPASS_SIG detected - treating ciphertext as plaintext");
              decrypted = { ...newMessageReceived, plaintext: newMessageReceived.ciphertext };
            } else {
              // Normal flow: verify & decrypt
              const ok = await verifyMessage(
                newMessageReceived.ciphertext,
                newMessageReceived.content_sig,
                newMessageReceived.sender.pubkey
              );
      
              if (!ok) {
                decrypted = { ...newMessageReceived, plaintext: "[invalid signature]" };
              } else {
                const plain = await decryptMessage(newMessageReceived.ciphertext, myPrivKey);
                decrypted = { ...newMessageReceived, plaintext: plain };
              }
            }
          } catch (e) {
            console.error("[DBG] receive/decrypt error:", e);
            decrypted = { ...newMessageReceived, plaintext: "[decryption failed]" };
          }
      
          console.log("[DBG] Decrypted/Plain message:", decrypted);
      
          if (!selectedChatCompare || selectedChatCompare._id !== decrypted.chat._id) {
            if (!notification.includes(decrypted)) {
              setNotification([decrypted, ...notification]);
              setFetchAgain(!fetchAgain);
            }
          } else {
            // use functional updater to avoid stale state
            setMessages((prev) => [...prev, decrypted]);
          }
        };
      
        socket.on("message recieved", handler);
      
        return () => {
          socket.off("message recieved", handler);
        };
        // eslint-disable-next-line
      }, [notification, fetchAgain]);
      
      


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
                    <Text
                        fontSize={{ base: "20px", md: "30px" }}
                        pb={3}
                        px={2}
                        w={"100%"}
                        fontFamily={"work sans"}
                        display={"flex"}
                        justifyContent={{ base: "space-between" }}
                        alignItems={"center"}
                    >
                        <IconButton
                            display={{ base: "flex", md: "none" }}
                            icon={<ArrowBackIcon />}
                            onClick={() => setSelectedChat("")}
                        />
                        {!selectedChat.isGroupChat && !selectedChat.isCommunity ? (
                            <>
                                {getSender(user, selectedChat.users)}
                                <ProfileModel user={getSenderFull(user, selectedChat.users)} />
                            </>
                        ) : (
                            <>
                                {selectedChat.chatName.toUpperCase()}
                                <UpdateGroupChatModal fetchAgain={fetchAgain} setFetchAgain={setFetchAgain} fetchMessages={fetchMessages} />
                            </>
                        )}
                    </Text>
                    <Box
                        display={"flex"}
                        flexDir={"column"}
                        justifyContent={"flex-end"}
                        p={3}
                        bg={"#E8E8E8"}
                        w={"100%"}
                        h={"100%"}
                        borderRadius={"lg"}
                        overflowY={"hidden"}
                    >
                        {loading ? (
                            <Spinner
                                size={"xl"}
                                w={20}
                                h={20}
                                alignSelf={"center"}
                                margin={"auto"}
                            />
                        ) : (
                                    <ScrollableChat messages={messages} />
                        )}

                        {!selectedChat.isCommunity ? 
                        ( <FormControl
                            onKeyDown={sendMessage}
                            isRequired
                            mt={3}
                        >
                            {istyping ? (
                                <div className='typing' style={{ width: "5rem", borderRadius: "10px", marginBottom: "10px", backgroundColor: "#dedede", display: "flex", justifyContent: "center", alignItems: "center" }}>
                                    Typing <div className="dot" />
                                        <div className="dot" />
                                        <div className="dot" />
                                </div>
                            ) : (
                                <></>
                            )}
                            <Input variant={"filled"} bg={"#fff"} placeholder='Enter a Message' onChange={typingHandler} value={newMessage} />
                        </FormControl> ) : ( <FormControl
                            onKeyDown={sendMessage}
                            isRequired
                            mt={3}
                        >
                            {istyping ? (
                                <div className='typing' style={{ width: "5rem", borderRadius: "10px", marginBottom: "10px", backgroundColor: "#dedede", display: "flex", justifyContent: "center", alignItems: "center" }}>
                                    Typing <div className="dot" />
                                        <div className="dot" />
                                        <div className="dot" />
                                </div>
                            ) : (
                                <></>
                            )}
                            <Input variant={"filled"} bg={"#fff"} disabled={selectedChat.groupAdmin._id !== user._id} placeholder='Enter a Message' onChange={typingHandler} value={newMessage} />
                        </FormControl> )
                        }
                    </Box>
                </>
            ) : (
                <Box
                    display={"flex"}
                    alignItems={"center"}
                    justifyContent={"center"}
                    h={"100%"}
                >
                    <Text
                        fontSize={"3xl"}
                        pb={3}
                        fontFamily={"Work sans"}
                    >
                        Click on a User to start Chatting
                    </Text>
                </Box>
            )}
        </>
    )
}

export default SingleChat