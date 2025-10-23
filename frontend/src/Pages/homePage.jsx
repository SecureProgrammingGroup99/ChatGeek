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
import React, { useEffect } from 'react'
import { Box, Container, Text } from '@chakra-ui/react'
import { Tabs, TabList, TabPanels, Tab, TabPanel } from '@chakra-ui/react'
import Login from '../components/Authentication/Login'
import Signup from '../components/Authentication/Signup'
import { useHistory } from 'react-router-dom'
import { ChatState } from "../Context/chatProvider";



const HomePage = () => {

    const { privateKey } = ChatState();
    
    const history = useHistory();

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem("userInfo"));
        if (user && privateKey) history.push("/chats");
    }, [history]);

    return (
        <Container maxW='xl' centerContent mb={"2rem"}>
            <Box display="flex" justifyContent="center" p={3} bg={"transparent"} w="100%" m="40px 0 15px 0" borderRadius="lg" borderWidth="1px" style={{ border: "none"}} >
                <Text fontSize="4xl" fontFamily="Work sans" color="white" fontWeight={"extrabold"}>
                    ChatGeek
                </Text>
            </Box>

            <Box display="flex" bg={"white"} w={"100%"} p={4} borderRadius={'lg'} borderWidth={'1px'} justifyContent="Center">
                <Tabs variant='soft-rounded' colorScheme='cyan' color={"black"} width={"100%"}>
                    <TabList mb={"1em"}>
                        <Tab width={'50%'}>Login</Tab>
                        <Tab width={'50%'}>Signup</Tab>
                    </TabList>
                    <TabPanels>
                        <TabPanel>
                            <Login/>
                        </TabPanel>
                        <TabPanel>
                            <Signup/>
                        </TabPanel>
                    </TabPanels>
                </Tabs>
            </Box>
        </Container>
    )
}

export default HomePage