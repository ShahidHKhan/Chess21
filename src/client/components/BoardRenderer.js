import { fenToBoard, pieceLabel } from "../utils/fen.js";

export class BoardRenderer {
  constructor({ boardEl, rankLabelsEl, fileLabelsEl, onSquareClick }) {
    this.boardEl = boardEl;
    this.rankLabelsEl = rankLabelsEl;
    this.fileLabelsEl = fileLabelsEl;
    this.onSquareClick = onSquareClick;

    this.baseFileLabels = ["a", "b", "c", "d", "e", "f", "g", "h"];
    this.baseRankLabels = ["8", "7", "6", "5", "4", "3", "2", "1"];
    this.fileLabels = [...this.baseFileLabels];
    this.rankLabels = [...this.baseRankLabels];

    this.state = {
      fen: null,
      selectedSquare: null,
      playerColor: null,
      blackjackActive: false,
      threatenedSquare: null,
      lastMove: null,
      validMoves: [],
    };

    this.setupLabels();
  }

  setOrientation(color) {
    const flipped = color === "black";
    this.fileLabels = flipped ? [...this.baseFileLabels].reverse() : [...this.baseFileLabels];
    this.rankLabels = flipped ? [...this.baseRankLabels].reverse() : [...this.baseRankLabels];
    this.setupLabels();
  }

  setState(nextState) {
    this.state = { ...this.state, ...nextState };
  }

  setupLabels() {
    this.rankLabelsEl.innerHTML = "";
    this.fileLabelsEl.innerHTML = "";
    this.rankLabels.forEach((rank) => {
      const label = document.createElement("div");
      label.textContent = rank;
      this.rankLabelsEl.appendChild(label);
    });
    this.fileLabels.forEach((file) => {
      const label = document.createElement("div");
      label.textContent = file;
      this.fileLabelsEl.appendChild(label);
    });
  }

  squareName(rankIndex, fileIndex) {
    return `${this.fileLabels[fileIndex]}${this.rankLabels[rankIndex]}`;
  }

  getPieceAt(square) {
    if (!this.state.fen || !square || square.length < 2) {
      return null;
    }
    const file = square[0];
    const rank = Number(square[1]);
    const fileIndex = this.baseFileLabels.indexOf(file);
    if (Number.isNaN(rank) || fileIndex === -1) {
      return null;
    }
    const board = fenToBoard(this.state.fen);
    const boardRank = 8 - rank;
    return board?.[boardRank]?.[fileIndex] || null;
  }

  resolveCastlingTarget(from, to) {
    const king = this.getPieceAt(from);
    const rook = this.getPieceAt(to);
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

  render() {
    const { fen, selectedSquare, playerColor, blackjackActive, threatenedSquare, lastMove, validMoves } = this.state;
    this.boardEl.innerHTML = "";
    const board = fenToBoard(fen);
    const flipped = playerColor === "black";
    for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
      for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
        const boardRank = flipped ? 7 - rankIndex : rankIndex;
        const boardFile = flipped ? 7 - fileIndex : fileIndex;
        const piece = board?.[boardRank]?.[boardFile] || null;
        const square = document.createElement("div");
        const isLight = (rankIndex + fileIndex) % 2 === 0;
        square.className = `square ${isLight ? "light" : "dark"}`;
        const name = this.squareName(rankIndex, fileIndex);
        const actualName = `${this.baseFileLabels[boardFile]}${this.baseRankLabels[boardRank]}`;
        square.dataset.square = name;

        if (selectedSquare === name) {
          square.classList.add("selected");
        }

        if (lastMove && (actualName === lastMove.from || actualName === lastMove.to)) {
          square.classList.add("last-move");
        }

        if (Array.isArray(validMoves) && validMoves.includes(actualName)) {
          square.classList.add("valid-move");
        }

        if (blackjackActive && threatenedSquare === actualName) {
          square.classList.add("threatened");
        }

        if (piece) {
          square.classList.add("has-piece");
          const pieceEl = document.createElement("div");
          const isWhite = piece === piece.toUpperCase();
          pieceEl.className = `piece ${isWhite ? "white" : "black"}`;
          pieceEl.textContent = pieceLabel(piece);
          square.appendChild(pieceEl);
        }

        square.addEventListener("click", () => this.onSquareClick(name));
        this.boardEl.appendChild(square);
      }
    }
  }
}
