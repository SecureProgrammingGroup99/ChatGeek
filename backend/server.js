const express = require("express");
const dotenv = require("dotenv");
// const { chats } = require("./data/data");
const connectDB = require("./config/db");
const userRoutes = require("./routes/userRoutes");
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

//! TEMP: For debugging.
const { meshState } = require("./network/state/meshState");
meshState.userLocations.set("LOCAL-USER-UUID", "local");
console.log("[SOCP][DEV] Hosted local user: LOCAL-USER-UUID");

const bus = require("./network/events");
bus.on("network:presenceUpdate", (evt) =>
  console.log("[DBG] presenceUpdate ->", evt)
);
bus.on("network:userDeliver", (p) =>
  console.log("[DBG] network:userDeliver ->", p)
);
bus.on("network:publicMessage", (p) =>
  console.log("[DBG] publicMessage ->", p)
);
bus.on("network:publicKeyShare", (p) =>
  console.log("[DBG] publicKeyShare ->", p)
);
bus.on("network:fileStart", (p) => console.log("[DBG] fileStart", p));
bus.on("network:fileChunk", (p) => console.log("[DBG] fileChunk", p));
bus.on("network:fileEnd", (p) => console.log("[DBG] fileEnd", p));
bus.on("network:ack", (p) => console.log("[DBG] ACK   <-", p));
bus.on("network:error", (p) => console.log("[DBG] ERROR <-", p));
bus.on("network:tx:error", (p) => console.log("[DBG] TX ERROR ->", p));
bus.on("network:tx:ack", (p) => console.log("[DBG] TX ACK   ->", p));
//! END TEMP

const app = express();
dotenv.config();
connectDB();

// Load SOCP config early (does not start anything yet)
const meshCfg = require("./network/config");
console.log("[SOCP] Config loaded", {
  serverId: meshCfg.SERVER_ID,
  hasPrivateKey: Boolean(meshCfg.SERVER_PRIVATE_KEY_B64URL),
  hasPublicKey: Boolean(meshCfg.SERVER_PUBLIC_KEY_B64URL),
  heartbeatMs: meshCfg.HEARTBEAT_MS,
  peerDeadMs: meshCfg.PEER_DEAD_MS,
  meshWsPort: meshCfg.MESH_WS_PORT,
  introducers: meshCfg.INTRODUCERS.length,
});

app.use(express.json());

app.get("/", (req, res) => {
  res.send("API is Running");
});

app.use("/api/user", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/message", messageRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5001;

const server = app.listen(PORT, console.log(`Server started on PORT: ${PORT}`));

const io = require("socket.io")(server, {
  pingTimeout: 60000,
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
    ],
  },
});

io.on("connection", (socket) => {
  console.log("Connected to Socket.io");

  socket.on("setup", (userData) => {
    socket.join(userData._id);
    socket.emit("connected");
  });

  socket.on("join chat", (room) => {
    socket.join(room);
    console.log("User Joined Room: " + room);
  });
  socket.on("typing", (room) => socket.in(room).emit("typing"));
  socket.on("stop typing", (room) => socket.in(room).emit("stop typing"));

  socket.on("new message", (newMessageRecieved) => {
    console.log("[DBG] new message event fired on backend");

    if (!newMessageRecieved) {
      console.log("[DBG] ERROR: no message payload received!");
      return;
    }

    console.log(
      "[DBG] full payload:",
      JSON.stringify(newMessageRecieved, null, 2)
    );

    var chat = newMessageRecieved.chat;

    if (!chat || !chat.users) {
      console.log("[DBG] ERROR: chat.users not defined in payload");
      return;
    }

    chat.users.forEach((user) => {
      if (user._id == newMessageRecieved.sender._id) return;
      console.log(`[DBG] emitting to user ${user._id}`);
      socket.in(user._id).emit("message received", newMessageRecieved);
    });
  });

  socket.off("setup", () => {
    console.log("USER DISCONNECTED");
    socket.leave(userData._id);
  });
});

// === SOCP: start WebSocket listener (dedicated port) ===
try {
  const { startMeshWebSocket } = require("./network/wsServer");
  startMeshWebSocket();
  // === SOCP: dial introducers (if configured) ===
  try {
    const { bootstrapIntroducers } = require("./network/peerClient");
    bootstrapIntroducers();
  } catch (e) {
    console.warn("[SOCP] Introducer bootstrap skipped:", e?.message);
  }
} catch (e) {
  console.warn("[SOCP] WS init skipped:", e?.message);
}

// === SOCP: start heartbeats & liveness monitor ===
try {
  const { startHeartbeats } = require("./network/heartbeat");
  startHeartbeats();
  console.log("[SOCP] Heartbeats started");
} catch (e) {
  console.warn("[SOCP] Heartbeats init skipped:", e?.message);
}
