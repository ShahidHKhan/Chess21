const Room = require("../models/Room");

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.waitingRooms = [];
  }

  createRoomId(socketId) {
    return `room-${socketId}-${Date.now()}`;
  }

  createRoom(socketId) {
    const roomId = this.createRoomId(socketId);
    const room = new Room(roomId, socketId);
    this.rooms.set(roomId, room);
    this.waitingRooms.push(roomId);
    return room;
  }

  joinWaitingRoom(socketId) {
    if (this.waitingRooms.length === 0) {
      return null;
    }
    const roomId = this.waitingRooms.shift();
    const room = this.rooms.get(roomId);
    if (!room) {
      return this.joinWaitingRoom(socketId);
    }
    room.players[socketId] = "black";
    return room;
  }

  assignRoom(socketId) {
    if (this.waitingRooms.length === 0) {
      const room = this.createRoom(socketId);
      return { room, color: "white", started: false };
    }

    const room = this.joinWaitingRoom(socketId);
    if (!room) {
      const fallback = this.createRoom(socketId);
      return { room: fallback, color: "white", started: false };
    }

    return { room, color: "black", started: true };
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  removePlayer(socketId) {
    for (const [roomId, room] of this.rooms.entries()) {
      if (!room.players[socketId]) {
        continue;
      }
      delete room.players[socketId];
      const waitingIndex = this.waitingRooms.indexOf(roomId);
      if (waitingIndex !== -1) {
        this.waitingRooms.splice(waitingIndex, 1);
      }
      this.rooms.delete(roomId);
      return roomId;
    }
    return null;
  }
}

module.exports = RoomManager;
