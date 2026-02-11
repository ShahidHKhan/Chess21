export class BlackjackView {
  constructor({
    tableEl,
    stateEl,
    dealerCardsEl,
    hitterCardsEl,
    dealerScoreEl,
    hitterScoreEl,
    hitBtn,
    standBtn,
  }) {
    this.tableEl = tableEl;
    this.stateEl = stateEl;
    this.dealerCardsEl = dealerCardsEl;
    this.hitterCardsEl = hitterCardsEl;
    this.dealerScoreEl = dealerScoreEl;
    this.hitterScoreEl = hitterScoreEl;
    this.hitBtn = hitBtn;
    this.standBtn = standBtn;
  }

  setActive(isVisible) {
    this.tableEl.classList.toggle("active", isVisible);
  }

  setState(text) {
    this.stateEl.textContent = text;
  }

  setScores({ hitterScore, dealerScore }) {
    if (typeof hitterScore === "number") {
      this.renderScoreText(this.hitterScoreEl, hitterScore);
    }
    if (typeof dealerScore === "number") {
      this.renderScoreText(this.dealerScoreEl, dealerScore);
    }
  }

  resetScores() {
    this.renderScoreText(this.hitterScoreEl, null);
    this.renderScoreText(this.dealerScoreEl, null);
  }

  renderScoreText(container, score) {
    container.innerHTML = "";
    const value = document.createElement("div");
    value.className = "score-value";
    value.textContent = typeof score === "number" ? String(score) : "-";
    container.appendChild(value);
  }

  setControlsEnabled(canAct) {
    this.hitBtn.disabled = !canAct;
    this.standBtn.disabled = !canAct;
  }

  renderCards(container, cards, hideFirst) {
    container.innerHTML = "";
    if (!cards || cards.length === 0) {
      const placeholder = document.createElement("div");
      placeholder.className = "bj-state";
      placeholder.textContent = "No cards";
      container.appendChild(placeholder);
      return;
    }
    cards.forEach((card, index) => {
      const cardEl = document.createElement("div");
      cardEl.className = "card";
      if (hideFirst && index === 0) {
        cardEl.classList.add("back");
        cardEl.textContent = "?";
      } else {
        const rank = card.slice(0, -1);
        const suit = card.slice(-1);
        const suitMap = {
          S: "\u2660",
          H: "\u2665",
          D: "\u2666",
          C: "\u2663",
        };
        const isRed = suit === "H" || suit === "D";
        cardEl.classList.add(isRed ? "red" : "black");

        const top = document.createElement("div");
        top.className = "card-corner top";
        top.textContent = `${rank}\n${suitMap[suit] || suit}`;

        const bottom = document.createElement("div");
        bottom.className = "card-corner bottom";
        bottom.textContent = `${rank}\n${suitMap[suit] || suit}`;

        const face = document.createElement("div");
        face.className = "card-face";
        face.textContent = suitMap[suit] || suit;

        cardEl.appendChild(top);
        cardEl.appendChild(bottom);
        cardEl.appendChild(face);
      }
      container.appendChild(cardEl);
    });
  }

  renderHands({ hitterHand, dealerHand, showDealerAll }) {
    this.renderCards(this.hitterCardsEl, hitterHand, false);
    this.renderCards(this.dealerCardsEl, dealerHand || [], !showDealerAll);
  }
}
