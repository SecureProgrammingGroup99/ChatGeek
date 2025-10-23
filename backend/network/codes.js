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
const ERR = {
  UNKNOWN_TYPE:    "UNKNOWN_TYPE",
  MISSING_SIG:     "MISSING_SIG",
  INVALID_SIG:     "INVALID_SIG",
  UNKNOWN_PEER_KEY:"UNKNOWN_PEER_KEY",
  BAD_PAYLOAD:     "BAD_PAYLOAD",
  BAD_TIMESTAMP:   "BAD_TIMESTAMP",
  PAYLOAD_TOO_LARGE:"PAYLOAD_TOO_LARGE",
  USER_NOT_FOUND:  "USER_NOT_FOUND",
  FORBIDDEN:       "FORBIDDEN",
  RATE_LIMIT:      "RATE_LIMIT",
  TIMEOUT:         "TIMEOUT",
  BAD_FROM:        "BAD_FROM",
  BAD_URL:         "BAD_URL",
  BAD_PUBKEY:      "BAD_PUBKEY",
};
module.exports = { ERR };
