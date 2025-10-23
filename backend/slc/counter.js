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
async function initCounter(){ await storage.init({ dir: "secure-keystore/slc-pstore", forgiveParseErrors: true }); }
async function getAndIncrementCounter(clientId){
  await storage.init();
  const key=`ctr:${clientId}`; const val=(await storage.getItem(key))||0; const next=val+1;
  await storage.setItem(key, next); return next;
}
module.exports = { initCounter, getAndIncrementCounter };
