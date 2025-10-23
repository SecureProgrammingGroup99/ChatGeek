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
import { ViewIcon } from '@chakra-ui/icons'
import { Box, Button, FormControl, IconButton, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Spinner, useDisclosure, useToast } from '@chakra-ui/react'
import React, { useState } from 'react'
import { ChatState } from '../../Context/chatProvider'
import UserBadgeItem from '../UserAvatar/UserBadgeItem'
import axios from 'axios'

const UpdateCommunityModal = ({ fetchAgain, setFetchAgain, fetchMessages }) => {

    const { selectedChat, setSelectedChat, user } = ChatState();
    const [groupChatName, setGroupChatName] = useState();
    // const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);
    const [renameLoading, setRenameLoading] = useState(false);
    const { isOpen, onOpen, onClose } = useDisclosure()

    const toast = useToast();

    const handleRemove = async (user1) => {

        try {
            setLoading(true);

            const config = {
                headers: {
                    Authorization: `Bearer ${user.token}`
                },
            };

            const { data } = await axios.put("/api/chat/communityRemove", {
                chatId: selectedChat._id,
                userId: user1._id,
            }, config);

            user1._id === user._id ? setSelectedChat() : setSelectedChat(data);
            setFetchAgain(!fetchAgain);
            fetchMessages();
            setLoading(false)
        } catch (error) {
            toast({
                title: "Error Occured!",
                description: error.response,
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "bottom",
            });
            setLoading(false)
        }
    }

    const handleAddUser = async (user1) => {
        if (selectedChat.users.find((u) => u._id === user1._id)) {
            toast({
                title: "User already in the group!",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "bottom",
            });
            return;
        }

        try {
            setLoading(true);

            const config = {
                headers: {
                    Authorization: `Bearer ${user.token}`
                },
            };

            const { data } = await axios.put("/api/chat/communityadd", {
                chatId: selectedChat._id,
                userId: user1._id,
            }, config);

            setSelectedChat(data)
            setFetchAgain(!fetchAgain)
            setLoading(false)
        } catch (error) {
            toast({
                title: "Error Occured!",
                description: error.response,
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "bottom",
            });
            setLoading(false)
        }
    }

    const handleRename = async () => {
        if (!groupChatName) {
            return;
        }
        // console.log("Group chat name: "+groupChatName);

        try {
            setRenameLoading(true)
            const config = {
                headers: {
                    Authorization: `Bearer ${user.token}`
                },
            };

            const { data } = await axios.put("/api/chat/renamecommunity", {
                chatId: selectedChat._id,
                chatName: groupChatName,
            }, config);
            console.log("here is the rename data: " + data);
            setSelectedChat(data)
            setFetchAgain(!fetchAgain)
            setRenameLoading(false)
        } catch (error) {
            toast({
                title: "Error Occured!",
                description: error.response,
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "bottom",
            });
            setRenameLoading(false)
        }
        setGroupChatName('')
        window.location.reload()
    }


    return (
        <>
            <IconButton onClick={onOpen} display={{ base: "flex" }} icon={<ViewIcon />} />

            <Modal isOpen={isOpen} onClose={onClose} isCentered>
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader
                        fontSize={"35px"}
                        fontFamily={"work sans"}
                        display={"flex"}
                        justifyContent={"center"}
                    >{selectedChat.chatName}</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody display={"flex"} flexDirection={"column"} alignItems={"center"} >
                        <Box
                            display={"flex"}
                            w={"100%"}
                            flexWrap={"wrap"}
                            pb={3}
                        >
                            {selectedChat.users.map((user) => (
                                <UserBadgeItem key={user._id} user={user}/>
                            ))}
                        </Box>

                        <FormControl display={"flex"} >
                            <Input
                                placeholder='Group Name'
                                mb={3}
                                onChange={(e) => setGroupChatName(e.target.value)}
                            />
                            <Button
                                variant={"solid"}
                                colorScheme='teal'
                                ml={1}
                                isLoading={renameLoading}
                                onClick={handleRename}
                            >
                                Update
                            </Button>

                        </FormControl>

                    </ModalBody>

                    <ModalFooter>
                        <Button colorScheme='red' onClick={() => handleRemove(user)} isLoading={loading}>
                            Leave Community
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </>
    )
}

export default UpdateCommunityModal;