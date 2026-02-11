const pieceValues = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export function fenToBoard(fen) {
  if (!fen) {
    return [];
  }
  const rows = fen.split(" ")[0].split("/");
  return rows.map((row) => {
    const cells = [];
    for (const char of row) {
      if (Number.isNaN(Number(char))) {
        cells.push(char);
      } else {
        const count = Number(char);
        for (let i = 0; i < count; i += 1) {
          cells.push(null);
        }
      }
    }
    return cells;
  });
}

export function pieceLabel(piece) {
  if (!piece) {
    return "";
  }
  const isWhite = piece === piece.toUpperCase();
  const type = piece.toLowerCase();
  const whiteMap = {
    k: "\u2654",
    q: "\u2655",
    r: "\u2656",
    b: "\u2657",
    n: "\u2658",
    p: "\u2659",
  };
  const blackMap = {
    k: "\u265A",
    q: "\u265B",
    r: "\u265C",
    b: "\u265D",
    n: "\u265E",
    p: "\u265F",
  };
  return isWhite ? whiteMap[type] : blackMap[type];
}

export function pieceGlyphFromCaptured(piece) {
  if (!piece) {
    return "";
  }
  const char = piece.color === "w" ? piece.type.toUpperCase() : piece.type;
  return pieceLabel(char);
}

export function calculateMaterialScore(fen) {
  if (!fen) {
    return 0;
  }
  const board = fenToBoard(fen);
  let score = 0;
  board.forEach((row) => {
    row.forEach((piece) => {
      if (!piece) {
        return;
      }
      const isWhite = piece === piece.toUpperCase();
      const value = pieceValues[piece.toLowerCase()] || 0;
      score += isWhite ? value : -value;
    });
  });
  return score;
}
