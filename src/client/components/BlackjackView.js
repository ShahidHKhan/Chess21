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
      this.renderScoreSlots(this.hitterScoreEl, hitterScore);
    }
    if (typeof dealerScore === "number") {
      this.renderScoreSlots(this.dealerScoreEl, dealerScore);
    }
  }

  resetScores() {
    this.renderScoreSlots(this.hitterScoreEl, null);
    this.renderScoreSlots(this.dealerScoreEl, null);
  }

  renderScoreSlots(container, score) {
    container.innerHTML = "";
    const slots = 3;
    const suits = ["\u2660", "\u2665", "\u2666", "\u2663"];
    const suit = typeof score === "number" ? suits[Math.abs(score) % suits.length] : null;
    for (let i = 0; i < slots; i += 1) {
      const slot = document.createElement("div");
      slot.className = "score-slot";
      if (i === 0 && typeof score === "number") {
        const card = document.createElement("div");
        const isRed = suit === "\u2665" || suit === "\u2666";
        card.className = `score-card ${isRed ? "red" : ""}`.trim();
        card.textContent = score;
        const suitEl = document.createElement("div");
        suitEl.className = "score-suit";
        suitEl.textContent = suit;
        card.appendChild(suitEl);
        slot.appendChild(card);
      }
      container.appendChild(slot);
    }
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
