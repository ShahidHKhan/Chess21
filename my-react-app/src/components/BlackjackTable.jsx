function ScoreSlot({ score }) {
  return (
    <div className="score-slots">
      <div className="score-value">{typeof score === "number" ? String(score) : "-"}</div>
    </div>
  );
}

function Cards({ cards }) {
  if (!cards || cards.length === 0) {
    return <div className="bj-state">No cards</div>;
  }

  return (
    <>
      {cards.map((card, index) => {
        const rank = card.slice(0, -1);
        const suit = card.slice(-1);
        const suitMap = {
          S: "\u2660",
          H: "\u2665",
          D: "\u2666",
          C: "\u2663",
        };
        const isRed = suit === "H" || suit === "D";

        return (
          <div key={`${card}-${index}`} className={`card ${isRed ? "red" : "black"}`}>
            <div className="card-corner top">{`${rank}\n${suitMap[suit] || suit}`}</div>
            <div className="card-corner bottom">{`${rank}\n${suitMap[suit] || suit}`}</div>
            <div className="card-face">{suitMap[suit] || suit}</div>
          </div>
        );
      })}
    </>
  );
}

export function BlackjackTable({
  active,
  stateText,
  dealerHand,
  hitterHand,
  dealerScore,
  hitterScore,
  controlsEnabled,
  onHit,
  onStand,
}) {
  return (
    <div id="blackjack-table" className={active ? "active" : ""}>
      <div className="bj-top">
        <div className="bj-header">
          <div className="bj-title">Blackjack Duel</div>
          <div className="bj-state" id="bj-state">
            {stateText}
          </div>
        </div>
        <div className="bj-row">
          <div className="bj-label">Dealer</div>
          <div>
            <div className="cards" id="dealer-cards">
              <Cards cards={dealerHand} />
            </div>
            <div className="bj-score">
              <div className="score-label">Score</div>
              <ScoreSlot score={dealerScore} />
            </div>
          </div>
        </div>
        <div className="bj-row">
          <div className="bj-label">Attacker</div>
          <div>
            <div className="cards" id="hitter-cards">
              <Cards cards={hitterHand} />
            </div>
            <div className="bj-score">
              <div className="score-label">Score</div>
              <ScoreSlot score={hitterScore} />
            </div>
          </div>
        </div>
        <div className="bj-controls">
          <button className="btn hit" id="hit-btn" disabled={!controlsEnabled} onClick={onHit}>
            Hit
          </button>
          <button className="btn stand" id="stand-btn" disabled={!controlsEnabled} onClick={onStand}>
            Stand
          </button>
        </div>
      </div>
      <div className="bj-bottom"></div>
    </div>
  );
}
