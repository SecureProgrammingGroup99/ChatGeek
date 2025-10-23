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
import { Skeleton, Stack } from '@chakra-ui/react'
import React from 'react'

const ChatLoading = () => {
    return (
        <Stack>
            <Skeleton h={"45px"} />
            <Skeleton h={"45px"} />
            <Skeleton h={"45px"} />
            <Skeleton h={"45px"} />
            <Skeleton h={"45px"} />
            <Skeleton h={"45px"} />
            <Skeleton h={"45px"} />
            <Skeleton h={"45px"} />
            <Skeleton h={"45px"} />
            <Skeleton h={"45px"} />
            <Skeleton h={"45px"} />
            <Skeleton h={"45px"} />
        </Stack>
    )
}

export default ChatLoading