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
import {
    Button,
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalOverlay,
    Text,
    useDisclosure,
    IconButton,
    Image,
    Box,
  } from "@chakra-ui/react";
  import { ViewIcon } from "@chakra-ui/icons";
  import React from "react";
  
  const ProfileModel = ({ user, children }) => {
    const { isOpen, onOpen, onClose } = useDisclosure();
  
    if (!user) {
      // Graceful handling if user is null
      return null;
    }
  
    // SOCP user fields
    const displayName =
      user?.meta?.display_name || user?.login_email || "Unknown User";
    const avatarUrl =
      user?.meta?.avatar_url ||
      "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg";
    const email = user?.login_email || "No email provided";
    const pronouns = user?.meta?.pronouns;
    const age = user?.meta?.age;
  
    return (
      <Box>
        {children ? (
          <span onClick={onOpen}>{children}</span>
        ) : (
          <IconButton display={{ base: "flex" }} icon={<ViewIcon />} onClick={onOpen} />
        )}
  
        <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
          <ModalOverlay />
          <ModalContent h="auto" maxW="500px">
            <ModalHeader
              display="flex"
              fontFamily="Work Sans"
              fontSize="32px"
              justifyContent="center"
              textAlign="center"
            >
              {displayName}
            </ModalHeader>
  
            <ModalCloseButton />
  
            <ModalBody
              display="flex"
              flexDir="column"
              alignItems="center"
              justifyContent="center"
              gap={4}
            >
              <Image
                borderRadius="full"
                boxSize="150px"
                src={avatarUrl}
                alt={displayName}
                mb={3}
              />
              <Text fontSize={{ base: "16px", md: "18px" }} fontFamily="Work Sans">
                <b>Email:</b> {email}
              </Text>
              {pronouns && (
                <Text fontSize={{ base: "14px", md: "16px" }}>
                  <b>Pronouns:</b> {pronouns}
                </Text>
              )}
              {age && (
                <Text fontSize={{ base: "14px", md: "16px" }}>
                  <b>Age:</b> {age}
                </Text>
              )}
            </ModalBody>
  
            <ModalFooter>
              <Button colorScheme="blue" mr={3} onClick={onClose}>
                Close
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </Box>
    );
  };
  
  export default ProfileModel;
  