//src/components/ScrollableChat.jsx
import { Avatar } from "@chakra-ui/avatar";
import { Tooltip } from "@chakra-ui/tooltip";
import { ChatState } from "../Context/chatProvider";
import ScrollableFeed from "react-scrollable-feed";
import {
    getSenderId,
    isSameSender,
    isSameSenderMargin,
    isSameUser,
    isLastMessage
  } from "../config/chatlogics";

const ScrollableChat = ({ messages }) => {
  const { user } = ChatState();

  const getPlaintext = (m) => {
    // For now, frontend stores plaintext in m.plaintext when testing;
    // later this will be decrypted ciphertext.
    if (m.plaintext){
        console.warn("[SOCP][ScrollableChat] m.plaintext appears as plaintext, not encrypted for message:", m);
        return m.plaintext;
    } 
    if (m.payload?.ciphertext) return m.payload.ciphertext;
    return "[no content]";
  };

  console.log("[SOCP][ScrollableChat] rendering messages:", messages);

  return (
    <ScrollableFeed>
      {messages &&
        messages.map((m, i) => {

          const senderId = getSenderId(m);
          const isMine = senderId === user._id;

          return (
            <div
                key={m._id || m.ts || i}
                style={{
                    display: "flex",
                    justifyContent: isMine ? "flex-end" : "flex-start", 
                    alignItems: "center",
                }}
                >
              {(isSameSender(messages, m, i, user._id) ||
                isLastMessage(messages, i, user._id)) && (
                <Tooltip
                  label={senderId === user._id ? "You" : senderId || "Unknown"}
                  placement="bottom-start"
                  hasArrow
                >
                  <Avatar
                    mt="7px"
                    mr={1}
                    size="sm"
                    cursor="pointer"
                    name={senderId || "?"}
                    src={m.sender?.pic || ""}
                  />
                </Tooltip>
              )}
                <span
                style={{
                    backgroundColor: isMine ? "#BEE3F8" : "#B9F5D0",
                    marginLeft: !isMine ? isSameSenderMargin(messages, m, i, user._id) : 0,
                    marginTop: isSameUser(messages, m, i, user._id) ? 3 : 10,
                    borderRadius: "20px",
                    padding: "5px 15px",
                    maxWidth: "75%",
                    wordBreak: "break-word",
                }}
                >

                {/* ==== Detect whether this is a file or normal message ==== */}
                {m.type === "FILE" ? (
                  <a
                    href={m.url}
                    download={m.name}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span role="img" aria-label="file">
                      📎
                    </span>
                    <b>{m.name}</b>
                  </a>
                ) : (
                  getPlaintext(m)
                )}
              </span>
            </div>
          );
        })}
    </ScrollableFeed>
  );
};

export default ScrollableChat;
