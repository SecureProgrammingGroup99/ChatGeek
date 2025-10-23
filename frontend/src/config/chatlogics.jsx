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
/**
 * Extracts the logical sender ID for any SOCP frame type.
 * Works for both outgoing frames (with `.from`) and
 * incoming USER_DELIVER frames (with `.payload.sender`).
 */

/*
SUMMARY OF all message frame types that are passed into ScrollableChat.jsx:

1-Sent Text Message (we  others)

{
"type": "MSG_DIRECT" | "MSG_PUBLIC_CHANNEL",
"from": "our_user_id_of_sender",
"to": "user_id_or_group_id",
"ts": 1700000400000,
"payload": {
  "ciphertext": "<b64url>",
  "sender_pub": "<b64url_RSA4096_pub>",
  "content_sig": "<b64url_RSASSA-PSS>"
},
"sig": "",
"plaintext": "Hello everyone!",
"successful": true
}

2-Received Text Message (others  we)

{
"type": "USER_DELIVER",
"from": "sender_user_id",
"to": "our_user_id_or_group_id",
"ts": 1700000400100,
"payload": {
  "ciphertext": "<b64url>",
  "sender_pub": "<b64url_RSA4096_pub>",
  "content_sig": "<b64url_RSASSA-PSS>"
},
"sig": "<server_signature>",
"plaintext": "Hello everyone!",
"successful": true
}

3-Sent File Message (we  others)
{
"type": "FILE",
"name": "report.pdf",
"url": "blob:http://localhost/.../abcdef1234",
"plaintext": "[File: report.pdf]",
"from": "user_id_of_sender",
"to": "recipient_user_id_or_group_id",
"ts": 1700000700000,
"successful": true
}

4-Received File Message (others  we)
{
"type": "FILE",
"name": "report.pdf",
"url": "blob:http://localhost/.../fedcba5678",
"plaintext": "[File: report.pdf]",
"from": "sender_user_id",
"to": "your_user_id_or_group_id",
"ts": 1700000701000,
"successful": true
}

*/

/**
 * Return the senders UUID from a message frame.
 */
export const getSenderId = (m) => {
  if (!m) return null;
  if (m.from) return m.from; 
  return null;
};

/**
 * Determine whether to show the avatar next to this message.
 * Shown when:
 *  - Next message is from a different sender, or
 *  - This message is the last from that sender.
 */
export const isSameSender = (messages, m, i, userId) => {
if (!messages || i >= messages.length - 1) return false;

const curr = getSenderId(m);
const next = getSenderId(messages[i + 1]);

return curr !== userId && curr !== next;
// Show the avatar if this message was not sent by me (curr !== userId) and the next message is from a different sender (curr !== next).
};

/**
 * Show avatar for the last message in the conversation
 * if it's not from the logged-in user.
 */
export const isLastMessage = (messages, i, userId) => {
if (!messages || messages.length === 0) return false;

const curr = getSenderId(messages[i]);
const last = getSenderId(messages[messages.length - 1]);

return curr !== userId && curr === last;
// If this message is from someone else and its the very last one in the chat, show their avatar.
};


/**
 * Determine the left margin for message bubbles.
 * - "auto" for your own messages (align right)
 * - 33px when next message is from the same sender (group stack)
 * - 0px otherwise (new sender)
 */
export const isSameSenderMargin = (messages, m, i, userId) => {
if (!messages || messages.length === 0) return 0;

const curr = getSenderId(m);
const next = i < messages.length - 1 ? getSenderId(messages[i + 1]) : null;
const isMine = curr === userId;

if (isMine) return "auto";
if (next === curr) return 33;
return 0;
};

/**
 * Determines whether this message should visually stack
 * with the one above (same sender, consecutive).
 */
export const isSameUser = (messages, m, i) => {
if (i === 0) return false;
const curr = getSenderId(m);
const prev = getSenderId(messages[i - 1]);
return curr === prev;
};

/* ------------------------------------------------------------------
    SOCP-aware replacements for getSender / getSenderpic / getSenderFull
    Users are objects of shape:
    {
      user_id: "UUID",
      login_email: "...",
      meta: { display_name, avatar_url, ... }
    }
------------------------------------------------------------------- */

export const getSender = (loggedUser, users) => {
  if (!users || users.length < 2) return "Unknown";
  const other = users.find((u) => u.user_id !== loggedUser?.user_id);
  return other?.meta?.display_name || other?.login_email || "Unknown User";
};

export const getSenderPic = (loggedUser, users) => {
  if (!users || users.length < 2) return "";
  const other = users.find((u) => u.user_id !== loggedUser?.user_id);
  return (
    other?.meta?.avatar_url ||
    "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg"
  );
};

export const getSenderFull = (loggedUser, users) => {
  if (!users || users.length < 2) return null;
  return users.find((u) => u.user_id !== loggedUser?.user_id) || null;
};