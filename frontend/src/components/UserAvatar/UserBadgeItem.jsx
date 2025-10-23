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
import { CloseIcon } from '@chakra-ui/icons'
import { Box } from '@chakra-ui/react'
import React from 'react'

const UserBadgeItem = ({ user, handleFunction }) => {
    return (
        <Box
            px={2}
            py={1}
            borderRadius={"lg"}
            m={1}
            mb={2}
            fontSize={12}
            backgroundColor={"purple.400"}
            color="white"
            cursor={"pointer"}
            onClick={handleFunction}
        >
            {user.name}
            <CloseIcon pl={1} />

        </Box>
    )
}

export default UserBadgeItem