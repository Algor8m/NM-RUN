import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { LobbyManager } from "./LobbyManager.js";
import { RaceAuthority } from "./RaceAuthority.js";

dotenv.config();

const port = process.env.PORT || 3000;
const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(",")
  : ["http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:5173", "http://localhost:3000"];

const app = express();
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// minimal health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", game: "NM Run Server", timestamp: Date.now() });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const lobbyManager = new LobbyManager({ minPlayers: 2, maxPlayers: 4 });
const raceAuthorities = new Map(); // roomCode -> RaceAuthority instance

// default deterministic pickups
const defaultPickups = Array.from({ length: 16 }, (_, i) => ({
  id: `pickup_${i}`,
  type: i % 4 === 0 ? "shield" : "boost",
  respawnSeconds: 10
}));

// Helper to broadcast personalized lobby updates to every player in a room
function broadcastLobbyUpdate(roomCode) {
  const room = lobbyManager.rooms.get(roomCode);
  if (!room) return;

  for (const [socketId] of room.players) {
    const state = lobbyManager.getSanitizedLobbyState(roomCode, socketId);
    io.to(socketId).emit("lobby:update", state);
  }
}

io.on("connection", (socket) => {
  let currentRoomCode = null;
  let packetCounter = 0;
  let lastPacketReset = Date.now();

  socket.on("room:create", (payload) => {
    try {
      const playerName = payload?.playerName || payload?.name || "Racer";
      const { roomCode, room } = lobbyManager.createRoom(socket.id, playerName);
      currentRoomCode = roomCode;
      socket.join(roomCode);

      socket.emit("lobby:update", lobbyManager.getSanitizedLobbyState(roomCode, socket.id));
    } catch (err) {
      socket.emit("server:error", { message: "failed to create room" });
    }
  });

  socket.on("room:join", (payload) => {
    try {
      const roomCode = String(payload?.roomCode || payload?.code || "").toUpperCase().trim();
      const playerName = payload?.playerName || payload?.name || "Racer";

      const result = lobbyManager.joinRoom(roomCode, socket.id, playerName);
      if (result.error) {
        socket.emit("server:error", { message: result.error });
        return;
      }

      currentRoomCode = roomCode;
      socket.join(roomCode);

      broadcastLobbyUpdate(roomCode);
    } catch (err) {
      socket.emit("server:error", { message: "failed to join room" });
    }
  });

  socket.on("lobby:ready", (payload) => {
    if (!currentRoomCode) return;
    const isReady = Boolean(payload?.ready ?? payload?.isReady);
    const room = lobbyManager.setReady(socket.id, isReady);
    if (room) {
      broadcastLobbyUpdate(currentRoomCode);
    }
  });

  socket.on("race:start_request", (payload) => {
    if (!currentRoomCode) return;
    const room = lobbyManager.rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id) {
      socket.emit("server:error", { message: "only room host can start race" });
      return;
    }

    const allowSolo = Boolean(payload?.allowSolo);
    if (!lobbyManager.canStartRace(currentRoomCode, allowSolo)) {
      socket.emit("server:error", { message: "all players must be ready, min 2 players required" });
      return;
    }

    room.status = "countdown";
    broadcastLobbyUpdate(currentRoomCode);

    const authority = new RaceAuthority(currentRoomCode, 12, defaultPickups);
    authority.initializeRacers([...room.players.values()]);
    raceAuthorities.set(currentRoomCode, authority);

    authority.startCountdown(io, () => {
      room.status = "racing";
    });
  });

  socket.on("player:state", (payload) => {
    if (!currentRoomCode) return;
    const authority = raceAuthorities.get(currentRoomCode);
    if (!authority) return;

    // rate limit: max 40 packets per sec
    const now = Date.now();
    if (now - lastPacketReset > 1000) {
      packetCounter = 0;
      lastPacketReset = now;
    }
    packetCounter++;
    if (packetCounter > 40) return;

    const sanitized = authority.validateAndUpdatePlayer(socket.id, payload);
    if (sanitized) {
      // broadcast sanitized state to other racers in room
      socket.to(currentRoomCode).emit("player:state", sanitized);
    }
  });

  socket.on("pickup:collect", (payload) => {
    if (!currentRoomCode) return;
    const authority = raceAuthorities.get(currentRoomCode);
    if (!authority) return;

    const pickupId = payload?.pickupId;
    const res = authority.collectPickup(socket.id, pickupId);
    if (res.success) {
      io.to(currentRoomCode).emit("pickup:state", {
        pickupId: res.pickupId,
        active: false,
        collectorId: socket.id,
        type: res.type
      });
    }
  });

  socket.on("race:rematch", () => {
    if (!currentRoomCode) return;
    const room = lobbyManager.rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id) {
      socket.emit("server:error", { message: "only host can initiate rematch" });
      return;
    }

    room.status = "lobby";
    for (const player of room.players.values()) {
      player.isReady = false;
    }
    raceAuthorities.delete(currentRoomCode);

    broadcastLobbyUpdate(currentRoomCode);
  });

  socket.on("room:leave", () => {
    handleDisconnect(socket);
  });

  socket.on("disconnect", () => {
    handleDisconnect(socket);
  });

  function handleDisconnect(s) {
    if (!currentRoomCode) return;
    const result = lobbyManager.removePlayer(s.id);
    if (!result) return;

    s.leave(currentRoomCode);

    if (result.roomDestroyed) {
      raceAuthorities.delete(currentRoomCode);
    } else {
      broadcastLobbyUpdate(currentRoomCode);
      const authority = raceAuthorities.get(currentRoomCode);
      if (authority) {
        authority.racers.delete(s.id);
      }
    }
    currentRoomCode = null;
  }
});

// 25 hz authority loop (rankings, pickup respawn, finish detection)
setInterval(() => {
  for (const [roomCode, authority] of raceAuthorities.entries()) {
    if (authority.raceState === "racing") {
      const rankings = authority.computeRankings();
      io.to(roomCode).emit("race:ranking", { rankings });

      const respawned = authority.updatePickups();
      for (const pId of respawned) {
        io.to(roomCode).emit("pickup:state", { pickupId: pId, active: true });
      }

      if (authority.raceState === "finished") {
        io.to(roomCode).emit("race:results", {
          results: authority.finishOrder
        });
      }
    }
  }
}, 40);

httpServer.listen(port, () => {
  console.log(`[ran-ok] NM Run server running on port ${port}`);
});