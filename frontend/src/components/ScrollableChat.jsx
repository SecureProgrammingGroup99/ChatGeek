import { Avatar } from "@chakra-ui/avatar";
import { Tooltip } from "@chakra-ui/tooltip";
import { ChatState } from "../Context/chatProvider";
import ScrollableFeed from 'react-scrollable-feed'
import { isLastMessage, isSameSender, isSameSenderMargin, isSameUser } from "../config/chatlogics";

const ScrollableChat = ({ messages }) => {
    const { user } = ChatState();

    return (
            <ScrollableFeed >
                {messages &&
                    messages.map((m, i) => (
                        <div style={{ display: "flex" }} key={m._id}>
                            {(isSameSender(messages, m, i, user._id) ||
                                isLastMessage(messages, i, user._id)) && (
                                    <Tooltip label={m.sender.name} placement="bottom-start" hasArrow>
                                        <Avatar
                                            mt="7px"
                                            mr={1}
                                            size="sm"
                                            cursor="pointer"
                                            name={m.sender.name}
                                            src={m.sender.pic}
                                        />
                                    </Tooltip>
                                )}
                            <span
                                style={{
                                    backgroundColor: `${m.sender?._id === user._id ? "#BEE3F8" : "#B9F5D0"}`,
                                    marginLeft: isSameSenderMargin(messages, m, i, user._id),
                                    marginTop: isSameUser(messages, m, i, user._id) ? 3 : 10,
                                    borderRadius: "20px",
                                    padding: "5px 15px",
                                    maxWidth: "75%",
                                    wordBreak: "break-word",
                                }}
                                >
                                {/* ==== Detect whether this is a file or normal message ==== */}
                                {m.type === "FILE" ? (
                                    // 📎 File bubble — clickable download link
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
                                    // 🗨️ Normal text bubble
                                    m.plaintext || "[no content]"
                                )}
                            </span>

                        </div>
                    ))}
            </ScrollableFeed>
    );
};

export default ScrollableChat;
