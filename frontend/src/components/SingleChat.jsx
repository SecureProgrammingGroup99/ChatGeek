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
            setNewMessage("");
      
            const myPrivKey = localStorage.getItem("my_privkey");
            console.log("[DBG] myPrivKey loaded?", !!myPrivKey); //private key is expected to be saved in browser localStorage under "my_privkey".
      
            const recipient = selectedChat.users.find(u => u._id !== user._id);
            console.log("[DBG] recipient:", recipient);
            console.log("[DBG] recipient.pubkey loaded?", !!recipient.pubkey); // recipient.pubkey should be part of the user object that comes from  backend (in selectedChat.users).
      
            const ciphertext = await encryptMessage(newMessage, recipient.pubkey);
            const signature = await signMessage(ciphertext, myPrivKey);
      
            console.log("[DBG] ciphertext:", ciphertext);
            console.log("[DBG] signature:", signature);
      
            const { data } = await axios.post(
              "/api/message",
              {
                ciphertext,
                content_sig: signature,
                chatId: selectedChat._id,
              },
              config
            );
      
            console.log("[DBG] axios POST /api/message returned:", data);
      
            socket.emit("new message", data);
            console.log("[DBG] socket.emit(new message) sent:", data);
      
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
        const handler = async (newMessageReceived) => {
          console.log("[DBG] Incoming socket message:", newMessageReceived);
      
          const myPrivKey = localStorage.getItem("my_privkey");
      
          let decrypted;
          try {
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
          } catch {
            decrypted = { ...newMessageReceived, plaintext: "[decryption failed]" };
          }
      
          console.log("[DBG] Decrypted message:", decrypted);
      
          if (!selectedChatCompare || selectedChatCompare._id !== decrypted.chat._id) {
            if (!notification.includes(decrypted)) {
              setNotification([decrypted, ...notification]);
              setFetchAgain(!fetchAgain);
            }
          } else {
            setMessages((prev) => [...prev, decrypted]); // use functional update to avoid stale state
          }
        };
      
        socket.on("message recieved", handler); // must match backend emit
      
        return () => {
          socket.off("message recieved", handler); // the previous version never unregisters the listener, and it will re-run on every render. That can lead to duplicate handlers.
        };
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