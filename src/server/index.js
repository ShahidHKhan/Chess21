const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const RoomManager = require("./services/RoomManager");
const gameHandler = require("./handlers/gameHandler");
const { EVENTS, PHASES } = require("../shared/constants");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "*",
  },
});
const roomManager = new RoomManager();

const PORT = process.env.PORT || 3000;

const clientRoot = path.join(__dirname, "..", "..", "my-react-app", "dist");
const sharedRoot = path.join(__dirname, "..", "shared");
const TIMER_TICK_MS = 500;

app.use(express.static(clientRoot));
app.use("/shared", express.static(sharedRoot));

io.on("connection", (socket) => {
  gameHandler(io, socket, roomManager);
});

function getPlayerIdByColor(roomState, color) {
  const target = color === "w" ? "white" : "black";
  return Object.keys(roomState.players).find((id) => roomState.players[id] === target) || null;
}

function emitTimerUpdate(roomId, roomState) {
  if (!roomState?.timers) {
    return;
  }
  const { whiteMs, blackMs, active, paused } = roomState.timers;
  io.to(roomId).emit(EVENTS.TIMER_UPDATE, {
    whiteMs,
    blackMs,
    active,
    paused,
  });
}

function handleTimeout(roomId, roomState, loserColor) {
  if (!roomState || roomState.phase === PHASES.GAME_OVER) {
    return;
  }
  const winnerColor = loserColor === "w" ? "b" : "w";
  const loserId = getPlayerIdByColor(roomState, loserColor);
  const winnerId = getPlayerIdByColor(roomState, winnerColor);
  roomState.phase = PHASES.GAME_OVER;
  if (roomState.timers) {
    roomState.timers.paused = true;
  }
  io.to(roomId).emit(EVENTS.UPDATE_BOARD, {
    fen: roomState.game.fen(),
    turn: roomState.game.turn(),
    attackerWins: false,
    resolutionNote: "Time expired.",
    gameOver: true,
    gameOverMessage: "Time expired. Game over.",
    captured: roomState.captured,
    winnerId,
    loserId,
  });
  emitTimerUpdate(roomId, roomState);
}

function tickTimers() {
  const now = Date.now();
  for (const [roomId, roomState] of roomManager.getRooms().entries()) {
    const timers = roomState.timers;
    if (!timers) {
      continue;
    }
    if (roomState.phase === PHASES.GAME_OVER) {
      timers.paused = true;
      timers.lastTick = now;
      continue;
    }
    if (timers.paused || !timers.active) {
      timers.lastTick = now;
      continue;
    }
    const delta = now - timers.lastTick;
    if (delta <= 0) {
      timers.lastTick = now;
      continue;
    }
    timers.lastTick = now;
    if (timers.active === "w") {
      timers.whiteMs = Math.max(0, timers.whiteMs - delta);
      if (timers.whiteMs === 0) {
        handleTimeout(roomId, roomState, "w");
        continue;
      }
    } else {
      timers.blackMs = Math.max(0, timers.blackMs - delta);
      if (timers.blackMs === 0) {
        handleTimeout(roomId, roomState, "b");
        continue;
      }
    }
    emitTimerUpdate(roomId, roomState);
  }
}

setInterval(tickTimers, TIMER_TICK_MS);

function startServer() {
  server.listen(PORT, () => {
    console.log(`Chess21 server listening on port ${PORT}`);
  });
}

module.exports = startServer;
