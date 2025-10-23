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
const storage = require("node-persist");
async function initReplayStore(){ await storage.init({ dir: "secure-keystore/slc-pstore", forgiveParseErrors: true }); }
async function verifyAndConsume(clientId, nonce, counter){
  await storage.init();
  const key=`client:${clientId}`; const st=(await storage.getItem(key))||{ lastCounter:-1, nonces:[] };
  if(typeof counter!=="number" || counter<=st.lastCounter) return false;
  if(st.nonces.includes(nonce)) return false;
  st.lastCounter = counter; st.nonces.push(nonce); if(st.nonces.length>200) st.nonces = st.nonces.slice(-200);
  await storage.setItem(key, st); return true;
}
module.exports = { initReplayStore, verifyAndConsume };
