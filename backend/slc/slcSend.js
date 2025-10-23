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
const { buildEnvelope } = require("./slcClient");
const { getAndIncrementCounter } = require("./counter");
async function slcSend(ws, op, body, clientId="ui.local"){
  const env = buildEnvelope(op, body);
  env.counter = await getAndIncrementCounter(clientId);
  ws.send(JSON.stringify(env));
}
module.exports = { slcSend };
