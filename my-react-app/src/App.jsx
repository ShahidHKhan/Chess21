import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Chess } from "chess.js";
import { EVENTS } from "./shared/constants.js";
import { calculateMaterialScore, fenToBoard } from "./utils/fen.js";
import { BlackjackTable } from "./components/BlackjackTable.jsx";
import { CapturedPanel } from "./components/CapturedPanel.jsx";
import { ChessBoard } from "./components/ChessBoard.jsx";
import { ResultModal } from "./components/ResultModal.jsx";

const baseFileLabels = ["a", "b", "c", "d", "e", "f", "g", "h"];
const baseRankLabels = ["8", "7", "6", "5", "4", "3", "2", "1"];
const initialTimerState = {
  whiteMs: 10 * 60 * 1000,
  blackMs: 10 * 60 * 1000,
  active: "w",
  paused: true,
};
const initialBlackjackState = {
  dealerHand: [],
  hitterHand: [],
  dealerScore: null,
  hitterScore: null,
  stateText: "Waiting...",
  controlsEnabled: false,
};

function getPieceAt(fen, square) {
  if (!fen || !square || square.length < 2) {
    return null;
  }
  const file = square[0];
  const rank = Number(square[1]);
  const fileIndex = baseFileLabels.indexOf(file);
  if (Number.isNaN(rank) || fileIndex === -1) {
    return null;
  }
  const board = fenToBoard(fen);
  const boardRank = 8 - rank;
  return board?.[boardRank]?.[fileIndex] || null;
}

function resolveCastlingTarget(fen, from, to) {
  const king = getPieceAt(fen, from);
  const rook = getPieceAt(fen, to);
  if (!king || !rook) {
    return to;
  }
  const kingIsWhite = king === king.toUpperCase();
  const rookIsWhite = rook === rook.toUpperCase();
  if (king.toLowerCase() !== "k" || rook.toLowerCase() !== "r" || kingIsWhite !== rookIsWhite) {
    return to;
  }
  const rank = kingIsWhite ? "1" : "8";
  if (from !== `e${rank}`) {
    return to;
  }
  if (to === `h${rank}`) {
    return `g${rank}`;
  }
  if (to === `a${rank}`) {
    return `c${rank}`;
  }
  return to;
}

function App() {
  const socketRef = useRef(null);
  const pendingTimeoutRef = useRef(null);
  const pendingBlackjackMoveRef = useRef(null);
  const localSocketIdRef = useRef(null);

  const [status, setStatus] = useState("Connecting to server...");
  const [phase, setPhase] = useState({ text: "Connecting...", active: false });
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [playerColor, setPlayerColor] = useState(null);
  const [currentFen, setCurrentFen] = useState(null);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [currentTurn, setCurrentTurn] = useState(null);
  const [blackjackActive, setBlackjackActive] = useState(false);
  const [attackerId, setAttackerId] = useState(null);
  const [localSocketId, setLocalSocketId] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [threatenedSquare, setThreatenedSquare] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [pendingBlackjackMove, setPendingBlackjackMove] = useState(null);
  const [timerState, setTimerState] = useState(initialTimerState);
  const [blackjackState, setBlackjackState] = useState(initialBlackjackState);
  const [captured, setCaptured] = useState({ white: [], black: [] });
  const [resultModal, setResultModal] = useState({
    open: false,
    title: "Game Over",
    message: "Game finished.",
    variant: null,
  });

  useEffect(() => {
    pendingBlackjackMoveRef.current = pendingBlackjackMove;
  }, [pendingBlackjackMove]);

  useEffect(() => {
    localSocketIdRef.current = localSocketId;
  }, [localSocketId]);

  useEffect(() => {
    return () => {
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
      }
    };
  }, []);

  const canChessAct =
    !blackjackActive &&
    !gameOver &&
    Boolean(currentTurn && playerColor && currentTurn === playerColor[0]);
  const canBlackjackAct = blackjackActive && !gameOver && attackerId === localSocketId;
  const turnIsReady = Boolean(currentTurn && playerColor);
  const isMyTurn = turnIsReady && currentTurn === playerColor[0];

  const evalScore = useMemo(() => calculateMaterialScore(currentFen), [currentFen]);
  const evalClamped = Math.max(-10, Math.min(10, evalScore));
  const evalFill = `${50 + evalClamped * 5}%`;
  const evalWhiteLabel = `White ${evalScore > 0 ? `+${Math.abs(evalScore).toFixed(1)}` : "+0.0"}`;
  const evalBlackLabel = `Black ${evalScore < 0 ? `+${Math.abs(evalScore).toFixed(1)}` : "+0.0"}`;
  const evalFillStyle = useMemo(() => {
    const evalPerspective = playerColor === "black" ? -evalScore : evalScore;
    let background = "linear-gradient(90deg, rgba(46, 186, 132, 0.9), rgba(245, 197, 66, 0.85))";
    if (evalPerspective < 0) {
      background = "linear-gradient(90deg, rgba(255, 107, 107, 0.95), rgba(245, 197, 66, 0.75))";
    }
    return { height: evalFill, background };
  }, [evalFill, evalScore, playerColor]);

  const evalLabelClasses = useMemo(() => {
    if (evalScore === 0) {
      return { white: "", black: "" };
    }
    const whiteAhead = evalScore > 0;
    const playerIsBlack = playerColor === "black";
    const whiteIsGood = playerIsBlack ? !whiteAhead : whiteAhead;
    return {
      white: whiteIsGood ? "good" : "bad",
      black: whiteIsGood ? "bad" : "good",
    };
  }, [evalScore, playerColor]);

  const formatTime = useCallback((ms) => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, []);

  const getValidMovesForSquare = useCallback(
    (square) => {
      if (!square || !currentFen) {
        return [];
      }
      try {
        const engine = new Chess(currentFen);
        return engine.moves({ square, verbose: true }).map((move) => move.to);
      } catch (error) {
        return [];
      }
    },
    [currentFen]
  );

  const queueBoardUpdate = useCallback((payload, message) => {
    setStatus(message);
    if (pendingTimeoutRef.current) {
      clearTimeout(pendingTimeoutRef.current);
    }
    pendingTimeoutRef.current = setTimeout(() => {
      const {
        fen,
        attackerWins,
        resolutionNote,
        gameOver: isGameOver,
        gameOverMessage,
        winnerId,
        loserId,
      } = payload;
      setCurrentFen(fen);
      setCurrentTurn(isGameOver ? null : fen.split(" ")[1]);
      setBlackjackActive(false);
      setAttackerId(null);
      setGameOver(Boolean(isGameOver));
      setThreatenedSquare(null);
      setSelectedSquare(null);
      setValidMoves([]);
      setBlackjackState((prev) => ({ ...prev, controlsEnabled: false }));
      setPhase({ text: isGameOver ? "Game over" : "Chess phase", active: !isGameOver });

      if (pendingBlackjackMoveRef.current) {
        setLastMove(pendingBlackjackMoveRef.current);
        pendingBlackjackMoveRef.current = null;
      }
      setPendingBlackjackMove(null);

      if (isGameOver) {
        const localId = localSocketIdRef.current;
        let title = "Game Over";
        let variant = null;
        if (localId && winnerId && loserId) {
          if (localId === winnerId) {
            title = "You Win!";
            variant = "win";
          } else if (localId === loserId) {
            title = "You Lose";
            variant = "lose";
          }
        }
        const finalMessage = gameOverMessage || resolutionNote || "Game over.";
        setStatus(finalMessage);
        setResultModal({ open: true, title, message: finalMessage, variant });
      } else if (resolutionNote) {
        setStatus(resolutionNote);
      } else {
        setStatus(attackerWins ? "Capture stands." : "Capture canceled.");
      }
    }, 2000);
  }, []);

  const handleSquareClick = useCallback(
    (square) => {
      if (blackjackActive || gameOver) {
        return;
      }
      if (!currentRoomId || !currentFen) {
        return;
      }
      if (currentTurn && playerColor && currentTurn !== playerColor[0]) {
        setStatus("Not your turn.");
        return;
      }

      if (!selectedSquare) {
        setSelectedSquare(square);
        setValidMoves(getValidMovesForSquare(square));
        return;
      }

      if (selectedSquare === square) {
        setSelectedSquare(null);
        setValidMoves([]);
        return;
      }

      const targetSquare = resolveCastlingTarget(currentFen, selectedSquare, square);
      socketRef.current?.emit(EVENTS.MAKE_MOVE, {
        roomId: currentRoomId,
        move: { from: selectedSquare, to: targetSquare },
      });
      setSelectedSquare(null);
      setValidMoves([]);
    },
    [
      blackjackActive,
      gameOver,
      currentRoomId,
      currentFen,
      currentTurn,
      playerColor,
      selectedSquare,
      getValidMovesForSquare,
    ]
  );

  useEffect(() => {
    const serverUrl = import.meta.env.DEV ? "http://localhost:3000" : undefined;
    const socket = serverUrl ? io(serverUrl) : io();
    socketRef.current = socket;

    socket.on("connect", () => {
      setLocalSocketId(socket.id);
      setStatus("Connected. Waiting for opponent...");
    });

    socket.on(EVENTS.ROOM_ASSIGNED, ({ roomId, color }) => {
      setCurrentRoomId(roomId);
      setPlayerColor(color);
    });

    socket.on(EVENTS.GAME_READY, ({ fen, captured: capturedState }) => {
      setStatus("Game ready. Make your move.");
      setCurrentFen(fen);
      setCurrentTurn(fen.split(" ")[1]);
      setPhase({ text: "Chess phase", active: true });
      setBlackjackActive(false);
      setGameOver(false);
      setThreatenedSquare(null);
      setLastMove(null);
      setValidMoves([]);
      setPendingBlackjackMove(null);
      setCaptured(capturedState || { white: [], black: [] });
      setBlackjackState(initialBlackjackState);
      setResultModal((prev) => ({ ...prev, open: false }));
    });

    socket.on(EVENTS.MOVE_MADE, ({ move, fen }) => {
      setStatus(`Move: ${move.san} | FEN: ${fen}`);
      setCurrentFen(fen);
      setCurrentTurn(fen.split(" ")[1]);
      setLastMove({ from: move.from, to: move.to });
      setSelectedSquare(null);
      setValidMoves([]);
    });

    socket.on(EVENTS.MOVE_REJECTED, ({ reason }) => {
      setStatus(`Move rejected: ${reason}`);
    });

    socket.on(EVENTS.PLAYER_LEFT, ({ message }) => {
      setStatus(message);
    });

    socket.on(EVENTS.START_BLACKJACK, ({
      hitterId,
      hitterHand,
      dealerUpCard,
      move,
      reason,
      captureSquare,
    }) => {
      setBlackjackActive(true);
      setAttackerId(hitterId);
      setPendingBlackjackMove(move?.from && move?.to ? { from: move.from, to: move.to } : null);
      setSelectedSquare(null);
      setValidMoves([]);
      if (move && typeof move.from === "string" && typeof move.to === "string") {
        setThreatenedSquare(reason === "PROMOTION" ? move.from : captureSquare || move.to);
      } else {
        setThreatenedSquare(null);
      }
      setPhase({ text: "Blackjack phase", active: true });
      setBlackjackState({
        dealerHand: [dealerUpCard],
        hitterHand,
        dealerScore: null,
        hitterScore: null,
        stateText: hitterId === socket.id ? "You are attacking" : "Defending",
        controlsEnabled: hitterId === socket.id,
      });
      setStatus("Blackjack duel started.");
    });

    socket.on(EVENTS.BLACKJACK_UPDATE, ({ hitterHand, dealerHand, hitterScore, dealerScore }) => {
      setBlackjackState((prev) => ({
        ...prev,
        hitterHand,
        dealerHand: dealerHand || [],
        hitterScore,
        dealerScore,
      }));
    });

    socket.on(EVENTS.UPDATE_BOARD, ({
      fen,
      attackerWins,
      resolutionNote,
      gameOver: isGameOver,
      gameOverMessage,
      captured: capturedState,
      winnerId,
      loserId,
    }) => {
      const fallbackMessage = attackerWins ? "You won, piece captured." : "You busted, lost the piece.";
      const message = resolutionNote || fallbackMessage;
      if (capturedState) {
        setCaptured(capturedState);
      }
      queueBoardUpdate({
        fen,
        attackerWins,
        resolutionNote,
        gameOver: Boolean(isGameOver),
        gameOverMessage,
        winnerId,
        loserId,
      }, message);
    });

    socket.on(EVENTS.TIMER_UPDATE, ({ whiteMs, blackMs, active, paused }) => {
      setTimerState((prev) => ({
        ...prev,
        whiteMs: typeof whiteMs === "number" ? whiteMs : prev.whiteMs,
        blackMs: typeof blackMs === "number" ? blackMs : prev.blackMs,
        active: active || prev.active,
        paused: typeof paused === "boolean" ? paused : prev.paused,
      }));
    });

    return () => {
      socket.disconnect();
    };
  }, [queueBoardUpdate]);

  const handleHit = useCallback(() => {
    if (!currentRoomId || !blackjackActive) {
      return;
    }
    socketRef.current?.emit(EVENTS.BLACKJACK_HIT, { roomId: currentRoomId });
  }, [currentRoomId, blackjackActive]);

  const handleStand = useCallback(() => {
    if (!currentRoomId || !blackjackActive) {
      return;
    }
    socketRef.current?.emit(EVENTS.BLACKJACK_STAND, { roomId: currentRoomId });
  }, [currentRoomId, blackjackActive]);

  const handleTimerToggle = useCallback(() => {
    if (!currentRoomId) {
      return;
    }
    socketRef.current?.emit(EVENTS.TIMER_TOGGLE, { roomId: currentRoomId });
  }, [currentRoomId]);

  return (
    <>
      <div className="page-layout">
        <section
          className={`panel panel--glass ${canBlackjackAct ? "active-panel" : ""} ${blackjackActive ? "expanded" : "collapsed"}`}
          id="blackjack-panel"
        >
          <div className="blackjack-tab" onClick={() => {}}>
            <span className="tab-text">Blackjack</span>
          </div>
          <BlackjackTable
            active={blackjackActive}
            stateText={blackjackState.stateText}
            dealerHand={blackjackState.dealerHand}
            hitterHand={blackjackState.hitterHand}
            dealerScore={blackjackState.dealerScore}
            hitterScore={blackjackState.hitterScore}
            controlsEnabled={blackjackState.controlsEnabled && canBlackjackAct}
            onHit={handleHit}
            onStand={handleStand}
          />
        </section>

        <div className="game-shell">
          <div className="layout">
            <section
              className={`panel ${canChessAct ? "active-panel" : ""}`}
              id="chess-panel"
            >
              <h1>Chess21</h1>
              <div
                className={`status-pill ${canChessAct ? "pulse" : ""}`}
                id="phase-pill"
                style={{
                  borderColor: phase.active
                    ? "rgba(245, 197, 66, 0.6)"
                    : "rgba(255, 255, 255, 0.2)",
                }}
              >
                {phase.text}
              </div>
              <div className="turn-signal" id="turn-signal">
                <div className={`turn-dot ${isMyTurn ? "go" : "wait"}`} id="turn-dot"></div>
                <div className="turn-text" id="turn-text">
                  {turnIsReady ? (isMyTurn ? "Your turn" : "Waiting for opponent") : "Waiting..."}
                </div>
                <button className="btn secondary pause-btn pause-btn-turn" id="pause-btn" onClick={handleTimerToggle}>
                  {timerState.paused ? "Resume timer" : "Pause timer"}
                </button>
              </div>
              <div className="status" id="status">
                {status}
              </div>
              <div className="chess-main">
                <ChessBoard
                  fen={currentFen}
                  selectedSquare={selectedSquare}
                  playerColor={playerColor}
                  blackjackActive={blackjackActive}
                  threatenedSquare={threatenedSquare}
                  lastMove={lastMove}
                  validMoves={validMoves}
                  onSquareClick={handleSquareClick}
                />
                <div className="chess-side">
                  <aside className="info-panel" id="chess-info">
                    <div className="turn-timers" id="turn-timers">
                      <div className={`timer ${timerState.active === "w" && !timerState.paused ? "active" : ""}`}>
                        <span className="timer-label">White</span>
                        <span className="timer-value" id="timer-white-value">
                          {formatTime(timerState.whiteMs)}
                        </span>
                      </div>
                      <div className={`timer ${timerState.active === "b" && !timerState.paused ? "active" : ""}`}>
                        <span className="timer-label">Black</span>
                        <span className="timer-value" id="timer-black-value">
                          {formatTime(timerState.blackMs)}
                        </span>
                      </div>
                    </div>
                    <CapturedPanel captured={captured} />
                  </aside>
                  <aside
                    className={`eval-panel ${playerColor === "black" ? "flip-labels" : ""}`}
                    id="eval-panel"
                  >
                    <div className="eval-body">
                      <div className="eval-labels">
                        <div className={`eval-label ${evalLabelClasses.white}`} id="eval-white">
                          {evalWhiteLabel}
                        </div>
                        <div className={`eval-label ${evalLabelClasses.black}`} id="eval-black">
                          {evalBlackLabel}
                        </div>
                      </div>
                      <div className="eval-bar">
                        <div className="eval-fill" id="eval-fill" style={evalFillStyle}></div>
                      </div>
                    </div>
                  </aside>
                </div>
              </div>
              <div className="meta">Room: <span id="room-id">{currentRoomId || "-"}</span></div>
              <div className="meta">Color: <span id="player-color">{playerColor || "-"}</span></div>
            </section>
          </div>
        </div>
      </div>

      <ResultModal
        open={resultModal.open}
        title={resultModal.title}
        message={resultModal.message}
        variant={resultModal.variant}
        onClose={() => setResultModal((prev) => ({ ...prev, open: false }))}
      />
    </>
  );
}

export default App;
