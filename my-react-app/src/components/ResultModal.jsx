export function ResultModal({ open, title, message, variant, onClose }) {
  const classNames = ["result-modal"];
  if (open) {
    classNames.push("show");
  }
  if (variant === "win") {
    classNames.push("win");
  }
  if (variant === "lose") {
    classNames.push("lose");
  }

  return (
    <div className={classNames.join(" ")} aria-hidden={open ? "false" : "true"}>
      <div className="result-card">
        <div className="result-title">{title}</div>
        <div className="result-message">{message}</div>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
