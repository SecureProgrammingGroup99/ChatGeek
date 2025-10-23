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
const { createSlcSocket, buildEnvelope } = require("../services/slc/slcClient");
const { getAndIncrementCounter, initCounter } = require("../services/slc/counter");
(async()=>{
  await initCounter();
  const ws = await createSlcSocket();
  ws.on("open", async ()=>{
    let c = await getAndIncrementCounter("ui.local");
    let env = buildEnvelope("SEND_CHAT", { chatId:"C-DEMO", toUserId:"U2", content:"hello via SLC" });
    env.counter=c; ws.send(JSON.stringify(env));
    c = await getAndIncrementCounter("ui.local");
    env = buildEnvelope("FILE_START", { chatId:"C-DEMO", fileId:"F1", fileName:"example.pdf", fileSize:123456, totalChunks:2 });
    env.counter=c; ws.send(JSON.stringify(env));
    c = await getAndIncrementCounter("ui.local");
    env = buildEnvelope("FILE_CHUNK", { chatId:"C-DEMO", fileId:"F1", seq:1, chunk: Buffer.from("chunk1").toString("base64") });
    env.counter=c; ws.send(JSON.stringify(env));
    c = await getAndIncrementCounter("ui.local");
    env = buildEnvelope("FILE_END", { chatId:"C-DEMO", fileId:"F1", checksum:"sha256:d34db33f" });
    env.counter=c; ws.send(JSON.stringify(env));
  });
  ws.on("message",(m)=>console.log("[SLC<-server]", m.toString()));
})();
