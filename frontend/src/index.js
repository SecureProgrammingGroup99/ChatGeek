import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { ChakraProvider } from "@chakra-ui/react";
import { BrowserRouter } from "react-router-dom/cjs/react-router-dom.min";
import ChatProvider from "./Context/chatProvider";

import axios from 'axios';
const sid = sessionStorage.getItem('session_id');
if (sid) axios.defaults.headers.common['x-session-id'] = sid;

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <>
    <BrowserRouter>
      <ChakraProvider>
        <ChatProvider>
          <App />
        </ChatProvider>
      </ChakraProvider>
    </BrowserRouter>
  </>
);
