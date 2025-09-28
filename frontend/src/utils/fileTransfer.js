// Handles splitting, sending, and receiving file chunks

import { encrypt, decrypt } from "./cryptoHelpers"; //from Josh: import { encrypt, decrypt } from "../utils/cryptoHelpers";

import { sendToServer } from "./slc"; //from Akash: import { sendToServer } from "../utils/slc";

const CHUNK_SIZE = 16 * 1024; // 16 KB per chunk (tune for RSA performance)

export async function sendFile(file, recipientId, encryptionKey) {
  // Step 1: Notify start
  const fileId = `${Date.now()}-${file.name}`;
  sendToServer("fileStart", {
    fileId,
    fileName: file.name,
    fileSize: file.size,
    recipientId,
  });

  //Step 2: Read & send chunks
  const reader = file.stream().getReader();
  let offset = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Split further if > CHUNK_SIZE
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      const chunk = value.slice(i, i + CHUNK_SIZE);
      const ciphertext = encrypt(chunk, encryptionKey);

      sendToServer("fileChunk", {
        fileId,
        offset,
        data: ciphertext,
      });
      offset += chunk.length;
    }
  }

  //Step 3: Notify end
  sendToServer("fileEnd", {
    fileId,
    recipientId,
  });
}

export function handleIncomingFileMessages(onFileReceived) {
  // Called when Akash routes "fileStart/fileChunk/fileEnd" 
  const buffers = {}; // fileId -> array of chunks + metadata

  function onMessage(type, payload) {
    if (type === "fileStart") {
      buffers[payload.fileId] = {
        name: payload.fileName,
        size: payload.fileSize,
        chunks: [],
      };
    }
    else if (type === "fileChunk") {
      const buf = buffers[payload.fileId];
      if (buf) buf.chunks.push(payload.data);
    }
    else if (type === "fileEnd") {
      const buf = buffers[payload.fileId];
      if (buf) {
        // Reassemble
        const decryptedChunks = buf.chunks.map(c => decrypt(c));
        const blob = new Blob(decryptedChunks);
        onFileReceived({
          name: buf.name,
          size: buf.size,
          blob,
        });
        delete buffers[payload.fileId];
      }
    }
  }

  return { onMessage };
}
