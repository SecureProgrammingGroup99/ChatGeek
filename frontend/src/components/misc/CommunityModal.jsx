import { Box, Button, FormControl, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Spinner, useDisclosure, useToast } from '@chakra-ui/react'
import React, { useState } from 'react'
import { ChatState } from '../../Context/chatProvider'
import axios from 'axios'
import UserListItem from '../UserAvatar/UserListItem'
import UserBadgeItem from '../UserAvatar/UserBadgeItem'

const CommunityModal = ({ children }) => {

    const { isOpen, onOpen, onClose } = useDisclosure()
    const [grouChatName, setGroupChatName] = useState()
    const [selectedUsers, setSelectedUsers] = useState([])
    // const [search, setSearch] = useState()
    const [searchResults, setSearchResults] = useState([])
    const [loading, setLoading] = useState(false)

    const toast = useToast();

    const { user, chats, setChats } = ChatState();

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

    const handleSubmit = async() => {
        setLoading(true)
        if(!grouChatName || !selectedUsers)
        {
            toast({
                title: "Please fill all the fields",
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "bottom",
            });
        }

        try {
            const config = {
                headers: {
                    Authorization: `Bearer ${user.token}`
                },
            };
            const { data } = await axios.post(`/api/chat/community`, {
                name: grouChatName,
                users: JSON.stringify(selectedUsers.map((u) => u._id))
            }, config);

            setChats([data, ...chats]);
            onClose();
        } catch (error) {
            toast({
                title: "Error Occured!",
                description: error.response.data,
                status: "error",
                duration: 3000,
                isClosable: true,
                position: "bottom",
            });
        }
        setLoading(false)
    }

    const handleDelete = (userToDelete) => {
        setSelectedUsers(selectedUsers.filter((sel) => sel._id !== userToDelete._id));
    }
    const handleGroup = (userToAdd) => {
        if (selectedUsers.includes(userToAdd)) {
            toast({
                title: "User Already Added!",
                status: "warning",
                duration: 3000,
                isClosable: true,
                position: "bottom",
            });
            return;
        }

        setSelectedUsers([...selectedUsers, userToAdd]);
    }

    return (
        <div>
            <span onClick={onOpen}>{children}</span>

            <Modal isOpen={isOpen} onClose={onClose}>
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader
                        fontSize={"35px"}
                        fontFamily={"work sans"}
                        display={"flex"}
                        justifyContent={"center"}
                    >
                        Create Community
                    </ModalHeader>
                    <ModalCloseButton />
                    <ModalBody
                        display={"flex"}
                        flexDir={"column"}
                        alignItems={"center"}
                    >

                        <FormControl>
                            <Input
                                placeholder='Chat Name'
                                mb={3}
                                onChange={(e) => setGroupChatName(e.target.value)}
                            />
                        </FormControl>

                        <FormControl>
                            <Input
                                placeholder='Add Users'
                                mb={3}
                                onChange={(e) => handleSearch(e.target.value)}
                            />
                        </FormControl>

                        <Box
                            w={"100%"}
                            display={"flex"}
                            flexWrap={"wrap"}
                        >
                            {selectedUsers.map((u) => (
                                <UserBadgeItem key={user._id} user={u} handleFunction={() => handleDelete(u)} />
                            ))}
                        </Box>

                        {loading ? <div>loading <Spinner h={"15px"} w={"15px"} /> </div> : (
                            searchResults.slice(0, 4).map(user => (<UserListItem key={user._id} user={user} handleFunction={() => handleGroup(user)} />))
                        )}

                    </ModalBody>

                    <ModalFooter>
                        <Button colorScheme='blue' onClick={handleSubmit} isLoading={loading}>
                            Create Community
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </div>
    )
}

export default CommunityModal;