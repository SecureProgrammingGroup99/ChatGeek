import React, { useEffect, useState } from 'react'
import { ChatState } from '../Context/chatProvider'
import { Box, Button, Stack, VStack, useToast, Text, Avatar, Tabs, TabList, Tab, TabPanels, TabPanel } from '@chakra-ui/react';
import axios from 'axios';
import { AddIcon } from '@chakra-ui/icons'
import ChatLoading from './ChatLoading';
import { getSender, getSenderpic } from '../config/chatlogics';
import GroupChatModal from './misc/GroupChatModal';
import CommunityModal from './misc/CommunityModal';

const MyChat = ({ fetchAgain }) => {
    const [loggedUser, setLoggedUser] = useState();
    const { user, setSelectedChat, selectedChat, chats, setChats } = ChatState();

    const toast = useToast();

    const picCheck = (chat) => {
        const picture = getSenderpic(loggedUser, chat.users)
        if (picture === "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg") {
            return false;
        }
        else {
            return picture;
        }
    }

    const fetchChat = async () => {
        try {
            const config = {
                headers: {
                    Authorization: `Bearer ${user.token}`
                },
            };
            const { data } = await axios.get("/api/chat", config);
            //console.log("here is the chats data: " + data);
            // TODO: does this chat object attributes alr follow SOCP? 
            /*
            {
                _id: "chat123",
                chatName: "Group 1",
                isGroupChat: true,        
                isCommunity: false,       
                users: [userA, userB, ...],
                groupAdmin: userObject,    // 👈 only defined for group chats
                latestMessage: {...}
              }
            */
            setChats(data);
        } catch (error) {
            toast({
                title: "Error Occured!",
                description: "Failed to load Chats",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "bottom",
            });
        }
    }

    useEffect(() => {
        setLoggedUser(JSON.parse(localStorage.getItem("userInfo")))
        fetchChat();
        // eslint-disable-next-line
    }, [fetchAgain]);
    


    return (
        <Box
            display={{ base: selectedChat ? "none" : "flex", md: "flex" }}
            flexDir={"column"}
            alignItems={"center"}
            p={3}
            bg={"white"}
            w={{ base: "100%", md: "31%" }}
            borderRadius={"lg"}
            borderWidth={"1px"}
            overflow={"hidden"}
            overflowY={"scroll"}
        >
            <Tabs w={"100%"} margin={0} padding={0}>
                <TabList>
                    <Tab>Chats</Tab>
                    <Tab>Community</Tab>
                </TabList>

                <TabPanels w={"100%"}>
                    {/* ---------------- CHATS TAB ---------------- */}
                    <TabPanel w={"100%"} padding={0} paddingTop={3}>

                        <Box
                            paddingTop={0}
                            fontSize={{ base: "20px", md: "30px" }}
                            fontFamily={"work sans"}
                            display={"flex"}
                            w={"100%"}
                            justifyContent={"space-between"}
                            alignItems={"center"}
                        >
                            My chats
                            <GroupChatModal>
                                <Button
                                    display={"flex"}
                                    fontSize={{ base: "17px", md: "10px", lg: "17px" }}
                                    rightIcon={<AddIcon />}
                                >
                                    New Group Chat
                                </Button>
                            </GroupChatModal>
                        </Box>
                        <Box
                            display={"flex"}
                            flexDir={"column"}
                            p={3}
                            marginTop={3}
                            bg={"#F8F8F8"}
                            w={"100%"}
                            h={"100%"}
                            borderRadius={"lg"}
                            overflow={"hidden"}
                            overflowY={"scroll"}
                        >
                            {chats ? (
                                <Stack overflowY={"scroll"}>
                                    {chats
                                    .filter((chat) => chat.isCommunity === false)
                                    .map((chat) => (
                                        <Box
                                            onClick={() => setSelectedChat(chat)}
                                            key={chat._id}
                                            cursor={"pointer"}
                                            _hover={{
                                                background: "#38B2AC53",
                                                color: "black",
                                            }}
                                            bg={selectedChat === chat ? "#38B2AC53" : "#E8E8E8"}
                                            px={3}
                                            py={2}
                                            borderRadius={"lg"}
                                            display={"flex"}
                                        >
                                            <Avatar
                                                mr={2}
                                                size="md"
                                                cursor="pointer"
                                                src={picCheck(chat) ? getSenderpic(loggedUser, chat.users) : getSender(loggedUser, chat.users)}
                                                name={getSender(loggedUser, chat.users)}
                                            />
                                            <div style={{ display: "flex", flexDirection: "column", marginLeft: ".5rem" }}>
                                                <Text
                                                    cursor={"pointer"}
                                                >
                                                    <b>
                                                        {!chat.isGroupChat && !chat.isCommunity ? getSender(loggedUser, chat.users) : chat.chatName}
                                                    </b>
                                                </Text>
                                                {chat.latestMessage && (
                                                    <Text fontSize="xs">
                                                        <b>{chat.latestMessage.sender.name} : </b>
                                                        {chat.latestMessage.content.length > 50
                                                            ? chat.latestMessage.content.substring(0, 51) + "..."
                                                            : chat.latestMessage.content}
                                                    </Text>
                                                )}
                                            </div>
                                        </Box>
                                    ))}
                                </Stack>
                            ) : (
                                <ChatLoading />
                            )}
                        </Box>

                    </TabPanel>
                    {/* ---------------- COMMUNITY TAB (NOW DISABLED) ---------------- */}
                    <TabPanel w={"100%"} padding={0} paddingTop={3}>
                        <Box
                            paddingTop={0}
                            fontSize={{ base: "20px", md: "30px" }}
                            fontFamily={"work sans"}
                            display={"flex"}
                            w={"100%"}
                            justifyContent={"space-between"}
                            alignItems={"center"}
                        >
                            Communities
                            <Button
                                isDisabled
                                colorScheme="gray"
                                rightIcon={<AddIcon />}
                            >
                                Create Community
                            </Button>
                        </Box>
                        <VStack
                            w="100%"
                            p={3}
                            marginTop={3}
                            bg={"#F8F8F8"}
                            borderRadius={"lg"}
                            align="center"
                            justify="center"
                            h="full"
                            spacing={3}
                            >
                            <Text color="gray.500" fontSize="sm" textAlign="center">
                                This feature is not supported on the current version.
                            </Text>
                        </VStack>
                    </TabPanel>
                </TabPanels>
            </Tabs>
        </Box>
    )
}

export default MyChat