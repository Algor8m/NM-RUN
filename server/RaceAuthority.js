export class RaceAuthority {
  constructor(roomCode, totalCheckpoints = 12, pickupDefs = []) {
    this.roomCode = roomCode;
    this.totalCheckpoints = totalCheckpoints;
    this.raceState = "idle"; // countdown, racing, finished
    this.startTime = 0;
    this.racers = new Map();
    this.finishOrder = [];
    this.rankings = [];
    
    // pickups map: id -> { active, respawnAt, type }
    this.pickups = new Map();
    for (const p of pickupDefs) {
      this.pickups.set(p.id, {
        id: p.id,
        type: p.type || "boost",
        active: true,
        respawnAt: 0,
        respawnSeconds: p.respawnSeconds || 10
      });
    }
  }

  initializeRacers(playersList) {
    this.racers.clear();
    this.finishOrder = [];
    this.rankings = [];

    for (const p of playersList) {
      this.racers.set(p.id, {
        id: p.id,
        name: p.name,
        slot: p.slot,
        lastCheckpointIndex: -1,
        progress: 0,
        finished: false,
        finishTime: null,
        disqualified: false,
        lastValidPacketTime: Date.now(),
        lastPosition: { x: 0, y: 0, z: 0 }
      });
    }
  }

  startCountdown(io, onComplete) {
    this.raceState = "countdown";
    let secondsLeft = 3;

    io.to(this.roomCode).emit("race:countdown", { count: secondsLeft });

    const interval = setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0) {
        io.to(this.roomCode).emit("race:countdown", { count: secondsLeft });
      } else {
        clearInterval(interval);
        this.raceState = "racing";
        this.startTime = Date.now();
        io.to(this.roomCode).emit("race:start", {
          startTime: this.startTime,
          totalCheckpoints: this.totalCheckpoints
        });
        if (onComplete) onComplete();
      }
    }, 1000);
  }

  validateAndUpdatePlayer(socketId, payload) {
    if (this.raceState !== "racing") return null;
    const racer = this.racers.get(socketId);
    if (!racer || racer.finished) return null;

    const now = Date.now();
    const dt = Math.max(0.001, (now - racer.lastValidPacketTime) / 1000);

    // validate numeric integrity
    const pos = payload.position;
    if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number" || typeof pos.z !== "number") {
      return null;
    }
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
      return null;
    }

    // calculate distance moved to reject impossible teleportation (> 80 units/sec)
    const dx = pos.x - racer.lastPosition.x;
    const dy = pos.y - racer.lastPosition.y;
    const dz = pos.z - racer.lastPosition.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const speed = dist / dt;

    if (racer.lastCheckpointIndex >= 0 && speed > 85) {
      // reject impossible jump
      return null;
    }

    racer.lastPosition = { x: pos.x, y: pos.y, z: pos.z };
    racer.lastValidPacketTime = now;

    // authoritative checkpoint validation
    const claimedCp = Number(payload.lastCheckpointIndex);
    if (Number.isInteger(claimedCp)) {
      // allow next sequential checkpoint only
      if (claimedCp === racer.lastCheckpointIndex + 1) {
        racer.lastCheckpointIndex = claimedCp;

        // check if finish gate reached
        if (racer.lastCheckpointIndex === this.totalCheckpoints - 1) {
          this.recordFinish(socketId);
        }
      }
    }

    const claimedProgress = Number(payload.progress);
    if (Number.isFinite(claimedProgress)) {
      // keep monotonic progress
      racer.progress = Math.max(racer.progress, claimedProgress);
    }

    return {
      peerId: socketId,
      position: racer.lastPosition,
      rotation: Number.isFinite(payload.rotation) ? payload.rotation : 0,
      speed: Number.isFinite(payload.speed) ? payload.speed : 0,
      boosting: Boolean(payload.boosting),
      shieldActive: Boolean(payload.shieldActive),
      endurance: Number.isFinite(payload.endurance) ? payload.endurance : 100,
      boost: Number.isFinite(payload.boost) ? payload.boost : 0,
      lastCheckpointIndex: racer.lastCheckpointIndex,
      progress: racer.progress
    };
  }

  recordFinish(socketId) {
    const racer = this.racers.get(socketId);
    if (!racer || racer.finished) return;

    racer.finished = true;
    racer.finishTime = ((Date.now() - this.startTime) / 1000).toFixed(2);
    this.finishOrder.push({
      id: racer.id,
      name: racer.name,
      rank: this.finishOrder.length + 1,
      time: racer.finishTime
    });

    if (this.finishOrder.length === this.racers.size) {
      this.raceState = "finished";
    }
  }

  collectPickup(socketId, pickupId) {
    const pickup = this.pickups.get(pickupId);
    if (!pickup || !pickup.active) {
      return { success: false };
    }

    pickup.active = false;
    pickup.respawnAt = Date.now() + pickup.respawnSeconds * 1000;

    return {
      success: true,
      pickupId,
      type: pickup.type,
      respawnSeconds: pickup.respawnSeconds
    };
  }

  updatePickups(now = Date.now()) {
    const respawned = [];
    for (const pickup of this.pickups.values()) {
      if (!pickup.active && now >= pickup.respawnAt) {
        pickup.active = true;
        respawned.push(pickup.id);
      }
    }
    return respawned;
  }

  computeRankings() {
    const list = [...this.racers.values()].filter(r => !r.disqualified);

    list.sort((a, b) => {
      if (a.finished && b.finished) {
        return parseFloat(a.finishTime) - parseFloat(b.finishTime);
      }
      if (a.finished) return -1;
      if (b.finished) return 1;

      if (b.lastCheckpointIndex !== a.lastCheckpointIndex) {
        return b.lastCheckpointIndex - a.lastCheckpointIndex;
      }
      return b.progress - a.progress;
    });

    this.rankings = list.map((r, index) => ({
      id: r.id,
      name: r.name,
      rank: index + 1,
      checkpoint: r.lastCheckpointIndex,
      progress: r.progress,
      finished: r.finished,
      finishTime: r.finishTime
    }));

    return this.rankings;
  }
}