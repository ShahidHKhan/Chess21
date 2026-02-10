export class ResultModal {
  constructor({ modalEl, titleEl, messageEl, closeBtn }) {
    this.modalEl = modalEl;
    this.titleEl = titleEl;
    this.messageEl = messageEl;
    this.closeBtn = closeBtn;

    this.closeBtn.addEventListener("click", () => this.hide());
  }

  show({ winnerId, loserId, localSocketId, message }) {
    if (!this.modalEl || !this.titleEl || !this.messageEl) {
      return;
    }
    let title = "Game Over";
    this.modalEl.classList.remove("win", "lose");
    if (localSocketId && winnerId && loserId) {
      if (localSocketId === winnerId) {
        title = "You Win!";
        this.modalEl.classList.add("win");
      } else if (localSocketId === loserId) {
        title = "You Lose";
        this.modalEl.classList.add("lose");
      }
    }
    this.titleEl.textContent = title;
    this.messageEl.textContent = message || "Game over.";
    this.modalEl.classList.add("show");
    this.modalEl.setAttribute("aria-hidden", "false");
  }

  hide() {
    if (!this.modalEl) {
      return;
    }
    this.modalEl.classList.remove("show");
    this.modalEl.classList.remove("win", "lose");
    this.modalEl.setAttribute("aria-hidden", "true");
  }
}
