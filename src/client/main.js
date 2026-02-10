import { BoardRenderer } from "./components/BoardRenderer.js";
import { BlackjackView } from "./components/BlackjackView.js";
import { CapturedView } from "./components/CapturedView.js";
import { ResultModal } from "./components/ResultModal.js";
import { SocketClient } from "./services/SocketClient.js";
import { calculateMaterialScore } from "./utils/fen.js";

const statusEl = document.getElementById("status");
const roomEl = document.getElementById("room-id");
const colorEl = document.getElementById("player-color");
const phasePill = document.getElementById("phase-pill");
const turnDot = document.getElementById("turn-dot");
const turnText = document.getElementById("turn-text");
const timerWhiteEl = document.getElementById("timer-white");
const timerBlackEl = document.getElementById("timer-black");
const timerWhiteValueEl = document.getElementById("timer-white-value");
const timerBlackValueEl = document.getElementById("timer-black-value");
const chessBoardEl = document.getElementById("chess-board");
const rankLabelsEl = document.getElementById("rank-labels");
const fileLabelsEl = document.getElementById("file-labels");
const blackjackEl = document.getElementById("blackjack-table");
const bjStateEl = document.getElementById("bj-state");
const dealerCardsEl = document.getElementById("dealer-cards");
const hitterCardsEl = document.getElementById("hitter-cards");
const dealerScoreEl = document.getElementById("dealer-score");
const hitterScoreEl = document.getElementById("hitter-score");
const hitBtn = document.getElementById("hit-btn");
const standBtn = document.getElementById("stand-btn");
const capturedWhiteEl = document.getElementById("captured-white");
const capturedBlackEl = document.getElementById("captured-black");
const evalFillEl = document.getElementById("eval-fill");
const evalWhiteEl = document.getElementById("eval-white");
const evalBlackEl = document.getElementById("eval-black");
const resultModalEl = document.getElementById("result-modal");
const resultTitleEl = document.getElementById("result-title");
const resultMessageEl = document.getElementById("result-message");
const resultCloseBtn = document.getElementById("result-close");
const pauseBtn = document.getElementById("pause-btn");

const socketClient = new SocketClient();
const boardRenderer = new BoardRenderer({
  boardEl: chessBoardEl,
  rankLabelsEl,
  fileLabelsEl,
  onSquareClick: handleSquareClick,
});
const blackjackView = new BlackjackView({
  tableEl: blackjackEl,
  stateEl: bjStateEl,
  dealerCardsEl,
  hitterCardsEl,
  dealerScoreEl,
  hitterScoreEl,
  hitBtn,
  standBtn,
});
const capturedView = new CapturedView({
  whiteEl: capturedWhiteEl,
  blackEl: capturedBlackEl,
});
const resultModal = new ResultModal({
  modalEl: resultModalEl,
  titleEl: resultTitleEl,
  messageEl: resultMessageEl,
  closeBtn: resultCloseBtn,
});

let currentRoomId = null;
let playerColor = null;
let currentFen = null;
let selectedSquare = null;
let currentTurn = null;
let blackjackActive = false;
let attackerId = null;
let localSocketId = null;
let pendingBoardUpdate = null;
let gameOver = false;
let threatenedSquare = null;
let timerState = {
  whiteMs: 10 * 60 * 1000,
  blackMs: 10 * 60 * 1000,
  active: "w",
  paused: true,
};

function setStatus(message) {
  statusEl.textContent = message;
}

function setPhase(message, active) {
  phasePill.textContent = message;
  phasePill.style.borderColor = active ? "rgba(245, 197, 66, 0.6)" : "rgba(255, 255, 255, 0.2)";
}

function setBlackjackVisible(isVisible) {
  blackjackView.setActive(isVisible);
}

function updateTurnSignal() {
  if (!currentTurn || !playerColor) {
    turnDot.className = "turn-dot wait";
    turnText.textContent = "Waiting...";
    return;
  }
  const isMyTurn = currentTurn === playerColor[0];
  turnDot.className = `turn-dot ${isMyTurn ? "go" : "wait"}`;
  turnText.textContent = isMyTurn ? "Your turn" : "Waiting for opponent";
}

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function renderTimers() {
  if (!timerWhiteValueEl || !timerBlackValueEl || !timerWhiteEl || !timerBlackEl) {
    return;
  }
  timerWhiteValueEl.textContent = formatTime(timerState.whiteMs);
  timerBlackValueEl.textContent = formatTime(timerState.blackMs);
  timerWhiteEl.classList.toggle("active", timerState.active === "w" && !timerState.paused);
  timerBlackEl.classList.toggle("active", timerState.active === "b" && !timerState.paused);
  if (pauseBtn) {
    pauseBtn.textContent = timerState.paused ? "Resume timer" : "Pause timer";
  }
}

function updateEvaluation() {
  if (!evalFillEl || !evalWhiteEl || !evalBlackEl) {
    return;
  }
  const score = calculateMaterialScore(currentFen);
  const clamped = Math.max(-10, Math.min(10, score));
  const fillPercent = 50 + clamped * 5;
  evalFillEl.style.width = `${fillPercent}%`;

  if (score > 0) {
    evalWhiteEl.textContent = `White +${score}`;
    evalBlackEl.textContent = "Black +0";
  } else if (score < 0) {
    evalWhiteEl.textContent = "White +0";
    evalBlackEl.textContent = `Black +${Math.abs(score)}`;
  } else {
    evalWhiteEl.textContent = "White +0";
    evalBlackEl.textContent = "Black +0";
  }
}

function renderBoard() {
  boardRenderer.setState({
    fen: currentFen,
    selectedSquare,
    playerColor,
    blackjackActive,
    threatenedSquare,
  });
  boardRenderer.render();
  updateEvaluation();
}

function queueBoardUpdate(payload, message) {
  pendingBoardUpdate = payload;
  setStatus(message);
  setTimeout(() => {
    if (!pendingBoardUpdate) {
      return;
    }
    const {
      fen,
      attackerWins,
      resolutionNote,
      gameOver: isGameOver,
      gameOverMessage,
      winnerId,
      loserId,
    } = pendingBoardUpdate;
    currentFen = fen;
    currentTurn = isGameOver ? null : fen.split(" ")[1];
    blackjackActive = false;
    attackerId = null;
    gameOver = Boolean(isGameOver);
    threatenedSquare = null;
    setPhase("Chess phase", true);
    setBlackjackVisible(false);
    updateTurnSignal();
    renderBoard();
    if (gameOver) {
      hitBtn.disabled = true;
      standBtn.disabled = true;
      setPhase("Game over", false);
      setStatus(gameOverMessage || resolutionNote || "Game over.");
      resultModal.show({
        winnerId,
        loserId,
        localSocketId,
        message: gameOverMessage || resolutionNote || "Game over.",
      });
    } else if (resolutionNote) {
      setStatus(resolutionNote);
    } else {
      setStatus(attackerWins ? "Capture stands." : "Capture canceled.");
    }
    pendingBoardUpdate = null;
  }, 2000);
}

function handleSquareClick(square) {
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
    selectedSquare = square;
  } else if (selectedSquare === square) {
    selectedSquare = null;
  } else {
    const targetSquare = boardRenderer.resolveCastlingTarget(selectedSquare, square);
    socketClient.emitMove({
      roomId: currentRoomId,
      move: { from: selectedSquare, to: targetSquare },
    });
    selectedSquare = null;
  }
  renderBoard();
}

socketClient.onConnect(() => {
  localSocketId = socketClient.socket.id;
  setStatus("Connected. Waiting for opponent...");
});

socketClient.onRoomAssigned(({ roomId, color }) => {
  roomEl.textContent = roomId;
  colorEl.textContent = color;
  currentRoomId = roomId;
  playerColor = color;
  boardRenderer.setOrientation(color);
  updateTurnSignal();
});

socketClient.onGameReady(({ fen, captured }) => {
  setStatus("Game ready. Make your move.");
  currentFen = fen;
  currentTurn = fen.split(" ")[1];
  setPhase("Chess phase", true);
  blackjackActive = false;
  gameOver = false;
  threatenedSquare = null;
  capturedView.setCaptured(captured || { white: [], black: [] });
  setBlackjackVisible(false);
  resultModal.hide();
  updateTurnSignal();
  renderBoard();
});

socketClient.onMoveMade(({ move, fen }) => {
  setStatus(`Move: ${move.san} | FEN: ${fen}`);
  currentFen = fen;
  currentTurn = fen.split(" ")[1];
  updateTurnSignal();
  renderBoard();
});

socketClient.onMoveRejected(({ reason }) => {
  setStatus(`Move rejected: ${reason}`);
});

socketClient.onPlayerLeft(({ message }) => {
  setStatus(message);
});

socketClient.onStartBlackjack(({
  hitterId,
  hitterHand,
  dealerUpCard,
  move,
  reason,
  captureSquare,
}) => {
  blackjackActive = true;
  attackerId = hitterId;
  if (move && typeof move.from === "string" && typeof move.to === "string") {
    threatenedSquare = reason === "PROMOTION" ? move.from : (captureSquare || move.to);
  } else {
    threatenedSquare = null;
  }
  setPhase("Blackjack phase", true);
  setBlackjackVisible(true);
  blackjackView.setState(hitterId === localSocketId ? "You are attacking" : "Defending");
  blackjackView.renderHands({
    hitterHand,
    dealerHand: [dealerUpCard],
    showDealerAll: true,
  });
  blackjackView.resetScores();
  const canAct = hitterId === localSocketId;
  blackjackView.setControlsEnabled(canAct);
  updateTurnSignal();
  setStatus("Blackjack duel started.");
  renderBoard();
});

socketClient.onBlackjackUpdate(({ hitterHand, dealerHand, hitterScore, dealerScore }) => {
  blackjackView.renderHands({
    hitterHand,
    dealerHand: dealerHand || [],
    showDealerAll: true,
  });
  blackjackView.setScores({ hitterScore, dealerScore });
});

socketClient.onUpdateBoard(({ 
  fen,
  attackerWins,
  resolutionNote,
  gameOver: isGameOver,
  gameOverMessage,
  captured,
  winnerId,
  loserId,
}) => {
  const fallbackMessage = attackerWins ? "You won, piece captured." : "You busted, lost the piece.";
  const message = resolutionNote || fallbackMessage;
  if (captured) {
    capturedView.setCaptured(captured);
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

socketClient.onTimerUpdate(({ whiteMs, blackMs, active, paused }) => {
  timerState = {
    ...timerState,
    whiteMs: typeof whiteMs === "number" ? whiteMs : timerState.whiteMs,
    blackMs: typeof blackMs === "number" ? blackMs : timerState.blackMs,
    active: active || timerState.active,
    paused: typeof paused === "boolean" ? paused : timerState.paused,
  };
  renderTimers();
});

hitBtn.addEventListener("click", () => {
  if (!currentRoomId || !blackjackActive) {
    return;
  }
  socketClient.emitBlackjackHit({ roomId: currentRoomId });
});

standBtn.addEventListener("click", () => {
  if (!currentRoomId || !blackjackActive) {
    return;
  }
  socketClient.emitBlackjackStand({ roomId: currentRoomId });
});

if (pauseBtn) {
  pauseBtn.addEventListener("click", () => {
    if (!currentRoomId) {
      return;
    }
    socketClient.emitTimerToggle({ roomId: currentRoomId });
  });
}

setPhase("Connecting...", false);
updateTurnSignal();
renderTimers();
