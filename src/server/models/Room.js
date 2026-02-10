const { Chess } = require("chess.js");
const { PHASES } = require("../../shared/constants");

class Room {
  constructor(id, ownerSocketId) {
    this.id = id;
    this.game = new Chess();
    this.players = {
      [ownerSocketId]: "white",
    };
    this.phase = PHASES.CHESS;
    this.pendingMove = null;
    this.blackjack = null;
    this.captured = {
      white: [],
      black: [],
    };
    const tenMinutesMs = 10 * 60 * 1000;
    this.timers = {
      whiteMs: tenMinutesMs,
      blackMs: tenMinutesMs,
      active: "w",
      paused: true,
      lastTick: Date.now(),
    };
  }
}

module.exports = Room;
