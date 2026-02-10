const { BJ_OUTCOMES } = require("../../shared/constants");

class ChessService {
  findLegalMove(game, move) {
    if (!move || !move.from || !move.to) {
      return null;
    }
    const legalMoves = game.moves({ verbose: true });
    if (move.promotion) {
      return (
        legalMoves.find((candidate) => {
          return (
            candidate.from === move.from &&
            candidate.to === move.to &&
            candidate.promotion === move.promotion
          );
        }) || null
      );
    }

    const queenPromotion = legalMoves.find((candidate) => {
      return (
        candidate.from === move.from &&
        candidate.to === move.to &&
        candidate.promotion === "q"
      );
    });
    if (queenPromotion) {
      return queenPromotion;
    }

    return (
      legalMoves.find((candidate) => {
        return candidate.from === move.from && candidate.to === move.to && !candidate.promotion;
      }) || null
    );
  }

  isPromotionMove(game, move) {
    if (!move || !move.from || !move.to) {
      return false;
    }
    const piece = game.get(move.from);
    if (!piece || piece.type !== "p") {
      return false;
    }
    const targetRank = move.to[1];
    if (!targetRank) {
      return false;
    }
    if (piece.color === "w") {
      return targetRank === "8";
    }
    return targetRank === "1";
  }

  isEnPassantMove(move) {
    return Boolean(move && typeof move.flags === "string" && move.flags.includes("e"));
  }

  getEnPassantCaptureSquare(move) {
    if (!move || !move.from || !move.to) {
      return null;
    }
    const fromRank = move.from[1];
    if (!fromRank) {
      return null;
    }
    return `${move.to[0]}${fromRank}`;
  }

  swapTurn(game) {
    const parts = game.fen().split(" ");
    parts[1] = parts[1] === "w" ? "b" : "w";
    game.load(parts.join(" "));
  }

  addCaptured(roomState, piece) {
    if (!roomState || !piece) {
      return;
    }
    const capturer = piece.color === "w" ? "black" : "white";
    if (!roomState.captured[capturer]) {
      roomState.captured[capturer] = [];
    }
    roomState.captured[capturer].push({ type: piece.type, color: piece.color });
  }

  resolveBlackjack({ game, roomState, pendingMove, outcome }) {
    const pending = pendingMove;
    let appliedMove = null;
    let reversedMove = null;
    let resolutionNote = null;
    let gameOver = false;
    let gameOverMessage = null;
    let winnerId = null;
    let loserId = null;

    if (!pending) {
      return null;
    }

    const attackerWins = outcome === BJ_OUTCOMES.ATTACKER;
    const isPush = outcome === BJ_OUTCOMES.PUSH;
    const captureSquare = pending.captureSquare || pending.move?.to;

    if (isPush) {
      resolutionNote = "Push: no pieces captured.";
    } else if (pending.reason === "PROMOTION") {
      const pawnPiece = game.get(pending.move.from);
      if (attackerWins) {
        const capturedPiece = captureSquare ? game.get(captureSquare) : null;
        if (capturedPiece) {
          this.addCaptured(roomState, capturedPiece);
        }
        appliedMove = game.move(pending.move);
        resolutionNote = "Promotion won; pawn becomes a queen.";
      } else {
        if (pawnPiece) {
          this.addCaptured(roomState, pawnPiece);
        }
        game.remove(pending.move.from);
        resolutionNote = "Promotion lost; pawn disappears.";
      }
    } else if (attackerWins) {
      const capturedPiece = captureSquare ? game.get(captureSquare) : null;
      if (capturedPiece) {
        this.addCaptured(roomState, capturedPiece);
      }
      appliedMove = game.move(pending.move);
    } else {
      const attackerPiece = game.get(pending.move.from);
      if (attackerPiece && attackerPiece.type === "k") {
        this.addCaptured(roomState, attackerPiece);
        game.remove(pending.move.from);
        gameOver = true;
        gameOverMessage = "King was eaten after losing blackjack. Game over.";
        resolutionNote = gameOverMessage;
        loserId = pending.attackerId;
        winnerId = pending.defenderId;
      } else {
        const reverseMove = this.findLegalMove(game, {
          from: pending.move.to,
          to: pending.move.from,
        });
        if (reverseMove) {
          if (attackerPiece) {
            this.addCaptured(roomState, attackerPiece);
          }
          reversedMove = game.move({
            from: reverseMove.from,
            to: reverseMove.to,
            promotion: reverseMove.promotion,
          });
        } else {
          if (attackerPiece) {
            this.addCaptured(roomState, attackerPiece);
          }
          game.remove(pending.move.from);
          resolutionNote = "Attacker lost; defender captures the attacker.";
        }
      }
    }

    if (!attackerWins && !gameOver && !isPush) {
      this.swapTurn(game);
    }

    return {
      attackerWins,
      appliedMove,
      reversedMove,
      resolutionNote,
      gameOver,
      gameOverMessage,
      winnerId,
      loserId,
    };
  }
}

module.exports = new ChessService();
