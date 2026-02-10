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
  }
}

module.exports = Room;
