export class LobbyManager {
  constructor(options = {}) {
    this.minPlayers = options.minPlayers || 2;
    this.maxPlayers = options.maxPlayers || 4;
    this.rooms = new Map();
  }

  generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    do {
      code = "";
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostSocketId, playerName) {
    const cleanName = String(playerName || "Player").trim().slice(0, 16) || "Racer";
    const roomCode = this.generateRoomCode();

    const room = {
      code: roomCode,
      hostId: hostSocketId,
      status: "lobby", // lobby, countdown, racing, finished
      players: new Map(),
      createdAt: Date.now()
    };

    room.players.set(hostSocketId, {
      id: hostSocketId,
      name: cleanName,
      isHost: true,
      isReady: false,
      slot: 0,
      connected: true
    });

    this.rooms.set(roomCode, room);
    return { roomCode, room };
  }

  joinRoom(roomCode, socketId, playerName) {
    const code = String(roomCode || "").toUpperCase().trim();
    const cleanName = String(playerName || "Player").trim().slice(0, 16) || "Racer";

    const room = this.rooms.get(code);
    if (!room) {
      return { error: "room not found" };
    }

    if (room.status !== "lobby") {
      return { error: "race already in progress" };
    }

    if (room.players.size >= this.maxPlayers) {
      return { error: "room is full" };
    }

    // find first free slot 0..3
    const occupiedSlots = new Set([...room.players.values()].map(p => p.slot));
    let slot = 0;
    while (occupiedSlots.has(slot) && slot < this.maxPlayers) {
      slot++;
    }

    room.players.set(socketId, {
      id: socketId,
      name: cleanName,
      isHost: false,
      isReady: false,
      slot,
      connected: true
    });

    return { roomCode: code, room };
  }

  setReady(socketId, isReady) {
    const room = this.getRoomBySocketId(socketId);
    if (!room || room.status !== "lobby") return null;

    const player = room.players.get(socketId);
    if (!player) return null;

    player.isReady = Boolean(isReady);
    return room;
  }

  canStartRace(roomCode, allowSolo = false) {
    const room = this.rooms.get(roomCode);
    if (!room || room.status !== "lobby") return false;

    const requiredMin = allowSolo ? 1 : this.minPlayers;
    if (room.players.size < requiredMin) return false;

    for (const player of room.players.values()) {
      if (!player.isReady) return false;
    }
    return true;
  }

  removePlayer(socketId) {
    const room = this.getRoomBySocketId(socketId);
    if (!room) return null;

    room.players.delete(socketId);

    if (room.players.size === 0) {
      this.rooms.delete(room.code);
      return { roomCode: room.code, roomDestroyed: true };
    }

    // assign new host if host left
    if (room.hostId === socketId) {
      const nextHost = room.players.values().next().value;
      room.hostId = nextHost.id;
      nextHost.isHost = true;
    }

    return { roomCode: room.code, roomDestroyed: false, room };
  }

  getRoomBySocketId(socketId) {
    for (const room of this.rooms.values()) {
      if (room.players.has(socketId)) {
        return room;
      }
    }
    return null;
  }

  getSanitizedLobbyState(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    return {
      roomCode: room.code,
      hostId: room.hostId,
      status: room.status,
      playerCount: room.players.size,
      players: [...room.players.values()].map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isReady: p.isReady,
        slot: p.slot
      }))
    };
  }
}