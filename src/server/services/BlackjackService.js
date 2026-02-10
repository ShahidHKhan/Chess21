class BlackjackService {
  createDeck() {
    const suits = ["S", "H", "D", "C"];
    const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const deck = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push(`${rank}${suit}`);
      }
    }
    return deck;
  }

  shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  cardValue(card) {
    const rank = card.slice(0, -1);
    if (rank === "A") {
      return 11;
    }
    if (["K", "Q", "J"].includes(rank)) {
      return 10;
    }
    return Number(rank);
  }

  handScore(hand) {
    let total = 0;
    let aces = 0;
    for (const card of hand) {
      const rank = card.slice(0, -1);
      if (rank === "A") {
        aces += 1;
      }
      total += this.cardValue(card);
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces -= 1;
    }
    return total;
  }

  shouldDealerHit(hand) {
    return this.handScore(hand) < 17;
  }

  dealInitial(deck) {
    return {
      hitterHand: [deck.pop(), deck.pop()],
      dealerHand: [deck.pop()],
    };
  }
}

module.exports = new BlackjackService();
