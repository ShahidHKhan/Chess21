import { pieceGlyphFromCaptured } from "../utils/fen.js";

export class CapturedView {
  constructor({ whiteEl, blackEl }) {
    this.whiteEl = whiteEl;
    this.blackEl = blackEl;
  }

  renderCaptured(container, pieces) {
    container.innerHTML = "";
    if (!pieces || pieces.length === 0) {
      const placeholder = document.createElement("div");
      placeholder.className = "bj-state";
      placeholder.textContent = "None";
      container.appendChild(placeholder);
      return;
    }
    pieces.forEach((piece) => {
      const pieceEl = document.createElement("div");
      pieceEl.className = "captured-piece";
      pieceEl.textContent = pieceGlyphFromCaptured(piece);
      container.appendChild(pieceEl);
    });
  }

  setCaptured(captured) {
    if (!captured) {
      return;
    }
    const white = Array.isArray(captured.white) ? captured.white : [];
    const black = Array.isArray(captured.black) ? captured.black : [];
    this.renderCaptured(this.whiteEl, white);
    this.renderCaptured(this.blackEl, black);
  }
}
