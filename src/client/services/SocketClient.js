const { EVENTS } = window.GameConstants || {};

export class SocketClient {
  constructor() {
    this.socket = io();
  }

  on(event, callback) {
    this.socket.on(event, callback);
  }

  emit(event, payload) {
    this.socket.emit(event, payload);
  }

  onConnect(callback) {
    this.socket.on("connect", callback);
  }

  onRoomAssigned(callback) {
    this.on(EVENTS.ROOM_ASSIGNED, callback);
  }

  onGameReady(callback) {
    this.on(EVENTS.GAME_READY, callback);
  }

  onMoveMade(callback) {
    this.on(EVENTS.MOVE_MADE, callback);
  }

  onMoveRejected(callback) {
    this.on(EVENTS.MOVE_REJECTED, callback);
  }

  onPlayerLeft(callback) {
    this.on(EVENTS.PLAYER_LEFT, callback);
  }

  onStartBlackjack(callback) {
    this.on(EVENTS.START_BLACKJACK, callback);
  }

  onBlackjackUpdate(callback) {
    this.on(EVENTS.BLACKJACK_UPDATE, callback);
  }

  onUpdateBoard(callback) {
    this.on(EVENTS.UPDATE_BOARD, callback);
  }

  onTimerUpdate(callback) {
    this.on(EVENTS.TIMER_UPDATE, callback);
  }

  emitMove(payload) {
    this.emit(EVENTS.MAKE_MOVE, payload);
  }

  emitBlackjackHit(payload) {
    this.emit(EVENTS.BLACKJACK_HIT, payload);
  }

  emitBlackjackStand(payload) {
    this.emit(EVENTS.BLACKJACK_STAND, payload);
  }

  emitTimerToggle(payload) {
    this.emit(EVENTS.TIMER_TOGGLE, payload);
  }
}
