import {
  Box,
  Button,
  FormControl,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import React, { useState } from "react";
import { ChatState } from "../../Context/chatProvider";
import axios from "axios";
import UserListItem from "../UserAvatar/UserListItem";
import UserBadgeItem from "../UserAvatar/UserBadgeItem";

const GroupChatModal = ({ children }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [groupChatName, setGroupChatName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const toast = useToast();
  const { user, chats, setChats } = ChatState();

  // 🔍 Search for users
  const handleSearch = async (query) => {
    if (!query) return;
      
    try {
      setLoading(true);
    
      // If you’ve moved to session auth, swap this header to x-session-id.
      // For now I’ll leave your existing code:
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
    
      const { data } = await axios.get(`/api/user/search?search=${query}`, config);
    
      // 🧽 Normalize fields so UserListItem has what it expects
      const normalized = (Array.isArray(data) ? data : []).map((u) => {
        const user_id = u.user_id ?? u._id;               // prefer user_id
        return {
          ...u,
          user_id,
          _id: u._id ?? user_id,
          name: u.name ?? u.meta?.display_name ?? user_id, // fallback to display_name, then id
          email: u.email ?? u.login_email ?? "",           // map login_email -> email
        };
      });
    
      setSearchResults(normalized);
    } catch (error) {
      toast({
        title: "Error Occurred!",
        description: "Failed to load search results.",
        status: "error",
        duration: 3000,
        isClosable: true,
        position: "bottom",
      });
    } finally {
      setLoading(false);
    }
  };

  // 🧠 Submit new group creation
  const handleSubmit = async () => {
    if (!groupChatName || selectedUsers.length === 0) {
      toast({
        title: "Please fill all fields",
        status: "warning",
        duration: 3000,
        isClosable: true,
        position: "bottom",
      });
      return;
    }

    try {
      setLoading(true);
      const config = {
        headers: { Authorization: `Bearer ${user.token}` },
      };

      // ✅ convert selected users to user_id strings
      const body = {
        name: groupChatName,
        users: selectedUsers.map((u) => u.user_id),
      };

      const { data } = await axios.post(`/api/chat/group`, body, config);

      const normalizedGroup = {
        ...data,
        chat_id: data.group_id,
        chatName: data.name,
        isGroupChat: true,
        users: selectedUsers.concat([user]),
      };
      
      setChats([normalizedGroup, ...chats]);

      onClose();
      toast({
        title: "Group chat created!",
        status: "success",
        duration: 3000,
        isClosable: true,
        position: "bottom",
      });
    } catch (error) {

      toast({
      title: "Error Occurred!",
      description:"Failed to create group",
      status: "error",
      duration: 3000,
      isClosable: true,
      position: "bottom",
    });
    } finally {
      setLoading(false);
    }
  };

  // 🧠 Remove selected user
  const handleDelete = (userToDelete) => {
    setSelectedUsers(
      selectedUsers.filter((sel) => sel.user_id !== userToDelete.user_id)
    );
  };

  // 🧠 Add selected user
  const handleGroup = (userToAdd) => {
    if (selectedUsers.find((u) => u.user_id === userToAdd.user_id)) {
      toast({
        title: "User already added!",
        status: "warning",
        duration: 3000,
        isClosable: true,
        position: "bottom",
      });
      return;
    }
    setSelectedUsers([...selectedUsers, userToAdd]);
  };

  return (
    <div>
      <span onClick={onOpen}>{children}</span>

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader
            fontSize="35px"
            fontFamily="work sans"
            display="flex"
            justifyContent="center"
          >
            Create Group Chat
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody display="flex" flexDir="column" alignItems="center">
            <FormControl>
              <Input
                placeholder="Chat Name"
                mb={3}
                onChange={(e) => setGroupChatName(e.target.value)}
                value={groupChatName}
              />
            </FormControl>

            <FormControl>
              <Input
                placeholder="Add Users"
                mb={3}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </FormControl>

            {/* Selected user badges */}
            <Box w="100%" display="flex" flexWrap="wrap">
              {selectedUsers.map((u) => (
                <UserBadgeItem
                  key={u.user_id} // ✅ changed
                  user={u}
                  handleFunction={() => handleDelete(u)}
                />
              ))}
            </Box>

            {/* Search results */}
            {loading ? (
              <Spinner h="15px" w="15px" />
            ) : (
              searchResults
                .slice(0, 4)
                .map((u) => (
                  <UserListItem
                    key={u.user_id} // ✅ changed
                    user={u}
                    handleFunction={() => handleGroup(u)}
                  />
                ))
            )}
          </ModalBody>

          <ModalFooter>
            <Button
              colorScheme="blue"
              onClick={handleSubmit}
              isLoading={loading}
            >
              Create Group
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default GroupChatModal;
