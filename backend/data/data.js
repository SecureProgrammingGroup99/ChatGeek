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
const chats = [
    {
        isGroupChat: false,
        users: [
            {
                name: "John Doe",
                email: "john@example.com",
            },
            {
                name: "Piyush",
                email: "piyush@example.com",
            },
        ],
        _id: "617a077e18c25468bc7c4dd4",
        chatName: "John Doe",
    },
    {
        isGroupChat: false,
        users: [
            {
                name: "Guest User",
                email: "guest@example.com",
            },
            {
                name: "Piyush",
                email: "piyush@example.com",
            },
        ],
        _id: "617a077e18c25468b27c4dd4",
        chatName: "Guest User",
    },
    {
        isGroupChat: false,
        users: [
            {
                name: "Anthony",
                email: "anthony@example.com",
            },
            {
                name: "Piyush",
                email: "piyush@example.com",
            },
        ],
        _id: "617a077e18c2d468bc7c4dd4",
        chatName: "Anthony",
    },
    {
        isGroupChat: true,
        users: [
            {
                name: "John Doe",
                email: "jon@example.com",
            },
            {
                name: "Piyush",
                email: "piyush@example.com",
            },
            {
                name: "Guest User",
                email: "guest@example.com",
            },
        ],
        _id: "617a518c4081150716472c78",
        chatName: "Friends",
        groupAdmin: {
            name: "Guest User",
            email: "guest@example.com",
        },
    },
    {
        isGroupChat: false,
        users: [
            {
                name: "Jane Doe",
                email: "jane@example.com",
            },
            {
                name: "Piyush",
                email: "piyush@example.com",
            },
        ],
        _id: "617a077e18c25468bc7cfdd4",
        chatName: "Jane Doe",
    },
    {
        isGroupChat: true,
        users: [
            {
                name: "John Doe",
                email: "jon@example.com",
            },
            {
                name: "Piyush",
                email: "piyush@example.com",
            },
            {
                name: "Guest User",
                email: "guest@example.com",
            },
        ],
        _id: "617a518c4081150016472c78",
        chatName: "Chill Zone",
        groupAdmin: {
            name: "Guest User",
            email: "guest@example.com",
        },
    },
];

module.exports = { chats };