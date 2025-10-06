import { ViewIcon } from '@chakra-ui/icons'
import { Box, Button, FormControl, IconButton, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Spinner, useDisclosure, useToast } from '@chakra-ui/react'
import React, { useState } from 'react'
import { ChatState } from '../../Context/chatProvider'
import UserBadgeItem from '../UserAvatar/UserBadgeItem'
import axios from 'axios'
import UserListItem from '../UserAvatar/UserListItem'

const UpdateGroupChatModal = ({ fetchAgain, setFetchAgain, fetchMessages }) => {

    const { selectedChat, setSelectedChat, user } = ChatState();
    const [groupChatName, setGroupChatName] = useState();
    // const [search, setSearch] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [renameLoading, setRenameLoading] = useState(false);
    const { isOpen, onOpen, onClose } = useDisclosure()

    const toast = useToast();


    const handleRemove = async (user1) => {
        if (selectedChat.groupAdmin._id !== user._id && user1._id !== user._id) {
            toast({
                title: "Only admin can Remove someone!",
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

            const { data } = await axios.put("/api/chat/groupRemove", {
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

        if (selectedChat.groupAdmin._id !== user._id) {
            toast({
                title: "Only admin can Add someone!",
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

            const { data } = await axios.put("/api/chat/groupadd", {
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

        try {
            setRenameLoading(true)
            const config = {
                headers: {
                    Authorization: `Bearer ${user.token}`
                },
            };

            const { data } = await axios.put("/api/chat/rename", {
                chatId: selectedChat._id,
                chatName: groupChatName,
            }, config);

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

    const handleSearch = async (query) => {
        // setSearch(query)
        if (!query) {
            return;
        }

        try {
            setLoading(true);
            const config = {
                headers: {
                    Authorization: `Bearer ${user.token}`
                },
            };
            const { data } = await axios.get(`/api/user?search=${query}`, config)

            setLoading(false)
            setSearchResults(data)
        } catch (error) {
            toast({
                title: "Error Occured!",
                description: "Failed to load the Search Results",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "bottom",
            });
        }

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
                                <UserBadgeItem key={user._id} user={user} handleFunction={() => handleRemove(user)} />
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
                        <FormControl marginBottom={"15px"}>
                            <Input
                                placeholder='Add User to group'
                                mb={1}
                                onChange={(e) => handleSearch(e.target.value)}
                            />
                        </FormControl>

                        {loading ? (
                            <Spinner size={"lg"} />
                        ) : (
                            searchResults?.map((user) => (
                                <UserListItem
                                    key={user._id}
                                    user={user}
                                    handleFunction={() => handleAddUser(user)}
                                />
                            ))
                        )}

                    </ModalBody>

                    <ModalFooter>
                        <Button colorScheme='red' onClick={() => handleRemove(user)}>
                            Leave Group
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </>
    )
}

export default UpdateGroupChatModal