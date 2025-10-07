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
    Message shapes:
    (1) text frames: { plaintext, from, to, ts, type: "MSG_PUBLIC_CHANNEL" | "MSG_DIRECT", ... }
    (2) file frames (receiver-built):
        { type:"FILE", name, localUrl, plaintext, from, to, ts, successful }
    (3) temp sender bubble (local-only, not transmitted):
        { type:"FILE", name, localUrl, plaintext, from, to, ts, temporary:true, successful:false }
  */
  const { user, selectedChat } = ChatState();

  const getPlaintext = (m) => {
<<<<<<< HEAD
    // In testing, plaintext may still be available.
    if (m.plaintext) {
      return m.plaintext;
    }
    return "[debug][scrollablechat.jsx getPlaintext] [no content]";
=======
    if (m.plaintext) return m.plaintext;
    return "[no content]";
>>>>>>> bee8af7 (Adi's  Bug fixes)
  };

  return (
    <ScrollableFeed>
      {messages &&
        messages.map((m, i) => {
          // Identify sender
          const senderId = getSenderId(m);
          const isMine = senderId === user.user_id;

          // Find sender details from chat roster if present
          const senderObj =
            selectedChat?.users?.find((u) => u.user_id === senderId) || m?.sender || null;

          const displayName = isMine
            ? "You"
            : senderObj?.meta?.display_name || senderObj?.login_email || senderId;
          const avatarSrc = isMine
            ? user?.meta?.avatar_url || ""
            : senderObj?.meta?.avatar_url ||
              "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg";

          return (
            <div
              key={m.message_id || m.ts || `${i}-${m.name || ""}`}
              style={{
                display: "flex",
                justifyContent: isMine ? "flex-end" : "flex-start",
                alignItems: "center",
              }}
            >
              {(isSameSender(messages, m, i, user?.user_id) ||
                isLastMessage(messages, i, user?.user_id)) && (
                <Tooltip label={displayName} placement="bottom-start" hasArrow>
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
                {/* ==== File vs text ==== */}
                {m.type === "FILE" ? (
                  <a
                    href={m.localUrl || (isMine ? m.url : undefined)} // prefer local, never use others' blob URL
                    download={m.name}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      opacity: m.localUrl ? 1 : 0.7,
                      pointerEvents: m.localUrl || isMine ? "auto" : "none",
                    }}
                    onClick={(e) => {
                      if (!m.localUrl && !isMine) e.preventDefault();
                    }}
                    title={m.localUrl || isMine ? "Download" : "Preparing…"}
                  >
                    <span role="img" aria-label="file">
                      📎
                    </span>
                    <b>{m.name}</b>
                    {!m.localUrl && !isMine && (
                      <span style={{ fontSize: "0.8rem", marginLeft: 8 }}>(preparing…)</span>
                    )}
                  </a>
                ) : (
                  getPlaintext(m)
                )}

                {m.successful && (
                  <span style={{ fontSize: "0.75rem", marginLeft: "6px", color: "gray" }}>✓</span>
                )}
              </span>
            </div>
          );
        })}
    </ScrollableFeed>
  );
};

export default ScrollableChat;
