export class LobbyManager {
  constructor(options = {}) {
    this.minPlayers = options.minPlayers || 2;
    this.maxPlayers = options.maxPlayers || 4;
    this.rooms = new Map();
    this.defaultAvatars = ["Ritam", "Tanishi", "Yash", "Anjali"];
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

  createRoom(hostSocketId, playerName, preferredAvatar = null) {
    const cleanName = String(playerName || "Player").trim().slice(0, 16) || "Racer";
    const roomCode = this.generateRoomCode();

    const initialAvatar = this.defaultAvatars.includes(preferredAvatar)
      ? preferredAvatar
      : this.defaultAvatars[0];

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
      character: initialAvatar,
      isHost: true,
      isReady: false,
      slot: 0,
      connected: true
    });

    this.rooms.set(roomCode, room);
    return { roomCode, room };
  }

  joinRoom(roomCode, socketId, playerName, preferredAvatar = null) {
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

    // Fix 7: Reject duplicate usernames in the room (case-insensitive)
    const isNameTaken = [...room.players.values()].some(
      p => p.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (isNameTaken) {
      return { error: "Username already taken in this room. Choose another name." };
    }

    // Assign first available slot (0..3)
    const occupiedSlots = new Set([...room.players.values()].map(p => p.slot));
    let slot = 0;
    while (occupiedSlots.has(slot) && slot < this.maxPlayers) {
      slot++;
    }

    // Fix 7: Enforce unique avatars among connected players
    const takenAvatars = new Set([...room.players.values()].map(p => p.character));
    let assignedAvatar = preferredAvatar;
    if (!assignedAvatar || takenAvatars.has(assignedAvatar) || !this.defaultAvatars.includes(assignedAvatar)) {
      assignedAvatar = this.defaultAvatars.find(a => !takenAvatars.has(a)) || this.defaultAvatars[slot % this.defaultAvatars.length];
    }

    room.players.set(socketId, {
      id: socketId,
      name: cleanName,
      character: assignedAvatar,
      isHost: false,
      isReady: false,
      slot,
      connected: true
    });

    return { roomCode: code, room };
  }

  setCharacter(socketId, characterName) {
    const room = this.getRoomBySocketId(socketId);
    if (!room || room.status !== "lobby") return { error: "cannot change avatar right now" };

    const player = room.players.get(socketId);
    if (!player) return { error: "player not found" };

    if (!this.defaultAvatars.includes(characterName)) {
      return { error: "invalid character name" };
    }

    // Check if character is currently selected by another peer in the same room
    const isTaken = [...room.players.values()].some(
      p => p.id !== socketId && p.character === characterName
    );
    if (isTaken) {
      return { error: "Avatar already selected by another player." };
    }

    player.character = characterName;
    return { success: true, room };
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

    // Assign new host if the host left
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

  getSanitizedLobbyState(roomCode, recipientSocketId = null) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    const playersList = [...room.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      character: p.character || "Ritam",
      isHost: p.isHost,
      isReady: p.isReady,
      slot: p.slot
    }));

    const me = recipientSocketId ? room.players.get(recipientSocketId) : null;
    const takenCharacters = playersList.map(p => p.character);

    return {
      code: room.code,
      roomCode: room.code,
      hostId: room.hostId,
      status: room.status,
      playerCount: room.players.size,
      players: playersList,
      members: playersList,
      takenCharacters,
      you: me ? {
        id: me.id,
        name: me.name,
        character: me.character || "Ritam",
        isHost: me.isHost,
        isReady: me.isReady,
        slot: me.slot
      } : null
    };
  }
}