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
const cfg = require('./config');

function selfUrl() {
  return `ws://${cfg.SERVER_HOST}:${cfg.MESH_WS_PORT}`;
}

function getSelfInfo() {
  return {
    server_id: cfg.SERVER_ID,            // UUID v4
    url: selfUrl(),                     // e.g., ws://127.0.0.1:7081
    pubkey_b64url: cfg.SERVER_PUBLIC_KEY_B64URL,
  };
}

module.exports = { selfUrl, getSelfInfo };
