import { Avatar } from "@chakra-ui/avatar";
import { Tooltip } from "@chakra-ui/tooltip";
import { ChatState } from "../Context/chatProvider";
import ScrollableFeed from "react-scrollable-feed";
import {
  getSenderId,
  isSameSender,
  isSameSenderMargin,
  isSameUser,
  isLastMessage,
} from "../config/chatlogics";

const ScrollableChat = ({ messages }) => {
  /*
  The  message object that is passed to this component has the following structure:

  (1) for text messages:
    { plaintext, from, to, ts, type: "MSG_PUBLIC_CHANNEL" }
  (2) for file:
        const newFileMsg = {
        type: "FILE",
        name: selectedFile.name,
        url: fileUrl,
        plaintext: `[File: ${selectedFile.name}]`,
        from,
        to,
        ts: Date.now(),
      };
  */
  const { user, selectedChat } = ChatState();

  // TODO: SECURITY RISKS
  const getPlaintext = (m) => {
    // In testing, plaintext may still be available.
    if (m.plaintext) {
      return m.plaintext;
    }
    return "[debug][scrollablechat.jsx getPlaintext] [no content]";
  };

  return (
    <ScrollableFeed>
      {messages &&
        messages.map((m, i) => {
          // Identify sender
          const senderId = getSenderId(m);
          const isMine = senderId === user.user_id;

          // Get our display name and avatar
          const senderObj = selectedChat?.users?.find((u) => u.user_id === senderId);
          // TODO: this version may not work with group chat, only DM
          const displayName = isMine
            ? "You"
            : senderObj?.meta?.display_name || senderObj?.login_email || senderId;
          const avatarSrc = isMine
            ? user?.meta?.avatar_url || ""
            : senderObj?.meta?.avatar_url ||
              "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg";
          
              return (
            <div
              key={m.message_id || m.ts || i} // Note that there is no message_id yet.
              style={{
                display: "flex",
                justifyContent: isMine ? "flex-end" : "flex-start",
                alignItems: "center",
              }}
            >
              {(isSameSender(messages, m, i, user?.user_id) || // “Show the avatar if this message was not sent by me (curr !== userId) and the next message is from a different sender (curr !== next).”
                isLastMessage(messages, i, user?.user_id)) && ( // “If this message is from someone else and it’s the very last one in the chat, show their avatar.”
                <Tooltip
                  label={displayName}
                  placement="bottom-start"
                  hasArrow
                >
                  <Avatar
                    mt="7px"
                    mr={1}
                    size="sm"
                    cursor="pointer"
                    name={displayName}
                    src={avatarSrc}
                  />
                </Tooltip>
              )}

              <span
                style={{
                  backgroundColor: isMine ? "#BEE3F8" : "#B9F5D0",
                  marginLeft: !isMine
                    ? isSameSenderMargin(messages, m, i, user?.user_id)
                    : 0,
                  marginTop: isSameUser(messages, m, i) ? 3 : 10,
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
                {m.successful && (
                  <span style={{ fontSize: "0.75rem", marginLeft: "6px", color: "gray" }}>
                    ✓
                  </span>
                )}
              </span>
            </div>
          );
        })}
    </ScrollableFeed>
  );
};

export default ScrollableChat;
