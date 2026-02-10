# Chess21

Chess21 is a two-player web game that mixes chess with blackjack. Normal chess moves apply, but any capture (plus promotion or en passant) triggers a blackjack duel that decides whether the capture stands.

## Run

```bash
npm install
npm start
```
Then open http://localhost:3000 in two browser windows.

## How it works (short)

- Server (Node + Express + Socket.IO) hosts the client, runs rooms, validates moves, and resolves blackjack outcomes.
- Client (vanilla JS) renders the board and blackjack UI, sends actions, and updates from socket events.
- Shared constants define socket event names and game phases used by both sides.

## Capture flow

1. Player makes a move.
2. If it is a capture/promotion/en passant, the server starts a blackjack duel.
3. Attacker can hit or stand; dealer draws to 17.
4. Server resolves the duel and applies or cancels the capture.
5. Both clients receive the updated board state.

## Key files

- [server.js](server.js): server entry point.
- [src/server/index.js](src/server/index.js): Express + Socket.IO setup.
- [src/server/handlers/gameHandler.js](src/server/handlers/gameHandler.js): main game logic and socket events.
- [src/server/services/ChessService.js](src/server/services/ChessService.js): move validation and blackjack resolution.
- [src/server/services/BlackjackService.js](src/server/services/BlackjackService.js): blackjack rules.
- [src/server/services/RoomManager.js](src/server/services/RoomManager.js): room assignment.
- [src/client/main.js](src/client/main.js): client controller and UI updates.
- [src/client/components](src/client/components): board, blackjack, captured pieces, result modal.
- [src/client/utils/fen.js](src/client/utils/fen.js): FEN parsing and evaluation bar.
- [src/shared/constants.js](src/shared/constants.js): shared event and phase constants.

## Troubleshooting

- Run `node -v` to confirm Node is installed.
- If the page loads without a board, check the browser console for errors.


<img width="1024" height="559" alt="image" src="https://github.com/user-attachments/assets/ba1d6392-306b-489a-a810-b6e76b4a8cb6" />
