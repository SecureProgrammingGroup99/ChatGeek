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
import { createContext, useContext, useEffect, useState } from "react";
import { useHistory } from 'react-router-dom';


const ChatContext = createContext();
const ChatProvider = ({ children }) => {

    const [user, setUser] = useState("");
    const [selectedChat, setSelectedChat] = useState("");
    const [chats, setChats] = useState([]);
    const [notification, setNotification] = useState([]);
    const history = useHistory();
    
    const [privateKey, setPrivateKey] = useState(null);//  memory-only private key
    
    // auto-load user from localStorage
    useEffect(() => {
        const userInfo = JSON.parse(localStorage.getItem("userInfo"));
        if (!userInfo) {
          setUser(null);
          history.push("/");
          return;
        }
        setUser(userInfo);
      }, [history]);

    //  Auto-logout and clear private key after 15 minutes
    useEffect(() => {
        if (!privateKey) return;
    
        const timer = setTimeout(() => {
        console.warn("[SECURITY] Private key cleared due to timeout");
    
        setPrivateKey(null);
        setUser(null);
        localStorage.removeItem("userInfo");
    
        history.push("/login"); // redirect user to login page
        }, 15 * 60 * 1000); // 15 minutes
    
        return () => clearTimeout(timer);
    }, [privateKey]);

    


    return (
        <ChatContext.Provider
        value={{
            user,
            setUser,
            selectedChat,
            setSelectedChat,
            chats,
            setChats,
            notification,
            setNotification,
            privateKey,
            setPrivateKey,
        }}
        >
        {children}
        </ChatContext.Provider>

    )
};

export const ChatState = () => {

    return useContext(ChatContext)
}

export default ChatProvider;