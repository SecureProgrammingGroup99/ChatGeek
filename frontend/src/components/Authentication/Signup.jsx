import {
    Button,
    FormControl,
    FormLabel,
    Input,
    InputGroup,
    InputRightElement,
    VStack,
    useToast,
  } from "@chakra-ui/react";
  import React, { useState } from "react";
  import axios from "axios";
  import { useHistory } from "react-router-dom/cjs/react-router-dom.min";
  import { CryptoUtils } from "../../utils/cryptoUtils";
  import { ChatState } from "../../Context/chatProvider";
  import { v4 as uuidv4 } from "uuid";
  
  const Signup = () => {
    const [show, setShow] = useState(false);
    const [confirmShow, setConfirmShow] = useState(false);
    const [loginEmail, setLoginEmail] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const toast = useToast();
    const history = useHistory();
    const { setUser, setPrivateKey } = ChatState();
  
    const handleClick = () => setShow(!show);
    const ConfirmhandleClick = () => setConfirmShow(!confirmShow);
  
    const submitHandler = async () => {
      setLoading(true);
  
      if (!loginEmail || !displayName || !password || !confirmPassword) {
        toast({
          title: "Please fill all fields!",
          status: "warning",
          duration: 5000,
          isClosable: true,
          position: "bottom",
        });
        setLoading(false);
        return;
      }
  
      if (password !== confirmPassword) {
        toast({
          title: "Passwords do not match!",
          status: "warning",
          duration: 5000,
          isClosable: true,
          position: "bottom",
        });
        setLoading(false);
        return;
      }
  
      try {
        const config = { headers: { "Content-type": "application/json" } };
        const userUuid = uuidv4(); // internal SOCP UUID
  
        const keyPair = await CryptoUtils.generateKeyPair();
  
        const pakeVerifier = CryptoUtils.generatePakeVerifier(password);
        const encryptedPrivateKey = CryptoUtils.encryptPrivateKey(
          keyPair.privateKey,
          password
        );
  
        const { data } = await axios.post(
          "/api/user/register",
          {
            user_id: userUuid,
            login_email: loginEmail,
            pubkey: keyPair.publicKey,
            privkey_store: encryptedPrivateKey,
            pake_password: pakeVerifier,
            meta: { display_name: displayName },
          },
          config
        );
  
  
        // ✅ Store minimal info
        localStorage.setItem("userInfo", JSON.stringify(data.user));
        setUser(data.user);
        setPrivateKey(keyPair.privateKey);
  
        toast({
          title: "Registration Successful!",
          status: "success",
          duration: 5000,
          isClosable: true,
          position: "bottom",
        });
  
        setLoading(false);
        history.push("/chats");
      } catch (error) {
        console.error("❌ Registration error:", error);
        toast({
          title: "Error Occurred!",
          description: error.response?.data?.error || "Registration failed",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "bottom",
        });
        setLoading(false);
      }
    };
  
    return (
      <VStack spacing="5px" color="black">
        <FormControl id="loginEmail" isRequired>
          <FormLabel>Email</FormLabel>
          <Input
            placeholder="Enter your email"
            onChange={(e) => setLoginEmail(e.target.value)}
            value={loginEmail}
          />
        </FormControl>
  
        <FormControl id="displayName" isRequired>
          <FormLabel>Display Name</FormLabel>
          <Input
            placeholder="Enter your display name"
            onChange={(e) => setDisplayName(e.target.value)}
            value={displayName}
          />
        </FormControl>
  
        <FormControl id="password" isRequired>
          <FormLabel>Password</FormLabel>
          <InputGroup>
            <Input
              type={show ? "text" : "password"}
              placeholder="Enter your password"
              onChange={(e) => setPassword(e.target.value)}
              value={password}
            />
            <InputRightElement width="4.5rem">
              <Button h="1.5rem" w="3rem" size="sm" onClick={handleClick}>
                {show ? "Hide" : "Show"}
              </Button>
            </InputRightElement>
          </InputGroup>
        </FormControl>
  
        <FormControl id="confirmPassword" isRequired>
          <FormLabel>Confirm Password</FormLabel>
          <InputGroup>
            <Input
              type={confirmShow ? "text" : "password"}
              placeholder="Confirm your password"
              onChange={(e) => setConfirmPassword(e.target.value)}
              value={confirmPassword}
            />
            <InputRightElement width="4.5rem">
              <Button
                h="1.5rem"
                w="3rem"
                size="sm"
                onClick={ConfirmhandleClick}
              >
                {confirmShow ? "Hide" : "Show"}
              </Button>
            </InputRightElement>
          </InputGroup>
        </FormControl>
  
        <Button
          colorScheme="blue"
          w="100%"
          mt={4}
          onClick={submitHandler}
          isLoading={loading}
        >
          Sign Up
        </Button>
      </VStack>
    );
  };
  
  export default Signup;
  
