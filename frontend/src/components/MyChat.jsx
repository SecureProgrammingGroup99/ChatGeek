import React, { useEffect, useState } from "react";
import { ChatState } from "../Context/chatProvider";
import {
  Box,
  Button,
  Stack,
  VStack,
  useToast,
  Text,
  Avatar,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from "@chakra-ui/react";
import axios from "axios";
import { AddIcon } from "@chakra-ui/icons";
import ChatLoading from "./ChatLoading";
import { getSender, getSenderPic } from "../config/chatlogics";
import GroupChatModal from "./misc/GroupChatModal";
import CommunityModal from "./misc/CommunityModal";

const MyChat = ({ fetchAgain }) => {
  const [loggedUser, setLoggedUser] = useState();
  const { user, setSelectedChat, selectedChat, chats, setChats } = ChatState();
  const toast = useToast();

  // 🧠 Helper: gracefully check for user picture
  const picCheck = (chat) => {
    const picture = getSenderPic(loggedUser, chat.users);
    if (
      picture ===
      "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg"
    ) {
      return false;
    } else {
      return picture;
    }
  };

  // 🧠 Fetch all chats (now expect chat.chat_id instead of _id)
  const fetchChat = async () => {
    try {
      const config = {
        headers: { Authorization: `Bearer ${user.token}` },
      };
      const { data } = await axios.get("/api/chat", config);
      setChats(data);
    } catch (error) {
      toast({
        title: "Error Occurred!",
        description: "Failed to load Chats",
        status: "error",
        duration: 3000,
        isClosable: true,
        position: "bottom",
      });
    }
  };

  useEffect(() => {
    setLoggedUser(JSON.parse(localStorage.getItem("userInfo")));
    fetchChat();
    // eslint-disable-next-line
  }, [fetchAgain]);

  return (
    <Box
      display={{ base: selectedChat ? "none" : "flex", md: "flex" }}
      flexDir="column"
      alignItems="center"
      p={3}
      bg="white"
      w={{ base: "100%", md: "31%" }}
      borderRadius="lg"
      borderWidth="1px"
      overflow="hidden"
      overflowY="scroll"
    >
      {/* Header */}
      <Box
        w="100%"
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Text fontSize={{ base: "20px", md: "30px" }} fontFamily="Work Sans">
          My Chats
        </Text>
        <GroupChatModal>
          <Button
            display="flex"
            fontSize={{ base: "17px", md: "10px", lg: "17px" }}
            rightIcon={<AddIcon />}
          >
            New Group Chat
          </Button>
        </GroupChatModal>
      </Box>

      {/* Chats List */}
      <Box
        display="flex"
        flexDir="column"
        p={3}
        bg="#F8F8F8"
        w="100%"
        h="100%"
        borderRadius="lg"
        overflowY="scroll"
      >
       {chats ? (
        <Stack>
          {chats
            // ✅ Filter out null or malformed chats
            .filter((chat) => chat && (chat.chatName || chat.name))
            .map((chat) => {
              const chatLabel = chat.chatName || chat.name || "Unnamed Chat";

              return (
                <Box
                  key={chat.chat_id || chat.group_id || chat._id || chatLabel}
                  onClick={() => setSelectedChat(chat)}
                  cursor="pointer"
                  _hover={{ background: "#38B2AC53", color: "black" }}
                  bg={
                    selectedChat?.chat_id === chat.chat_id
                      ? "#38B2AC53"
                      : "#E8E8E8"
                  }
                  px={3}
                  py={2}
                  borderRadius="lg"
                  display="flex"
                  alignItems="center"
                >
                  <Avatar
                    mr={2}
                    size="md"
                    cursor="pointer"
                    src={
                      chat.isGroupChat
                        ? undefined
                        : picCheck(chat)
                        ? getSenderPic(loggedUser, chat.users)
                        : getSender(loggedUser, chat.users)
                    }
                    name={
                      chat.isGroupChat
                        ? chatLabel
                        : getSender(loggedUser, chat.users)
                    }
                  />
                  <Box ml={2}>
                    <Text fontWeight="bold">{chatLabel}</Text>
                    {chat.latestMessage && (
                      <Text fontSize="xs" color="gray.600">
                        <b>{chat.latestMessage.sender_id || "Unknown"}:</b>{" "}
                        {chat.latestMessage.ciphertext
                          ? "(encrypted)"
                          : "(no message)"}
                      </Text>
                    )}
                  </Box>
                </Box>
              );
            })}
        </Stack>
      ) : (
        <ChatLoading />
)}
      </Box>
    </Box>
  );
};

export default MyChat;
