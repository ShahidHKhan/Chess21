import { pieceGlyphFromCaptured } from "../utils/fen.js";

function CapturedRow({ label, pieces, id }) {
  return (
    <div className="captured-row">
      <div className="captured-label">{label}</div>
      <div className="captured-pieces" id={id}>
        {pieces.length === 0 ? (
          <div className="bj-state">None</div>
        ) : (
          pieces.map((piece, index) => (
            <div key={`${piece.type}-${piece.color}-${index}`} className="captured-piece">
              {pieceGlyphFromCaptured(piece)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function CapturedPanel({ captured }) {
  const white = Array.isArray(captured?.white) ? captured.white : [];
  const black = Array.isArray(captured?.black) ? captured.black : [];

  return (
    <div className="eval-captured">
      <CapturedRow label="White" pieces={white} id="captured-white" />
      <CapturedRow label="Black" pieces={black} id="captured-black" />
    </div>
  );
}
