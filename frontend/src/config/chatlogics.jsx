// =============================================================
// 🧠 SOCP Chat Logic Utilities (Universal: Outgoing + Incoming)
// =============================================================

/**
 * Extracts the logical sender ID for any SOCP frame type.
 * Works for both outgoing frames (with `.from`) and
 * incoming `USER_DELIVER` frames (with `.payload.sender`).
 */
export const getSenderId = (m) => {
    if (!m) return null;
    if (m.from) return m.from;                       // Outgoing MSG_* or FILE_* frames
    if (m.payload && m.payload.sender) return m.payload.sender; // Incoming USER_DELIVER
    return null;
  };
  
  // =============================================================
  // 🔸 Sender utilities (used in headers / chat title)
  // =============================================================
  export const getSender = (loggedUser, users) => {
    if (!users || users.length < 2 || !loggedUser) return "";
    return users[0]._id === loggedUser._id ? users[1].name : users[0].name;
  };
  
  export const getSenderpic = (loggedUser, users) => {
    if (!users || users.length < 2 || !loggedUser) return "";
    return users[0]._id === loggedUser._id ? users[1].pic : users[0].pic;
  };
  
  export const getSenderFull = (loggedUser, users) => {
    if (!users || users.length < 2 || !loggedUser) return null;
    return users[0]._id === loggedUser._id ? users[1] : users[0];
  };
  
  // =============================================================
  // 🔸 Message layout helpers (avatars, spacing, grouping)
  // =============================================================
  
  /**
   * Determines whether to show avatar after this message.
   * Show when the next message is from a different sender,
   * and current message is not from the logged-in user.
   */
  export const isSameSender = (messages, m, i, userId) => {
    if (!messages || i >= messages.length - 1) return false;
  
    const curr = getSenderId(m);
    const next = getSenderId(messages[i + 1]);
  
    return curr !== userId && curr !== next;
  };
  
  /**
   * Returns true if this is the last message from another user
   * (used to display avatar for the last message in the list).
   */
  export const isLastMessage = (messages, i, userId) => {
    if (!messages || messages.length === 0) return false;
  
    const curr = getSenderId(messages[i]);
    const last = getSenderId(messages[messages.length - 1]);
  
    return curr !== userId && curr === last;
  };
  
  /**
   * Determines the left margin for each message bubble.
   * - "auto" for current user (right alignment)
   * - 33px when previous message from same sender
   * - 0 when sender changes
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
   * Groups stacked messages from same sender (vertical compression).
   */
  export const isSameUser = (messages, m, i) => {
    if (i === 0) return false;
  
    const curr = getSenderId(m);
    const prev = getSenderId(messages[i - 1]);
  
    return curr === prev;
  };
  