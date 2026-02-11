import { fenToBoard, pieceLabel } from "../utils/fen.js";

const baseFileLabels = ["a", "b", "c", "d", "e", "f", "g", "h"];
const baseRankLabels = ["8", "7", "6", "5", "4", "3", "2", "1"];

export function ChessBoard({
  fen,
  selectedSquare,
  playerColor,
  blackjackActive,
  threatenedSquare,
  lastMove,
  validMoves,
  onSquareClick,
}) {
  const board = fenToBoard(fen);
  const flipped = playerColor === "black";
  const fileLabels = flipped ? [...baseFileLabels].reverse() : baseFileLabels;
  const rankLabels = flipped ? [...baseRankLabels].reverse() : baseRankLabels;
  const squares = [];

  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
      const boardRank = flipped ? 7 - rankIndex : rankIndex;
      const boardFile = flipped ? 7 - fileIndex : fileIndex;
      const piece = board?.[boardRank]?.[boardFile] || null;
      const isLight = (rankIndex + fileIndex) % 2 === 0;
      const squareName = `${fileLabels[fileIndex]}${rankLabels[rankIndex]}`;
      const actualName = `${baseFileLabels[boardFile]}${baseRankLabels[boardRank]}`;

      const classNames = ["square", isLight ? "light" : "dark"];
      if (selectedSquare === squareName) {
        classNames.push("selected");
      }
      if (lastMove && (actualName === lastMove.from || actualName === lastMove.to)) {
        classNames.push("last-move");
      }
      if (Array.isArray(validMoves) && validMoves.includes(actualName)) {
        classNames.push("valid-move");
      }
      if (blackjackActive && threatenedSquare === actualName) {
        classNames.push("threatened");
      }
      if (piece) {
        classNames.push("has-piece");
      }

      squares.push(
        <div
          key={actualName}
          className={classNames.join(" ")}
          data-square={squareName}
          onClick={() => onSquareClick(squareName)}
        >
          {piece ? (
            <div className={`piece ${piece === piece.toUpperCase() ? "white" : "black"}`}>
              {pieceLabel(piece)}
            </div>
          ) : null}
        </div>
      );
    }
  }

  return (
    <div className="board-wrap">
      <div className="rank-labels" id="rank-labels">
        {rankLabels.map((rank) => (
          <div key={rank}>{rank}</div>
        ))}
      </div>
      <div>
        <div id="chess-board" aria-label="Chess board">
          {squares}
        </div>
        <div className="file-labels" id="file-labels">
          {fileLabels.map((file) => (
            <div key={file}>{file}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
