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
import React, { useState } from 'react'
import { ChatState } from "../Context/chatProvider"
import { useEffect } from "react";
import { useHistory } from "react-router-dom";
import { Box } from '@chakra-ui/react'
import SideDrawer from "../components/misc/SideDrawer.jsx"
import MyChat from "../components/MyChat";
import ChatBox from "../components/ChatBox";

const ChatPage = () => {

    const { user, privateKey } = ChatState();

    const history = useHistory();

    const [fetchAgain, setFetchAgain] = useState(false);

    useEffect(() => {
      if (!user || !privateKey) {
        console.warn("Timeout!  redirecting to login");
        localStorage.removeItem("userInfo");
        history.push("/");
      }
    }, [user, privateKey, history]);
  
    if (!user || !privateKey) {
      // Prevent rendering before redirect happens
      return null;
    }

    return (
        <div style={{ width: "100%" }}>
            {user && <SideDrawer />}
            <Box
                display={"flex"}
                justifyContent={"space-between"}
                w={"100%"}
                h={"91.5vh"}
                p={"10px"}
            >
                {user && <MyChat fetchAgain={fetchAgain} />}
                {user && <ChatBox fetchAgain={fetchAgain} setFetchAgain={setFetchAgain} />}
            </Box>
        </div>
    );
}

export default ChatPage;