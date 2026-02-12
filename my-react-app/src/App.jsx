import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Chess } from "chess.js";
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { EVENTS } from "./shared/constants.js";
import { calculateMaterialScore, fenToBoard } from "./utils/fen.js";
import { db } from "./utils/firebase.js";
import { useAuth } from "./context/AuthContext.jsx";
import { BlackjackTable } from "./components/BlackjackTable.jsx";
import { CapturedPanel } from "./components/CapturedPanel.jsx";
import { ChessBoard } from "./components/ChessBoard.jsx";
import LoginButton from "./components/LoginButton.jsx";
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
  const joinedInviteRoomsRef = useRef(new Set());
  const pendingInviteRoomsRef = useRef(new Set());
  const localGameRef = useRef(null);
  const localBlackjackRef = useRef(null);
  const { currentUser } = useAuth();

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
  const [userSearch, setUserSearch] = useState("");
  const [recentSentInvites, setRecentSentInvites] = useState([]);
  const [recentReceivedInvites, setRecentReceivedInvites] = useState([]);
  const [recentLoading, setRecentLoading] = useState({ sent: false, received: false });
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteStatus, setInviteStatus] = useState(null);
  const [incomingInvites, setIncomingInvites] = useState([]);
  const [inviteActions, setInviteActions] = useState({});
  const [inviteNotice, setInviteNotice] = useState(null);
  const [botMode, setBotMode] = useState(false);
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

  useEffect(() => {
    const senderEmail = currentUser?.email?.toLowerCase();
    if (!senderEmail) {
      setRecentSentInvites([]);
      setRecentLoading((prev) => ({ ...prev, sent: false }));
      return;
    }
    setRecentLoading((prev) => ({ ...prev, sent: true }));
    const sentQuery = query(
      collection(db, "invites"),
      where("fromEmail", "==", senderEmail),
      where("status", "==", "accepted"),
      limit(20)
    );
    const unsubscribe = onSnapshot(
      sentQuery,
      (snapshot) => {
        const entries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setRecentSentInvites(entries);
        setRecentLoading((prev) => ({ ...prev, sent: false }));
      },
      () => {
        setRecentLoading((prev) => ({ ...prev, sent: false }));
      }
    );
    return unsubscribe;
  }, [currentUser]);

  useEffect(() => {
    const recipientEmail = currentUser?.email?.toLowerCase();
    if (!recipientEmail) {
      setRecentReceivedInvites([]);
      setRecentLoading((prev) => ({ ...prev, received: false }));
      return;
    }
    setRecentLoading((prev) => ({ ...prev, received: true }));
    const receivedQuery = query(
      collection(db, "invites"),
      where("toEmail", "==", recipientEmail),
      where("status", "==", "accepted"),
      limit(20)
    );
    const unsubscribe = onSnapshot(
      receivedQuery,
      (snapshot) => {
        const entries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setRecentReceivedInvites(entries);
        setRecentLoading((prev) => ({ ...prev, received: false }));
      },
      () => {
        setRecentLoading((prev) => ({ ...prev, received: false }));
      }
    );
    return unsubscribe;
  }, [currentUser]);

  useEffect(() => {
    const recipientEmail = currentUser?.email?.toLowerCase();
    if (!recipientEmail) {
      setIncomingInvites([]);
      return;
    }
    const invitesQuery = query(
      collection(db, "invites"),
      where("toEmail", "==", recipientEmail),
      where("status", "==", "pending"),
      limit(10)
    );
    const unsubscribe = onSnapshot(
      invitesQuery,
      (snapshot) => {
        const entries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        entries.sort((a, b) => {
          const aSeconds = a?.createdAt?.seconds || 0;
          const bSeconds = b?.createdAt?.seconds || 0;
          return bSeconds - aSeconds;
        });
        setIncomingInvites(entries);
      },
      (error) => {
        console.error("Invite listener error:", error);
      }
    );
    return unsubscribe;
  }, [currentUser]);

  const canChessAct =
    !blackjackActive &&
    !gameOver &&
    Boolean(currentTurn && playerColor && currentTurn === playerColor[0]);
  const canBlackjackAct = blackjackActive && !gameOver && attackerId === localSocketId;
  const turnIsReady = Boolean(currentTurn && playerColor);
  const isMyTurn = turnIsReady && currentTurn === playerColor[0];
  const isGameActive = Boolean(currentRoomId && currentTurn && !gameOver);

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

  const recentOpponents = useMemo(() => {
    if (!currentUser) {
      return [];
    }
    const me = currentUser.email?.toLowerCase() || "";
    const combined = [...recentSentInvites, ...recentReceivedInvites];
    const byEmail = new Map();
    combined.forEach((invite) => {
      const isSender = invite.fromEmail?.toLowerCase() === me;
      const opponentEmail = isSender ? invite.toEmail : invite.fromEmail;
      if (!opponentEmail) {
        return;
      }
      const opponentName = isSender ? invite.toName || invite.toEmail : invite.fromName || invite.fromEmail;
      const lastPlayed = invite.respondedAt?.seconds || invite.createdAt?.seconds || 0;
      const existing = byEmail.get(opponentEmail);
      if (!existing || lastPlayed > existing.lastPlayed) {
        byEmail.set(opponentEmail, {
          email: opponentEmail,
          name: opponentName || opponentEmail,
          lastPlayed,
        });
      }
    });
    return Array.from(byEmail.values()).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 8);
  }, [currentUser, recentReceivedInvites, recentSentInvites]);

  const filteredOpponents = useMemo(() => {
    if (!currentUser) {
      return [];
    }
    const normalized = userSearch.trim().toLowerCase();
    if (!normalized) {
      return recentOpponents;
    }
    return recentOpponents.filter((opponent) => {
      const email = opponent.email?.toLowerCase() || "";
      const name = opponent.name?.toLowerCase() || "";
      return email.includes(normalized) || name.includes(normalized);
    });
  }, [currentUser, recentOpponents, userSearch]);

  const handleSendInvite = useCallback(async () => {
    if (!currentUser) {
      return;
    }
    const trimmedEmail = userSearch.trim().toLowerCase();
    if (!trimmedEmail) {
      setInviteStatus("Enter an email to invite.");
      return;
    }
    if (currentUser.email && trimmedEmail === currentUser.email.toLowerCase()) {
      setInviteStatus("You cannot invite yourself.");
      return;
    }
    setInviteSending(true);
    setInviteStatus(null);
    try {
      await addDoc(collection(db, "invites"), {
        fromUid: currentUser.uid,
        fromEmail: currentUser.email?.toLowerCase() || "",
        fromName: currentUser.displayName || "",
        toEmail: trimmedEmail,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      setInviteStatus("Invite sent.");
    } catch (error) {
      console.error("Invite failed:", error);
      setInviteStatus("Invite failed. Try again.");
    } finally {
      setInviteSending(false);
    }
  }, [currentUser, userSearch]);

  const joinInviteRoom = useCallback((roomId) => {
    if (!roomId || joinedInviteRoomsRef.current.has(roomId)) {
      return;
    }
    if (!socketRef.current) {
      pendingInviteRoomsRef.current.add(roomId);
      return;
    }
    socketRef.current.emit(EVENTS.JOIN_INVITE_ROOM, { roomId });
    joinedInviteRoomsRef.current.add(roomId);
    pendingInviteRoomsRef.current.delete(roomId);
  }, []);

  const swapEngineTurn = useCallback((engine) => {
    const parts = engine.fen().split(" ");
    parts[1] = parts[1] === "w" ? "b" : "w";
    engine.load(parts.join(" "));
  }, []);

  const createDeck = useCallback(() => {
    const suits = ["S", "H", "D", "C"];
    const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const deck = [];
    suits.forEach((suit) => {
      ranks.forEach((rank) => {
        deck.push(`${rank}${suit}`);
      });
    });
    return deck;
  }, []);

  const shuffleDeck = useCallback((deck) => {
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }, []);

  const handScore = useCallback((hand) => {
    let total = 0;
    let aces = 0;
    hand.forEach((card) => {
      const rank = card.slice(0, -1);
      if (rank === "A") {
        aces += 1;
        total += 11;
      } else if (["K", "Q", "J"].includes(rank)) {
        total += 10;
      } else {
        total += Number(rank);
      }
    });
    while (total > 21 && aces > 0) {
      total -= 10;
      aces -= 1;
    }
    return total;
  }, []);

  const shouldDealerHit = useCallback((hand) => handScore(hand) < 17, [handScore]);

  const updateLocalBlackjackView = useCallback(() => {
    const state = localBlackjackRef.current;
    if (!state) {
      return;
    }
    setBlackjackState({
      dealerHand: state.dealerHand,
      hitterHand: state.hitterHand,
      dealerScore: handScore(state.dealerHand),
      hitterScore: handScore(state.hitterHand),
      stateText: state.attackerColor === "w" ? "You are attacking" : "Defending",
      controlsEnabled: state.attackerColor === "w" && !state.locked,
    });
  }, [handScore]);

  const finishLocalBlackjack = useCallback((engine, move, attackerWins, isPush) => {
    let gameOverLocal = false;
    const attackerPiece = engine.get(move.from);
    const attackerColor = attackerPiece?.color || move.color || engine.turn();
    const defenderColor = attackerColor === "w" ? "b" : "w";

    if (attackerWins) {
      engine.move(move);
      setLastMove({ from: move.from, to: move.to });
    } else if (!isPush) {
      if (attackerPiece && attackerPiece.type === "k") {
        engine.remove(move.from);
        gameOverLocal = true;
        setStatus("King was eaten after losing blackjack. Game over.");
      } else {
        if (engine.turn() !== defenderColor) {
          swapEngineTurn(engine);
        }
        const reverseMove = engine.moves({ verbose: true }).find(
          (candidate) => candidate.from === move.to && candidate.to === move.from
        );
        if (reverseMove) {
          engine.move(reverseMove);
        } else if (attackerPiece) {
          engine.remove(move.from);
        }
      }
    }

    if ((!attackerWins || isPush) && !gameOverLocal) {
      if (engine.turn() !== defenderColor) {
        swapEngineTurn(engine);
      }
    }

    setCurrentFen(engine.fen());
    setCurrentTurn(engine.turn());
    setBlackjackActive(false);
    setPendingBlackjackMove(null);
    setThreatenedSquare(null);
    setPhase({ text: gameOverLocal ? "Game over" : "Chess phase", active: !gameOverLocal });
    if (!gameOverLocal) {
      if (isPush) {
        setStatus("Push: no pieces captured.");
      } else {
        setStatus(attackerWins ? "Capture stands." : "Capture canceled.");
      }
    }
    if (gameOverLocal || engine.isGameOver()) {
      setGameOver(true);
      setPhase({ text: "Game over", active: false });
      setStatus("Game over.");
    }
  }, [swapEngineTurn]);

  const runDealerDraw = useCallback((engine, move, attackerColor) => {
    const state = localBlackjackRef.current;
    if (!state) {
      return;
    }
    const drawStep = () => {
      if (!state) {
        return;
      }
      if (shouldDealerHit(state.dealerHand)) {
        state.dealerHand.push(state.deck.pop());
        updateLocalBlackjackView();
        setTimeout(drawStep, 500);
        return;
      }
      const dealerScore = handScore(state.dealerHand);
      const hitterScore = handScore(state.hitterHand);
      let outcome = "DEFENDER";
      if (dealerScore > 21 || hitterScore > dealerScore) {
        outcome = "ATTACKER";
      } else if (dealerScore === hitterScore) {
        outcome = "PUSH";
      }
      const attackerWins = outcome === "ATTACKER";
      const isPush = outcome === "PUSH";
      state.locked = true;
      updateLocalBlackjackView();
      finishLocalBlackjack(engine, move, attackerWins, isPush);
      localBlackjackRef.current = null;
    };
    setTimeout(drawStep, 500);
  }, [finishLocalBlackjack, handScore, shouldDealerHit, updateLocalBlackjackView]);

  const runBotHitterTurn = useCallback((engine, move) => {
    const state = localBlackjackRef.current;
    if (!state) {
      return;
    }
    const hitStep = () => {
      if (!state) {
        return;
      }
      const score = handScore(state.hitterHand);
      if (score < 17) {
        state.hitterHand.push(state.deck.pop());
        updateLocalBlackjackView();
        if (handScore(state.hitterHand) > 21) {
          state.locked = true;
          updateLocalBlackjackView();
          finishLocalBlackjack(engine, move, false, false);
          localBlackjackRef.current = null;
          return;
        }
        setTimeout(hitStep, 500);
        return;
      }
      state.locked = true;
      updateLocalBlackjackView();
      runDealerDraw(engine, move, "b");
    };
    setTimeout(hitStep, 500);
  }, [finishLocalBlackjack, handScore, runDealerDraw, updateLocalBlackjackView]);

  const startLocalBlackjack = useCallback((engine, move, attackerColor) => {
    const deck = shuffleDeck(createDeck());
    const hitterHand = [deck.pop(), deck.pop()];
    const dealerHand = [deck.pop()];
    localBlackjackRef.current = {
      deck,
      hitterHand,
      dealerHand,
      attackerColor,
      locked: attackerColor !== "w",
      move,
    };
    setBlackjackActive(true);
    setPendingBlackjackMove({ from: move.from, to: move.to });
    setThreatenedSquare(move.to);
    setPhase({ text: "Blackjack phase", active: true });
    setStatus("Blackjack duel started.");
    updateLocalBlackjackView();
    if (attackerColor === "b") {
      runBotHitterTurn(engine, move);
    }
  }, [createDeck, runBotHitterTurn, shuffleDeck, updateLocalBlackjackView]);

  const startBotMatch = useCallback(() => {
    const engine = new Chess();
    localGameRef.current = engine;
    setBotMode(true);
    setCurrentFen(engine.fen());
    setCurrentTurn(engine.turn());
    setPlayerColor("white");
    setCurrentRoomId("bot-local");
    setGameOver(false);
    setBlackjackActive(false);
    setBlackjackState(initialBlackjackState);
    setThreatenedSquare(null);
    setSelectedSquare(null);
    setValidMoves([]);
    setLastMove(null);
    setPhase({ text: "Bot match", active: true });
    setStatus("Bot match started.");
  }, []);

  const stopBotMatch = useCallback(() => {
    setBotMode(false);
    localGameRef.current = null;
    localBlackjackRef.current = null;
    setCurrentFen(null);
    setCurrentTurn(null);
    setPlayerColor(null);
    setCurrentRoomId(null);
    setGameOver(false);
    setBlackjackActive(false);
    setBlackjackState(initialBlackjackState);
    setThreatenedSquare(null);
    setSelectedSquare(null);
    setValidMoves([]);
    setLastMove(null);
    setPhase({ text: "Lobby", active: false });
    setStatus("Waiting for invite...");
  }, []);

  const applyLocalMove = useCallback((from, to) => {
    const engine = localGameRef.current;
    if (!engine) {
      return;
    }
    const legalMoves = engine.moves({ verbose: true });
    const legalMove = legalMoves.find((move) => move.from === from && move.to === to);
    if (!legalMove) {
      setStatus("Illegal move.");
      return;
    }
    if (legalMove.captured) {
      startLocalBlackjack(engine, legalMove, "w");
      return;
    }
    engine.move(legalMove);
    setCurrentFen(engine.fen());
    setCurrentTurn(engine.turn());
    setLastMove({ from: legalMove.from, to: legalMove.to });
    setStatus(`Move: ${legalMove.san}`);
    if (engine.isGameOver()) {
      setGameOver(true);
      setPhase({ text: "Game over", active: false });
      setStatus("Game over.");
    }
  }, [startLocalBlackjack]);

  const handleLocalHit = useCallback(() => {
    const engine = localGameRef.current;
    const state = localBlackjackRef.current;
    if (!engine || !state || state.locked || state.attackerColor !== "w") {
      return;
    }
    state.hitterHand.push(state.deck.pop());
    updateLocalBlackjackView();
    if (handScore(state.hitterHand) > 21) {
      state.locked = true;
      updateLocalBlackjackView();
      finishLocalBlackjack(engine, state.move, false, false);
      localBlackjackRef.current = null;
    }
  }, [finishLocalBlackjack, handScore, updateLocalBlackjackView]);

  const handleLocalStand = useCallback(() => {
    const engine = localGameRef.current;
    const state = localBlackjackRef.current;
    if (!engine || !state || state.locked || state.attackerColor !== "w") {
      return;
    }
    state.locked = true;
    updateLocalBlackjackView();
    runDealerDraw(engine, state.move, "w");
  }, [runDealerDraw, updateLocalBlackjackView]);

  const handleInviteAction = useCallback(async (invite, status) => {
    if (!currentUser) {
      return;
    }
    const inviteId = invite?.id;
    if (!inviteId) {
      return;
    }
    setInviteActions((prev) => ({ ...prev, [inviteId]: true }));
    setInviteNotice(null);
    try {
      const roomId = status === "accepted"
        ? invite.roomId || `invite-${inviteId}`
        : invite.roomId || null;
      await updateDoc(doc(db, "invites", inviteId), {
        status,
        roomId,
        respondedAt: serverTimestamp(),
      });
      setInviteNotice(status === "accepted" ? "Invite accepted." : "Invite declined.");
      if (status === "accepted" && roomId) {
        joinInviteRoom(roomId);
      }
    } catch (error) {
      console.error("Invite update failed:", error);
      setInviteNotice("Invite update failed. Try again.");
    } finally {
      setInviteActions((prev) => {
        const next = { ...prev };
        delete next[inviteId];
        return next;
      });
    }
  }, [currentUser, joinInviteRoom]);

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
      if (botMode) {
        applyLocalMove(selectedSquare, targetSquare);
      } else {
        socketRef.current?.emit(EVENTS.MAKE_MOVE, {
          roomId: currentRoomId,
          move: { from: selectedSquare, to: targetSquare },
        });
      }
      setSelectedSquare(null);
      setValidMoves([]);
    },
    [
      botMode,
      blackjackActive,
      gameOver,
      currentRoomId,
      currentFen,
      currentTurn,
      playerColor,
      selectedSquare,
      getValidMovesForSquare,
      applyLocalMove,
    ]
  );

  useEffect(() => {
    if (botMode) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return undefined;
    }
    const serverUrl = import.meta.env.DEV ? "http://localhost:3000" : undefined;
    const socket = serverUrl ? io(serverUrl) : io();
    socketRef.current = socket;

    socket.on("connect", () => {
      setLocalSocketId(socket.id);
      pendingInviteRoomsRef.current.forEach((roomId) => {
        socket.emit(EVENTS.JOIN_INVITE_ROOM, { roomId });
        joinedInviteRoomsRef.current.add(roomId);
      });
      pendingInviteRoomsRef.current.clear();
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
  }, [botMode, queueBoardUpdate]);

  useEffect(() => {
    if (!botMode) {
      return undefined;
    }
    const engine = localGameRef.current;
    if (!engine || gameOver || blackjackActive || pendingBlackjackMove) {
      return undefined;
    }
    if (engine.turn() !== "b") {
      return undefined;
    }
    const timeoutId = setTimeout(() => {
      const moves = engine.moves({ verbose: true });
      if (moves.length === 0) {
        setGameOver(true);
        setPhase({ text: "Game over", active: false });
        setStatus("Game over.");
        return;
      }
      const choice = moves[Math.floor(Math.random() * moves.length)];
      if (choice.captured) {
        startLocalBlackjack(engine, choice, "b");
        return;
      }
      engine.move(choice);
      setCurrentFen(engine.fen());
      setCurrentTurn(engine.turn());
      setLastMove({ from: choice.from, to: choice.to });
      if (engine.isGameOver()) {
        setGameOver(true);
        setPhase({ text: "Game over", active: false });
        setStatus("Game over.");
      }
    }, 600);
    return () => clearTimeout(timeoutId);
  }, [botMode, currentTurn, gameOver, blackjackActive, pendingBlackjackMove, startLocalBlackjack]);

  useEffect(() => {
    const senderEmail = currentUser?.email?.toLowerCase();
    if (!senderEmail) {
      return;
    }
    const outgoingQuery = query(
      collection(db, "invites"),
      where("fromEmail", "==", senderEmail),
      where("status", "==", "accepted"),
      limit(5)
    );
    const unsubscribe = onSnapshot(
      outgoingQuery,
      (snapshot) => {
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (data?.roomId) {
            joinInviteRoom(data.roomId);
          }
        });
      },
      (error) => {
        console.error("Outgoing invite listener error:", error);
      }
    );
    return unsubscribe;
  }, [currentUser, joinInviteRoom]);

  const handleHit = useCallback(() => {
    if (botMode) {
      handleLocalHit();
      return;
    }
    if (!currentRoomId || !blackjackActive) {
      return;
    }
    socketRef.current?.emit(EVENTS.BLACKJACK_HIT, { roomId: currentRoomId });
  }, [botMode, currentRoomId, blackjackActive, handleLocalHit]);

  const handleStand = useCallback(() => {
    if (botMode) {
      handleLocalStand();
      return;
    }
    if (!currentRoomId || !blackjackActive) {
      return;
    }
    socketRef.current?.emit(EVENTS.BLACKJACK_STAND, { roomId: currentRoomId });
  }, [botMode, currentRoomId, blackjackActive, handleLocalStand]);

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
              className={`panel ${canChessAct ? "active-panel" : ""} ${currentUser ? "" : "dimmed"} ${isGameActive ? "" : "inactive"}`}
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
                  <aside className="eval-panel" id="eval-panel">
                    <div className="eval-body">
                      <div
                        className={`eval-label eval-label-top ${playerColor === "black" ? evalLabelClasses.white : evalLabelClasses.black}`}
                        id="eval-top"
                      >
                        {playerColor === "black" ? evalWhiteLabel : evalBlackLabel}
                      </div>
                      <div className="eval-bar">
                        <div className="eval-fill" id="eval-fill" style={evalFillStyle}></div>
                      </div>
                      <div
                        className={`eval-label eval-label-bottom ${playerColor === "black" ? evalLabelClasses.black : evalLabelClasses.white}`}
                        id="eval-bottom"
                      >
                        {playerColor === "black" ? evalBlackLabel : evalWhiteLabel}
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

        <aside
          className={`panel panel--glass player-panel ${currentUser ? "" : "needs-login"} ${isGameActive ? "" : "idle-glow"}`}
          id="player-panel"
        >
          <h2 className="player-panel-title">Player Hub</h2>
          <div className="player-auth">
            <LoginButton />
          </div>
          {!currentUser ? (
            <div className="player-actions">
              <p className="player-panel-copy">Sign in with Google to invite a player and start the match.</p>
            </div>
          ) : (
            <div className="player-actions">
              <div className="invite-panel">
                <div className="invite-title">Invites</div>
                {incomingInvites.length === 0 ? (
                  <div className="invite-empty">No invites yet</div>
                ) : (
                  <ul className="invite-items">
                    {incomingInvites.map((invite) => (
                      <li key={invite.id} className="invite-item">
                        <div className="invite-meta">
                          <div className="invite-name">{invite.fromName || "Player"}</div>
                          <div className="invite-email">{invite.fromEmail}</div>
                        </div>
                        <div className="invite-actions">
                          <button
                            className="btn"
                            type="button"
                            onClick={() => handleInviteAction(invite, "accepted")}
                            disabled={inviteActions[invite.id]}
                          >
                            Accept
                          </button>
                          <button
                            className="btn secondary"
                            type="button"
                            onClick={() => handleInviteAction(invite, "declined")}
                            disabled={inviteActions[invite.id]}
                          >
                            Decline
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {inviteNotice ? <div className="invite-empty">{inviteNotice}</div> : null}
              </div>
              <label className="player-label" htmlFor="player-search">
                Find by email
              </label>
              <div className="player-search">
                <input
                  className="player-input"
                  id="player-search"
                  type="email"
                  placeholder="player@example.com"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                />
                <button
                  className="btn"
                  type="button"
                  onClick={handleSendInvite}
                  disabled={inviteSending || !userSearch.trim()}
                >
                  {inviteSending ? "Sending..." : "Send invite"}
                </button>
              </div>
              {inviteStatus ? <div className="player-muted">{inviteStatus}</div> : null}
              <div className="player-list">
                <div className="player-list-title">Recently played</div>
                {recentLoading.sent || recentLoading.received ? (
                  <div className="player-muted">Loading recent opponents...</div>
                ) : filteredOpponents.length === 0 ? (
                  <div className="player-muted">No recent opponents yet</div>
                ) : (
                  <ul className="player-items">
                    {filteredOpponents.map((opponent) => (
                      <li key={opponent.email} className="player-item">
                        <div className="player-avatar">
                          <span>{opponent.name?.[0] || "?"}</span>
                        </div>
                        <div className="player-meta">
                          <div className="player-name">{opponent.name || "Player"}</div>
                          <div className="player-email">{opponent.email}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <div className="bot-panel">
            <div className="bot-title">Verse a bot</div>
            <button
              className="btn"
              type="button"
              onClick={botMode ? stopBotMatch : startBotMatch}
            >
              {botMode ? "End bot match" : "Start bot match"}
            </button>
          </div>
        </aside>
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
