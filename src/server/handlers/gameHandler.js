const chessService = require("../services/ChessService");
const blackjackService = require("../services/BlackjackService");
const { EVENTS, PHASES, BJ_OUTCOMES } = require("../../shared/constants");

function getOpponentId(roomState, socketId) {
  return Object.keys(roomState.players).find((id) => id !== socketId) || null;
}

function emitTimerUpdate(io, roomId, roomState) {
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

function setActiveTimer(roomState, { paused } = {}) {
  if (!roomState?.timers) {
    return;
  }
  roomState.timers.active = roomState.game.turn();
  if (typeof paused === "boolean") {
    roomState.timers.paused = paused;
  }
  roomState.timers.lastTick = Date.now();
}

function startBlackjackRound(io, roomId, roomState, pendingMove, attackerId, defenderId) {
  const deck = blackjackService.shuffle(blackjackService.createDeck());
  const { hitterHand, dealerHand } = blackjackService.dealInitial(deck);

  roomState.blackjack = {
    deck,
    hitterHand,
    dealerHand,
  };

  io.to(roomId).emit(EVENTS.START_BLACKJACK, {
    hitterId: attackerId,
    dealerId: defenderId,
    hitterHand,
    dealerUpCard: dealerHand[0],
    move: pendingMove.move,
    captureSquare: pendingMove.captureSquare,
    reason: pendingMove.reason || "CAPTURE",
  });
}

function startDealerDraw(io, roomId, roomState) {
  const blackjack = roomState.blackjack;
  if (!blackjack || blackjack.dealerDrawing) {
    return;
  }

  blackjack.dealerDrawing = true;

  const drawNext = () => {
    const currentState = roomState;
    if (currentState.phase !== PHASES.BLACKJACK) {
      return;
    }
    const currentBlackjack = currentState.blackjack;
    if (!currentBlackjack) {
      return;
    }

    const dealerScore = blackjackService.handScore(currentBlackjack.dealerHand);
    if (!blackjackService.shouldDealerHit(currentBlackjack.dealerHand) || currentBlackjack.deck.length === 0) {
      currentBlackjack.dealerDrawing = false;
      const hitterScore = blackjackService.handScore(currentBlackjack.hitterHand);
      let outcome = BJ_OUTCOMES.DEFENDER;
      if (dealerScore > 21 || hitterScore > dealerScore) {
        outcome = BJ_OUTCOMES.ATTACKER;
      } else if (hitterScore === dealerScore) {
        outcome = BJ_OUTCOMES.PUSH;
      }

      io.to(roomId).emit(EVENTS.BLACKJACK_UPDATE, {
        hitterHand: currentBlackjack.hitterHand,
        dealerHand: currentBlackjack.dealerHand,
        hitterScore,
        dealerScore,
      });

      const resolution = chessService.resolveBlackjack({
        game: currentState.game,
        roomState: currentState,
        pendingMove: currentState.pendingMove,
        outcome,
      });

      currentState.phase = resolution?.gameOver ? PHASES.GAME_OVER : PHASES.CHESS;
      currentState.pendingMove = null;
      currentState.blackjack = null;

      io.to(roomId).emit(EVENTS.UPDATE_BOARD, {
        fen: currentState.game.fen(),
        turn: currentState.game.turn(),
        attackerWins: resolution?.attackerWins,
        appliedMove: resolution?.appliedMove,
        reversedMove: resolution?.reversedMove,
        resolutionNote: resolution?.resolutionNote,
        gameOver: resolution?.gameOver,
        gameOverMessage: resolution?.gameOverMessage,
        captured: currentState.captured,
        winnerId: resolution?.winnerId,
        loserId: resolution?.loserId,
      });
      setActiveTimer(currentState, { paused: currentState.phase === PHASES.GAME_OVER });
      emitTimerUpdate(io, roomId, currentState);
      return;
    }

    currentBlackjack.dealerHand.push(currentBlackjack.deck.pop());
    const updatedDealerScore = blackjackService.handScore(currentBlackjack.dealerHand);
    const hitterScore = blackjackService.handScore(currentBlackjack.hitterHand);
    io.to(roomId).emit(EVENTS.BLACKJACK_UPDATE, {
      hitterHand: currentBlackjack.hitterHand,
      dealerHand: currentBlackjack.dealerHand,
      hitterScore,
      dealerScore: updatedDealerScore,
    });

    setTimeout(drawNext, 700);
  };

  setTimeout(drawNext, 700);
}

module.exports = (io, socket, roomManager) => {
  socket.on(EVENTS.MAKE_MOVE, ({ roomId, move }) => {
    const roomState = roomManager.getRoom(roomId);
    if (!roomState) {
      socket.emit(EVENTS.MOVE_REJECTED, { reason: "Room not found." });
      return;
    }

    if (roomState.phase === PHASES.BLACKJACK) {
      socket.emit(EVENTS.MOVE_REJECTED, { reason: "Blackjack phase active." });
      return;
    }

    if (roomState.phase === PHASES.GAME_OVER) {
      socket.emit(EVENTS.MOVE_REJECTED, { reason: "Game is over." });
      return;
    }

    if (!move || !move.to) {
      socket.emit(EVENTS.MOVE_REJECTED, { reason: "Invalid move payload." });
      return;
    }

    const game = roomState.game;
    const legalMove = chessService.findLegalMove(game, move);
    if (!legalMove) {
      socket.emit(EVENTS.MOVE_REJECTED, { reason: "Illegal move." });
      return;
    }

    if (chessService.isPromotionMove(game, legalMove)) {
      const opponentId = getOpponentId(roomState, socket.id);
      if (!opponentId) {
        socket.emit(EVENTS.MOVE_REJECTED, { reason: "Opponent not ready." });
        return;
      }

      roomState.pendingMove = {
        move: {
          from: legalMove.from,
          to: legalMove.to,
          promotion: "q",
        },
        attackerId: socket.id,
        defenderId: opponentId,
        captureSquare: legalMove.to,
        reason: "PROMOTION",
      };
      roomState.phase = PHASES.BLACKJACK;
      startBlackjackRound(io, roomId, roomState, roomState.pendingMove, socket.id, opponentId);
      return;
    }

    if (chessService.isEnPassantMove(legalMove)) {
      const opponentId = getOpponentId(roomState, socket.id);
      if (!opponentId) {
        socket.emit(EVENTS.MOVE_REJECTED, { reason: "Opponent not ready." });
        return;
      }

      roomState.pendingMove = {
        move: {
          from: legalMove.from,
          to: legalMove.to,
          promotion: legalMove.promotion,
        },
        attackerId: socket.id,
        defenderId: opponentId,
        captureSquare: chessService.getEnPassantCaptureSquare(legalMove),
      };
      roomState.phase = PHASES.BLACKJACK;
      startBlackjackRound(io, roomId, roomState, roomState.pendingMove, socket.id, opponentId);
      return;
    }

    const capturedPiece = game.get(move.to);
    if (capturedPiece) {
      if (capturedPiece.type === "k") {
        socket.emit(EVENTS.MOVE_REJECTED, { reason: "King cannot be captured." });
        return;
      }

      const opponentId = getOpponentId(roomState, socket.id);
      if (!opponentId) {
        socket.emit(EVENTS.MOVE_REJECTED, { reason: "Opponent not ready." });
        return;
      }

      roomState.pendingMove = {
        move: {
          from: legalMove.from,
          to: legalMove.to,
          promotion: legalMove.promotion,
        },
        attackerId: socket.id,
        defenderId: opponentId,
        captureSquare: legalMove.to,
      };
      roomState.phase = PHASES.BLACKJACK;
      startBlackjackRound(io, roomId, roomState, roomState.pendingMove, socket.id, opponentId);
      return;
    }

    const result = game.move({
      from: legalMove.from,
      to: legalMove.to,
      promotion: legalMove.promotion,
    });
    if (!result) {
      socket.emit(EVENTS.MOVE_REJECTED, { reason: "Illegal move." });
      return;
    }

    io.to(roomId).emit(EVENTS.MOVE_MADE, {
      move: result,
      fen: game.fen(),
      turn: game.turn(),
    });
    setActiveTimer(roomState, { paused: false });
    emitTimerUpdate(io, roomId, roomState);
  });

  socket.on(EVENTS.BLACKJACK_HIT, ({ roomId }) => {
    const roomState = roomManager.getRoom(roomId);
    if (!roomState || roomState.phase !== PHASES.BLACKJACK) {
      socket.emit(EVENTS.MOVE_REJECTED, { reason: "Blackjack phase inactive." });
      return;
    }

    const pending = roomState.pendingMove;
    if (!pending || pending.attackerId !== socket.id) {
      socket.emit(EVENTS.MOVE_REJECTED, { reason: "Only attacker can hit." });
      return;
    }

    const blackjack = roomState.blackjack;
    if (!blackjack || blackjack.deck.length === 0) {
      socket.emit(EVENTS.MOVE_REJECTED, { reason: "Deck unavailable." });
      return;
    }

    blackjack.hitterHand.push(blackjack.deck.pop());

    const hitterScore = blackjackService.handScore(blackjack.hitterHand);
    io.to(roomId).emit(EVENTS.BLACKJACK_UPDATE, {
      hitterHand: blackjack.hitterHand,
      dealerHand: blackjack.dealerHand,
      hitterScore,
    });

    if (hitterScore > 21) {
      const resolution = chessService.resolveBlackjack({
        game: roomState.game,
        roomState,
        pendingMove: roomState.pendingMove,
        outcome: BJ_OUTCOMES.DEFENDER,
      });

      roomState.phase = resolution?.gameOver ? PHASES.GAME_OVER : PHASES.CHESS;
      roomState.pendingMove = null;
      roomState.blackjack = null;

      io.to(roomId).emit(EVENTS.UPDATE_BOARD, {
        fen: roomState.game.fen(),
        turn: roomState.game.turn(),
        attackerWins: resolution?.attackerWins,
        appliedMove: resolution?.appliedMove,
        reversedMove: resolution?.reversedMove,
        resolutionNote: resolution?.resolutionNote,
        gameOver: resolution?.gameOver,
        gameOverMessage: resolution?.gameOverMessage,
        captured: roomState.captured,
        winnerId: resolution?.winnerId,
        loserId: resolution?.loserId,
      });
      setActiveTimer(roomState, { paused: roomState.phase === PHASES.GAME_OVER });
      emitTimerUpdate(io, roomId, roomState);
    }
  });

  socket.on(EVENTS.BLACKJACK_STAND, ({ roomId }) => {
    const roomState = roomManager.getRoom(roomId);
    if (!roomState || roomState.phase !== PHASES.BLACKJACK) {
      socket.emit(EVENTS.MOVE_REJECTED, { reason: "Blackjack phase inactive." });
      return;
    }

    const pending = roomState.pendingMove;
    if (!pending || pending.attackerId !== socket.id) {
      socket.emit(EVENTS.MOVE_REJECTED, { reason: "Only attacker can stand." });
      return;
    }

    const blackjack = roomState.blackjack;
    if (!blackjack) {
      socket.emit(EVENTS.MOVE_REJECTED, { reason: "Blackjack state missing." });
      return;
    }

    startDealerDraw(io, roomId, roomState);
  });

  socket.on(EVENTS.TIMER_TOGGLE, ({ roomId }) => {
    const roomState = roomManager.getRoom(roomId);
    if (!roomState || !roomState.timers || roomState.phase === PHASES.GAME_OVER) {
      return;
    }
    roomState.timers.paused = !roomState.timers.paused;
    roomState.timers.lastTick = Date.now();
    emitTimerUpdate(io, roomId, roomState);
  });

  socket.on(EVENTS.JOIN_INVITE_ROOM, ({ roomId }) => {
    if (!roomId) {
      return;
    }

    const previousRoomId = roomManager.removePlayer(socket.id);
    if (previousRoomId) {
      socket.leave(previousRoomId);
      io.to(previousRoomId).emit(EVENTS.PLAYER_LEFT, { message: "Opponent disconnected." });
    }

    const assignment = roomManager.assignInviteRoom(roomId, socket.id);
    if (!assignment) {
      socket.emit(EVENTS.MOVE_REJECTED, { reason: "Room is full." });
      return;
    }

    socket.join(assignment.room.id);
    socket.emit(EVENTS.ROOM_ASSIGNED, { roomId: assignment.room.id, color: assignment.color });

    if (assignment.room.timers) {
      setActiveTimer(assignment.room, { paused: !assignment.started });
      socket.emit(EVENTS.TIMER_UPDATE, {
        whiteMs: assignment.room.timers.whiteMs,
        blackMs: assignment.room.timers.blackMs,
        active: assignment.room.timers.active,
        paused: assignment.room.timers.paused,
      });
    }

    if (assignment.started) {
      setActiveTimer(assignment.room, { paused: false });
      io.to(assignment.room.id).emit(EVENTS.GAME_READY, {
        fen: assignment.room.game.fen(),
        captured: assignment.room.captured,
      });
      emitTimerUpdate(io, assignment.room.id, assignment.room);
    }
  });

  socket.on("disconnect", () => {
    const roomId = roomManager.removePlayer(socket.id);
    if (roomId) {
      io.to(roomId).emit(EVENTS.PLAYER_LEFT, { message: "Opponent disconnected." });
    }
  });
};
