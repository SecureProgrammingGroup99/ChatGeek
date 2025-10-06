import { BellIcon, ChevronDownIcon } from "@chakra-ui/icons";
import {
  Avatar,
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Input,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Spinner,
  Text,
  Tooltip,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { ChatState } from "../../Context/chatProvider";
import ProfileModel from "./profileModel";
import { useHistory } from "react-router-dom/cjs/react-router-dom.min";
import React, { useState } from "react";
import axios from "axios";
import ChatLoading from "../ChatLoading";
import UserListItem from "../UserAvatar/UserListItem";
import { getSender } from "../../config/chatlogics";
import NotificationBadge from "react-notification-badge";

const SideDrawer = () => {
  const history = useHistory();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);

  const { user, setSelectedChat, chats, setChats, notification, setNotification } =
    ChatState();

  const toast = useToast();

  const logoutHandler = () => {
    localStorage.removeItem("userInfo");
    history.push("/");
  };

  // 🔍 User search (uses /api/user/search)
  const handleSearch = async () => {
    if (!search.trim()) {
      toast({
        title: "Please enter something",
        status: "warning",
        duration: 3000,
        isClosable: true,
        position: "bottom",
      });
      return;
    }

    try {
      setLoading(true);

      // Prefer SRP session; fallback to legacy Bearer if it's still around
      const sid = sessionStorage.getItem("session_id");
      const config = {
        headers: {
          ...(sid
            ? { "x-session-id": sid }
            : user?.token
            ? { Authorization: `Bearer ${user.token}` }
            : {}),
        },
      };

      const { data } = await axios.get(
        `/api/user/search?search=${encodeURIComponent(search)}`,
        config
      );

      // 🧽 Normalize fields for UI components (UserListItem, etc.)
      const normalized = (Array.isArray(data) ? data : []).map((u) => {
        const user_id = u.user_id ?? u._id;
        return {
          ...u,
          user_id,
          _id: u._id ?? user_id,
          name: u.name ?? u.meta?.display_name ?? user_id,
          email: u.email ?? u.login_email ?? "",
        };
      });

      setSearchResults(normalized);
    } catch (error) {
      toast({
        title: "Error occurred!",
        description:
          error?.response?.data?.error || error.message || "Failed to load search results",
        status: "error",
        duration: 3000,
        isClosable: true,
        position: "bottom",
      });
    } finally {
      setLoading(false);
    }
  };

  // 💬 Start or access DM
  const accessChat = async (userId) => {
    try {
      setLoadingChat(true);

      const sid = sessionStorage.getItem("session_id");
      const config = {
        headers: {
          "Content-Type": "application/json",
          ...(sid
            ? { "x-session-id": sid }
            : user?.token
            ? { Authorization: `Bearer ${user.token}` }
            : {}),
        },
      };

      // ✅ Send new-format payload
      const { data } = await axios.post("/api/chat", { userId }, config);

      // ✅ use chat_id instead of _id
      if (!chats.find((c) => c.chat_id === data.chat_id)) {
        setChats([data, ...chats]);
      }

      setSelectedChat(data);
      setLoadingChat(false);
      onClose();
    } catch (error) {
      toast({
        title: "Error occurred!",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true,
        position: "bottom",
      });
      setLoadingChat(false);
    }
  };

  return (
    <>
      <Box
        display={"flex"}
        justifyContent={"space-between"}
        alignItems={"center"}
        bg={"white"}
        w={"100%"}
        p={"5px 10px 5px 10px"}
        borderWidth={"5px"}
      >
        <Tooltip label="Search User" hasArrow placement="bottom-end">
          <Button variant={"ghost"} onClick={onOpen}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
            >
              <path
                fill="currentColor"
                d="M9.5 16q-2.725 0-4.612-1.888T3 9.5q0-2.725 1.888-4.612T9.5 3q2.725 0 4.612 1.888T16 9.5q0 1.1-.35 2.075T14.7 13.3l5.6 5.6q.275.275.275.7t-.275.7q-.275.275-.7.275t-.7-.275l-5.6-5.6q-.75.6-1.725.95T9.5 16Zm0-2q1.875 0 3.188-1.313T14 9.5q0-1.875-1.313-3.188T9.5 5Q7.625 5 6.312 6.313T5 9.5q0 1.875 1.313 3.188T9.5 14Z"
              />
            </svg>
            <Text display={{ base: "none", md: "flex" }} px={4}>
              Search user
            </Text>
          </Button>
        </Tooltip>

        <Text fontSize={"2xl"} fontFamily={"Work sans"}>
          ChatGeek
        </Text>

        <div>
          {/* 🔔 Notifications */}
          <Menu>
            <MenuButton p={1}>
              <NotificationBadge
                count={notification.length}
                effect={[
                  null,
                  null,
                  { top: "-5px", transform: "scale(1.1, 1.2)" },
                  { top: "0px", transform: "scale(1, 1)" },
                ]}
              />
              <BellIcon fontSize={"2xl"} m={1} />
            </MenuButton>

            <MenuList>
              {!notification.length && "No New Messages"}
              {notification.map((notif) => (
                <MenuItem
                  key={notif.message_id || notif.id || Math.random()}
                  onClick={() => {
                    setSelectedChat(notif.chat);
                    setNotification(notification.filter((n) => n !== notif));
                  }}
                >
                  {notif.chat.isGroupChat
                    ? `New message in ${notif.chat.chatName}`
                    : `New message from ${getSender(user, notif.chat.users)}`}
                </MenuItem>
              ))}
            </MenuList>
          </Menu>

          {/* 👤 Profile menu */}
          <Menu>
            <MenuButton as={Button} rightIcon={<ChevronDownIcon />}>
              <Avatar
                size={"sm"}
                cursor={"pointer"}
                name={user?.meta?.display_name || user?.login_email}
                src={
                  user?.meta?.avatar_url ||
                  "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg"
                }
              />
            </MenuButton>
            <MenuList>
              <ProfileModel user={user}>
                <MenuItem>My Profile</MenuItem>
              </ProfileModel>
              <MenuDivider />
              <MenuItem onClick={logoutHandler}>Logout</MenuItem>
            </MenuList>
          </Menu>
        </div>
      </Box>

      {/* 🔍 Drawer for user search */}
      <Drawer placement="left" onClose={onClose} isOpen={isOpen}>
        <DrawerOverlay />
        <DrawerContent>
          <DrawerHeader borderBottomWidth="1px">Search Users</DrawerHeader>
          <DrawerBody>
            <Box display="flex" w={"100%"} pb={2}>
              <Input
                w={"90%"}
                placeholder="Search by name or email"
                mr={2}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button onClick={handleSearch}>Go</Button>
            </Box>
            {loading ? (
              <ChatLoading />
            ) : (
              searchResults?.map((u) => (
                <UserListItem
                  key={u.user_id}
                  user={u}
                  handleFunction={() => accessChat(u.user_id)}
                />
              ))
            )}
            {loadingChat && <Spinner ml="auto" d="flex" />}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default SideDrawer;
