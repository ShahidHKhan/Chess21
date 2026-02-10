const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const RoomManager = require("./services/RoomManager");
const gameHandler = require("./handlers/gameHandler");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const roomManager = new RoomManager();

const PORT = process.env.PORT || 3000;

const clientRoot = path.join(__dirname, "..", "client");
const sharedRoot = path.join(__dirname, "..", "shared");

app.use(express.static(clientRoot));
app.use("/shared", express.static(sharedRoot));

io.on("connection", (socket) => {
  gameHandler(io, socket, roomManager);
});

function startServer() {
  server.listen(PORT, () => {
    console.log(`Chess21 server listening on port ${PORT}`);
  });
}

module.exports = startServer;
