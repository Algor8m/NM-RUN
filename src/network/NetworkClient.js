export class NetworkClient {
  constructor() {
    this.socket = null;
    this.roomCode = null;
    this.playerId = null;
    this.isHost = false;
    this.eventListeners = new Map();
  }

  connect(serverUrl = "http://localhost:3000") {
    return new Promise((resolve, reject) => {
      if (typeof window.io === "undefined") {
        return reject(new Error("Socket.IO client library not found on window"));
      }

      this.socket = window.io(serverUrl, {
        transports: ["websocket", "polling"],
        reconnectionAttempts: 4,
        timeout: 5000
      });

      this.socket.on("connect", () => {
        this.playerId = this.socket.id;
        this._dispatch("connected", { id: this.playerId });
        resolve(this.playerId);
      });

      this.socket.on("connect_error", (err) => {
        this._dispatch("error", { message: "Connection error: " + err.message });
        reject(err);
      });

      this._registerCoreEvents();
    });
  }

  _registerCoreEvents() {
    const relayEvents = [
      "lobby:update",
      "race:countdown",
      "race:start",
      "player:state",
      "pickup:state",
      "race:ranking",
      "race:finish",
      "race:results",
      "server:error"
    ];

    for (const ev of relayEvents) {
      this.socket.on(ev, (data) => {
        if (ev === "lobby:update") {
          this.roomCode = data.roomCode;
          const me = data.players.find(p => p.id === this.socket.id);
          this.isHost = me ? me.isHost : false;
        }
        this._dispatch(ev, data);
      });
    }
  }

  createRoom(playerName) {
    if (!this.socket) return;
    this.socket.emit("room:create", { playerName });
  }

  joinRoom(roomCode, playerName) {
    if (!this.socket) return;
    this.socket.emit("room:join", { roomCode, playerName });
  }

  setReady(ready = true) {
    if (!this.socket) return;
    this.socket.emit("lobby:ready", { ready });
  }

  requestStartRace(allowSolo = false) {
    if (!this.socket) return;
    this.socket.emit("race:start_request", { allowSolo });
  }

  sendPlayerState(state) {
    if (!this.socket) return;
    this.socket.emit("player:state", state);
  }

  collectPickup(pickupId) {
    if (!this.socket) return;
    this.socket.emit("pickup:collect", { pickupId });
  }

  requestRematch() {
    if (!this.socket) return;
    this.socket.emit("race:rematch");
  }

  leaveRoom() {
    if (!this.socket) return;
    this.socket.emit("room:leave");
    this.roomCode = null;
    this.isHost = false;
  }

  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.eventListeners.has(event)) return;
    const filtered = this.eventListeners.get(event).filter(fn => fn !== callback);
    this.eventListeners.set(event, filtered);
  }

  _dispatch(event, data) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const fn of listeners) {
        fn(data);
      }
    }
  }
}