(function (root) {
  const EVENTS = {
    MAKE_MOVE: "make-move",
    MOVE_MADE: "move-made",
    MOVE_REJECTED: "move-rejected",
    ROOM_ASSIGNED: "room-assigned",
    GAME_READY: "game-ready",
    PLAYER_LEFT: "player-left",
    START_BLACKJACK: "start-blackjack",
    BLACKJACK_UPDATE: "blackjack-update",
    UPDATE_BOARD: "update-board",
    BLACKJACK_HIT: "blackjack-hit",
    BLACKJACK_STAND: "blackjack-stand",
  };

  const PHASES = {
    CHESS: "CHESS_PHASE",
    BLACKJACK: "BLACKJACK_PHASE",
    GAME_OVER: "GAME_OVER",
  };

  const BJ_OUTCOMES = {
    ATTACKER: "ATTACKER",
    DEFENDER: "DEFENDER",
    PUSH: "PUSH",
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { EVENTS, PHASES, BJ_OUTCOMES };
    return;
  }

  root.GameConstants = { EVENTS, PHASES, BJ_OUTCOMES };
})(typeof window !== "undefined" ? window : global);
