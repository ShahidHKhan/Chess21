# Chess21

Chess21 is a multiplayer web-based game that combines chess with blackjack duels. When a capture is attempted, a blackjack duel determines if the capture succeeds.

## 🎮 How to Play

Chess21 follows standard chess rules with one twist: captures, promotions, and en passant moves trigger a blackjack duel.

**Game Flow:**
1. **Join**: Log in with Google and either matchmake, send/accept invites, or play against a bot
2. **Chess Phase**: Make legal chess moves with a 10-minute timer per player
3. **Capture Attempt**: Triggers blackjack duel - attacker becomes "hitter", defender becomes "dealer"
4. **Blackjack Duel**: Hitter gets 2 cards, dealer gets 1 card showing. Hitter can Hit or Stand. Dealer draws to 17+ after hitter stands.
5. **Resolution**:
   - **Attacker wins**: Capture stands (hitter score > dealer or dealer busts)
   - **Defender wins**: Capture canceled (dealer score > hitter or hitter busts). If attacking piece is king, king removed = game over
   - **Push**: Equal scores = no capture, board reverts, turn switches back
6. **Victory**: Checkmate, stalemate, king captured in blackjack, or time runs out

---

## 🏗️ Architecture Overview

### System Components

**React Client (Vite)** ↔ **Node.js Server (Express + Socket.IO)** ↔ **Firebase (Auth + Firestore)**

- Client uses Socket.IO for real-time game events and Firebase for authentication/invites
- Server manages game state in-memory (RoomManager), validates moves with chess.js, handles blackjack logic
- Firebase provides Google OAuth and real-time invite database

### Communication Flow

**Client → Server:** `make-move`, `blackjack-hit`, `blackjack-stand`, `join-invite-room`, `timer-toggle`

**Server → Client:** `room-assigned`, `game-ready`, `start-blackjack`, `blackjack-update`, `update-board`, `timer-update`, `move-rejected`, `player-left`

**Client ↔ Firebase:** Google OAuth authentication, invite creation/management, user profiles, real-time listeners

---

## 📁 File Architecture & Connections

### Server-Side Architecture

**server.js** → Entry point, calls [src/server/index.js](src/server/index.js)

**src/server/index.js** → Express + Socket.IO setup, serves React build, timer interval (500ms), connects to gameHandler

**src/server/handlers/gameHandler.js** → Socket event handler, processes all client events (`make-move`, `blackjack-hit`, etc.), manages game phases

**src/server/services/RoomManager.js** → Maintains Map of active rooms, handles matchmaking (`assignRoom`), invite rooms (`assignInviteRoom`), cleanup

**src/server/models/Room.js** → Room state: Chess.js instance, players, phase, pendingMove, blackjack data, timers, captured pieces

**src/server/services/ChessService.js** → Move validation, promotion/en passant detection, blackjack resolution logic, turn manipulation

**src/server/services/BlackjackService.js** → Deck creation/shuffling, card scoring (ace logic), dealer strategy (hit until 17+), initial deal

### Client-Side Architecture (React)

**my-react-app/src/main.jsx** → Entry point, renders App.jsx wrapped in AuthProvider

**my-react-app/src/context/AuthContext.jsx** → Firebase auth state management, provides `currentUser` globally, handles Google login/logout, syncs user to Firestore

**my-react-app/src/App.jsx** → Main component with:
- State: Socket connection, game state (FEN/turn/phase), player data, blackjack state, timers, UI state, invites
- Socket.IO effects: Connect on mount, listen for all events, join invite rooms, cleanup on unmount
- Firebase effects: Query sent/received invites, listen for pending invites via `onSnapshot()`
- Game logic: `handleSquareClick()`, bot mode handlers, blackjack actions, delayed board updates
- Renders: LoginButton, ChessBoard, BlackjackTable, CapturedPanel, ResultModal

**Components:**
- **ChessBoard.jsx** → Converts FEN to 8x8 grid, flips for black player, CSS highlighting (selected/valid/last-move/threatened), Unicode pieces
- **BlackjackTable.jsx** → Displays hands/scores, Hit/Stand buttons, state text
- **CapturedPanel.jsx** → Shows captured pieces with Unicode symbols
- **LoginButton.jsx** → Google login button or user profile with logout
- **ResultModal.jsx** → Game over modal with win/lose variant

**Utils:**
- **fen.js** → FEN parsing, Unicode piece labels, material evaluation
- **firebase.js** → Firebase initialization (auth, Firestore, Google provider) from env variables

**Shared:**
- **src/shared/constants.js** → Socket event names, game phases, blackjack outcomes (used by both client and server)

---

## ⚛️ React Architecture

**Component Hierarchy:** main.jsx → AuthProvider → App.jsx → (LoginButton, ChessBoard, BlackjackTable, CapturedPanel, ResultModal, inline UI)

**State Management:**
1. **Socket.IO**: Persistent connection via `useRef`, single effect for all listeners
2. **Game State**: `currentFen`, `currentTurn`, `phase`, `playerColor` (server-controlled)
3. **UI State**: `selectedSquare`, `validMoves`, `lastMove` (local interaction feedback)
4. **Blackjack**: `blackjackActive`, hands/scores (server-synced online, local for bot)
5. **Firebase**: `incomingInvites` via `onSnapshot()`, `recentOpponents` memoized

**React Patterns:**
- Custom hook `useAuth()` for authentication
- `useCallback` for stable event handlers
- `useMemo` for derived state (material eval, filtered invites)
- `useEffect` for side effects with cleanup
- `useRef` for non-render values (socket, chess.js instance, timeouts)

---

## 🔐 Firebase Authentication & Invites

**Initialization** ([firebase.js](my-react-app/src/utils/firebase.js)):
- Load credentials from `.env` (VITE_FIREBASE_*)
- Export: `auth`, `googleProvider`, `db`

**Auth Context** ([AuthContext.jsx](my-react-app/src/context/AuthContext.jsx)):
- Provides `currentUser` via React Context
- `loginWithGoogle()` → Google OAuth popup
- `onAuthStateChanged()` listener detects login/logout
- Syncs to Firestore `users/{email}`: displayName, photoURL, lastSeen (merge: true)

**Firestore Collections:**
- **users/**: email (doc ID), displayName, photoURL, lastSeen
- **invites/**: fromEmail, fromName, toEmail, roomId, status (pending/accepted/declined), createdAt, respondedAt

**Invite System:**
- **Listen**: `onSnapshot(query(where("toEmail", "==", user), where("status", "==", "pending")))` for real-time updates
- **Send**: `addDoc(invites/, { fromEmail, toEmail, status: "pending" })`
- **Accept**: `updateDoc({ status: "accepted", roomId })` → emit `join-invite-room` to Socket.IO
- **Decline**: `updateDoc({ status: "declined" })`

---

## 🔌 How Everything Connects

**1. Authentication:** User clicks Google login → Firebase OAuth → AuthContext updates `currentUser` → syncs to Firestore `users/` → UI updates

**2. Matchmaking:** 
- Auto: Socket.IO connects → `assignRoom()` → join waiting room or create new → `game-ready` when both players join
- Invite: Send to Firestore → recipient's `onSnapshot()` detects → accept → `join-invite-room` event → both join same room

**3. Chess Move (No Capture):** Click square → highlight valid moves → click destination → emit `make-move` → server validates → broadcast `update-board` → clients re-render

**4. Capture (Blackjack Trigger):** Emit `make-move` → server detects `captured` flag → execute temporarily → phase = BLACKJACK → create deck, deal hands → emit `start-blackjack` → clients show BlackjackTable, highlight threatened square

**5. Blackjack Resolution:** 
- Hit: emit `blackjack-hit` → server adds card → broadcast `blackjack-update`
- Stand: emit `blackjack-stand` → dealer draws (700ms/card) until 17+ → calculate outcome (ATTACKER/DEFENDER/PUSH)
- `resolveBlackjack()`: Attacker wins = capture stands | Defender wins = undo move/reverse capture | Push = undo move
- Emit `update-board` → clients delay 2s → update FEN → phase = CHESS

**6. Timers:** Server runs `setInterval(500ms)` → subtract time from active player → broadcast `timer-update` → clients display MM:SS → timeout = game over

---

## 🎯 Technical Stack Rationale

- **Socket.IO**: Real-time bidirectional events, auto-reconnect, room broadcasting
- **Firebase**: Google OAuth (zero backend), real-time DB (`onSnapshot`), serverless
- **Chess.js**: Legal move validation, FEN support, verbose metadata, game state
- **React + Vite**: Fast HMR, modern hooks, optimized builds, TypeScript-ready

## 📊 Data Flow

**Client State:** Socket.IO (game state) + Firebase Auth (user) + Firestore (invites) + Local (UI interactions)

**Server State:** RoomManager (all rooms Map) + Room model (Chess.js instance, players, timers) + In-memory (no persistence)

**Flow:** User Action → React Handler → emit/write → Server/Firestore → broadcast/update → Listener → setState → Re-render

---

## 🚀 Setup & Run

### Prerequisites
- Node.js v14+
- Firebase project with Auth & Firestore enabled

### Installation
```bash
# Install server dependencies
npm install

# Install client dependencies
cd my-react-app
npm install

# Configure environment
# Create my-react-app/.env with:
# VITE_FIREBASE_API_KEY=your_key
# VITE_FIREBASE_AUTH_DOMAIN=your_domain
# VITE_FIREBASE_PROJECT_ID=your_project
# VITE_FIREBASE_STORAGE_BUCKET=your_bucket
# VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
# VITE_FIREBASE_APP_ID=your_app_id
# VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Build React app
npm run build

# Start server
cd ..
npm start
```

Open http://localhost:3000 in two browser windows to test multiplayer.

### Development Mode
```bash
# Terminal 1: React dev server
cd my-react-app
npm run dev

# Terminal 2: Node server
cd ..
npm start
```

---

## 🐛 Troubleshooting

**Socket.IO Connection Failed:**
- Check server is running (port 3000 default)
- Verify CORS settings in [src/server/index.js](src/server/index.js)

**Firebase Auth Not Working:**
- Verify `.env` file has all keys
- Check Firebase console: Authentication → Sign-in method → Google enabled
- Ensure authorized domains include localhost

**Moves Not Registering:**
- Check browser console for Socket.IO errors
- Verify room assignment completed (`currentRoomId` state)
- Ensure it's player's turn (`currentTurn === playerColor[0]`)

**Timer Desync:**
- Timers are server-authoritative
- Check server console for timer tick logs

---

## 📝 Future Enhancements

- Persistent game saves (resume after disconnect)
- Spectator mode
- Game replay system
- ELO rating system
- In-game chat
- Custom time controls
- Move history display
- Sound effects

---

<img width="1024" height="559" alt="Chess21 gameplay screenshot" src="https://github.com/user-attachments/assets/ba1d6392-306b-489a-a810-b6e76b4a8cb6" />
