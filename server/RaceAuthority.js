export class RaceAuthority {
  constructor(roomCode, totalCheckpoints = 12, pickupDefs = [], totalLaps = 2) {
    this.roomCode = roomCode;
    this.totalCheckpoints = totalCheckpoints;
    this.totalLaps = totalLaps;
    this.raceState = "idle"; // countdown, racing, finished
    this.startTime = 0;
    this.racers = new Map();
    this.finishOrder = [];
    this.rankings = [];
    this.io = null;
    this.dnfTimeout = null;
    
    // pickups map: id -> { active, respawnAt, type, respawnSeconds }
    this.pickups = new Map();
    for (const p of pickupDefs) {
      this.pickups.set(p.id, {
        id: p.id,
        type: p.type || (p.id?.includes('shield') ? 'shield' : 'boost'),
        active: true,
        respawnAt: 0,
        respawnSeconds: p.respawnSeconds || 8
      });
    }
  }

  initializeRacers(playersList) {
    this.racers.clear();
    this.finishOrder = [];
    this.rankings = [];
    if (this.dnfTimeout) {
      clearTimeout(this.dnfTimeout);
      this.dnfTimeout = null;
    }

    for (const p of playersList) {
      this.racers.set(p.id, {
        id: p.id,
        name: p.name || "Racer",
        slot: p.slot || 0,
        character: p.character || "Ritam",
        lap: 1,
        lastCheckpointIndex: -1,
        progress: 0,
        finished: false,
        finishTime: null,
        disqualified: false,
        lastValidPacketTime: Date.now(),
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        speed: 0
      });
    }
  }

  startCountdown(io, onComplete) {
    this.io = io;
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
          totalCheckpoints: this.totalCheckpoints,
          totalLaps: this.totalLaps
        });
        if (onComplete) onComplete();
      }
    }, 1000);
  }

  validateAndUpdatePlayer(playerId, payload) {
    const racer = this.racers.get(playerId);
    if (!racer) return null;

    // Validate and update 3D position
    if (payload?.position && Number.isFinite(Number(payload.position.x))) {
      racer.position = {
        x: Number(payload.position.x),
        y: Number(payload.position.y),
        z: Number(payload.position.z)
      };
    }

    // Validate rotation (yaw radians)
    if (Number.isFinite(Number(payload?.rotation))) {
      racer.rotation = Number(payload.rotation);
    } else if (Number.isFinite(Number(payload?.yaw))) {
      racer.rotation = Number(payload.yaw);
    }

    // Validate speed
    if (Number.isFinite(Number(payload?.speed))) {
      racer.speed = Number(payload.speed);
    }

    // Update progress, laps and checkpoints
    if (Number.isFinite(Number(payload?.progress))) {
      racer.progress = Number(payload.progress);
    }
    if (Number.isInteger(payload?.lap)) {
      racer.lap = payload.lap;
    }
    if (Number.isInteger(payload?.lastCheckpointIndex)) {
      racer.lastCheckpointIndex = payload.lastCheckpointIndex;
    }

    // Check race finish condition across all laps
    const isFinished = Boolean(payload?.finished) ||
      (racer.lap >= this.totalLaps && racer.lastCheckpointIndex >= this.totalCheckpoints - 1);

    if (isFinished && !racer.finished) {
      this.recordFinish(playerId);
    }

    // Update chosen character if transmitted
    if (payload?.character) {
      racer.character = String(payload.character).slice(0, 20);
    }

    racer.lastValidPacketTime = Date.now();

    return {
      playerId,
      peerId: playerId,
      name: String(payload?.name || racer.name || "Racer").slice(0, 20),
      character: racer.character || "Ritam",
      position: racer.position,
      rotation: racer.rotation,
      speed: racer.speed,
      boosting: Boolean(payload?.boosting),
      shieldActive: Boolean(payload?.shieldActive),
      lap: racer.lap,
      progress: racer.progress,
      lastCheckpointIndex: racer.lastCheckpointIndex,
      finished: racer.finished
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

    // Notify room of first finisher and start a 30s DNF countdown for others
    if (this.finishOrder.length === 1 && this.racers.size > 1 && this.io) {
      this.io.to(this.roomCode).emit("race:first_finisher", {
        winnerName: racer.name,
        timeoutSeconds: 30
      });

      this.dnfTimeout = setTimeout(() => {
        for (const [id, r] of this.racers) {
          if (!r.finished) {
            r.finished = true;
            r.finishTime = "DNF";
            this.finishOrder.push({
              id: r.id,
              name: r.name,
              rank: this.finishOrder.length + 1,
              time: "DNF"
            });
          }
        }
        this.raceState = "finished";
      }, 30000);
    }

    if (this.finishOrder.length === this.racers.size) {
      if (this.dnfTimeout) {
        clearTimeout(this.dnfTimeout);
        this.dnfTimeout = null;
      }
      this.raceState = "finished";
    }
  }

  collectPickup(socketId, pickupId) {
    if (!pickupId) return { success: false };

    let pickup = this.pickups.get(pickupId);
    if (!pickup) {
      pickup = {
        id: pickupId,
        type: pickupId.includes('shield') ? 'shield' : 'boost',
        active: true,
        respawnAt: 0,
        respawnSeconds: 8
      };
      this.pickups.set(pickupId, pickup);
    }

    if (!pickup.active) {
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

      // Real-time ranking: higher lap is ahead
      const lapA = a.lap || 1;
      const lapB = b.lap || 1;
      if (lapB !== lapA) {
        return lapB - lapA;
      }

      if (b.lastCheckpointIndex !== a.lastCheckpointIndex) {
        return b.lastCheckpointIndex - a.lastCheckpointIndex;
      }
      return (b.progress || 0) - (a.progress || 0);
    });

    this.rankings = list.map((r, index) => ({
      id: r.id,
      name: r.name,
      rank: index + 1,
      lap: r.lap || 1,
      checkpoint: r.lastCheckpointIndex,
      progress: r.progress,
      finished: r.finished,
      finishTime: r.finishTime
    }));

    return this.rankings;
  }
}
