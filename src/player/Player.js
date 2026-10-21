// Person 2 public player entity. Rendering + gameplay API; networking stays in Person 3.
import * as THREE from "three";
import { GAME_CONFIG } from "../shared/config.js";
import { PlayerController, PLAYER_TUNING } from "./PlayerController.js";

export const PLAYER_CHARACTERS = Object.freeze([
  { name: "Tanishi", color: 0xd9468d, accent: 0xf6c8dc, hair: 0x241a22, style: "glasses" },
  { name: "Yash", color: 0xc28a52, accent: 0x253c5a, hair: 0x201b18, style: "jacket" },
  { name: "Anjali", color: 0x159b91, accent: 0xe8c9a2, hair: 0x241a22, style: "longhair" },
  { name: "Ritam", color: 0x24272e, accent: 0xd8c69d, hair: 0x241a22, style: "dhoti" }
]);

const NO_INPUT = Object.freeze({
  forward: false,
  backward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
  dodge: false,
  boost: false
});

let shared = null;
function getShared() {
  if (!shared) {
    shared = {
      legGeo: new THREE.BoxGeometry(0.16, 0.5, 0.16),
      torsoGeo: new THREE.BoxGeometry(0.5, 0.6, 0.3),
      headGeo: new THREE.IcosahedronGeometry(0.22, 1),
      hairGeo: new THREE.SphereGeometry(0.235, 8, 6),
      armGeo: new THREE.BoxGeometry(0.13, 0.48, 0.14),
      shoeGeo: new THREE.BoxGeometry(0.19, 0.1, 0.28),
      glassesGeo: new THREE.BoxGeometry(0.34, 0.055, 0.035),
      packGeo: new THREE.BoxGeometry(0.36, 0.4, 0.18),
      headMat: new THREE.MeshStandardMaterial({ color: 0xf1c9a5, flatShading: true }),
      skinMat: new THREE.MeshStandardMaterial({ color: 0xc98f6d, flatShading: true })
    };
  }
  return shared;
}

function createNameSprite(name) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "rgba(0,0,0,.68)";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(name).slice(0, 24), 128, 32, 240);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  );
  sprite.scale.set(1.65, 0.41, 1);
  sprite.position.set(0, 2.02, 0);
  return sprite;
}

// BUG 1 FIX: Match against valid character presets first, fallback safely
function profileFor(characterName, color) {
  const match = PLAYER_CHARACTERS.find(c => c.name.toLowerCase() === String(characterName || "").trim().toLowerCase());
  if (match) return match;
  return {
    name: characterName || "Ritam",
    color: color ?? 0x24272e,
    accent: 0xd8c69d,
    hair: 0x241a22,
    style: "dhoti"
  };
}

export class Player {
  constructor({ peerId, name = "", color = undefined, character = undefined, isLocal = false } = {}) {
    this.peerId = peerId ?? "unknown";
    this.name = name || "Racer";
    this.isLocal = !!isLocal;
    this.controlsEnabled = false;
    this.controller = new PlayerController();
    this._listeners = new Map();
    this._disposed = false;
    this.mesh = new THREE.Group();
    this.mesh.name = `Player_${this.peerId}`;
    this._nameSprite = null;
    this._bodyMaterial = null;
    this._accentMaterial = null;
    this._extraMaterials = [];
    this._limbs = [];
    this._walkTime = 0;

    // Use requested character, or default to Ritam
    this.selectedCharacter = character || "Ritam";
    this.setCharacter(this.selectedCharacter, color);
    this._syncMesh();
  }

  _clearCharacter() {
    for (const child of [...this.mesh.children]) {
      this.mesh.remove(child);
      if (child.isSprite && child.material) {
        child.material.map?.dispose();
        child.material.dispose();
      }
    }
    this._bodyMaterial?.dispose();
    this._accentMaterial?.dispose();
    for (const m of this._extraMaterials) m.dispose();
    this._extraMaterials = [];
    this._limbs = [];
  }

  setCharacter(characterName, color) {
    this._clearCharacter();
    this.selectedCharacter = characterName || "Ritam";
    this.character = profileFor(this.selectedCharacter, color);
    const p = this.character;
    const s = getShared();
    const baseColor = color ?? p.color;

    this._bodyMaterial = new THREE.MeshStandardMaterial({ color: baseColor, flatShading: true });
    this._accentMaterial = new THREE.MeshStandardMaterial({ color: p.accent, flatShading: true });
    const hairMat = new THREE.MeshStandardMaterial({ color: p.hair, flatShading: true });
    this._extraMaterials.push(hairMat);

    const add = (geo, mat, x, y, z, limb = false) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      this.mesh.add(m);
      if (limb) this._limbs.push({ mesh: m, baseY: y, phase: x < 0 ? 0 : Math.PI });
      return m;
    };

    add(s.legGeo, this._accentMaterial, -0.12, 0.25, 0, true);
    add(s.legGeo, this._accentMaterial, 0.12, 0.25, 0, true);
    add(s.shoeGeo, this._bodyMaterial, -0.12, 0.055, -0.055);
    add(s.shoeGeo, this._bodyMaterial, 0.12, 0.055, -0.055);
    add(s.torsoGeo, this._bodyMaterial, 0, 0.8, 0);
    add(s.armGeo, this._bodyMaterial, -0.32, 0.82, 0, true);
    add(s.armGeo, this._bodyMaterial, 0.32, 0.82, 0, true);
    add(s.headGeo, s.headMat, 0, 1.3, 0);
    add(s.hairGeo, hairMat, 0, 1.43, 0.015);

    if (p.style === "longhair") {
      add(new THREE.BoxGeometry(0.12, 0.44, 0.12), hairMat, -0.2, 1.19, 0.04);
      add(new THREE.BoxGeometry(0.12, 0.44, 0.12), hairMat, 0.2, 1.19, 0.04);
    }
    if (p.style === "jacket") {
      add(new THREE.BoxGeometry(0.07, 0.55, 0.33), this._accentMaterial, -0.14, 0.81, -0.01);
      add(new THREE.BoxGeometry(0.07, 0.55, 0.33), this._accentMaterial, 0.14, 0.81, -0.01);
    }
    if (p.style === "glasses") {
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.35, roughness: 0.4 });
      this._extraMaterials.push(glassMat);
      add(s.glassesGeo, glassMat, 0, 1.31, -0.205);
    }
    if (p.style === "dhoti") {
      add(new THREE.BoxGeometry(0.38, 0.46, 0.2), this._accentMaterial, 0, 0.32, 0.015);
      add(new THREE.BoxGeometry(0.42, 0.045, 0.23), this._bodyMaterial, 0, 0.47, -0.01);
    }

    this._nameSprite = createNameSprite(this.name);
    if (this._nameSprite) this.mesh.add(this._nameSprite);
  }

  _syncMesh() {
    this.mesh.position.set(this.controller.position.x, this.controller.position.y, this.controller.position.z);
    this.mesh.rotation.y = this.controller.yaw;
  }

  get position() {
    return this.controller.position;
  }
  get yaw() {
    return this.controller.yaw;
  }
  get speed() {
    return this.controller.speed;
  }

  on(eventName, listener) {
    if (typeof listener !== "function") return () => {};
    if (!this._listeners.has(eventName)) this._listeners.set(eventName, new Set());
    this._listeners.get(eventName).add(listener);
    return () => this.off(eventName, listener);
  }

  off(eventName, listener) {
    this._listeners.get(eventName)?.delete(listener);
  }

  _emit(eventName, payload) {
    for (const listener of this._listeners.get(eventName) || []) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`Player event listener '${eventName}' failed`, error);
      }
    }
  }

  update(deltaSeconds, inputState, trackData = null) {
    if (this._disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const dt = Math.min(deltaSeconds, PLAYER_TUNING.MAX_DELTA);

    if (this.isLocal) {
      const input = this.controlsEnabled && inputState ? inputState : NO_INPUT;
      this.controller.update(dt, input, trackData, (name, payload) => this._emit(name, payload));

      // BUG 2 & 3 FIX: Calculate distance to track centerline for lawn speed penalty
      if (trackData && typeof trackData.getCenterline === "function") {
        const centerline = trackData.getCenterline();
        if (Array.isArray(centerline) && centerline.length > 0) {
          const px = this.controller.position.x;
          const pz = this.controller.position.z;
          let minDistSq = Infinity;

          for (let i = 0; i < centerline.length; i++) {
            const p = centerline[i];
            const dx = p.x - px;
            const dz = p.z - pz;
            const distSq = dx * dx + dz * dz;
            if (distSq < minDistSq) minDistSq = distSq;
          }

          const dist = Math.sqrt(minDistSq);
          const ROAD_HALF_WIDTH = 9.5;

          // Lawn Penalty: Slower speed when roaming in green space off the road
          if (dist > ROAD_HALF_WIDTH) {
            const maxLawnSpeed = (GAME_CONFIG.BASE_SPEED || 18.0) * 0.45;
            if (this.controller.speed > maxLawnSpeed) {
              this.controller.speed = Math.max(maxLawnSpeed, this.controller.speed - dt * 20.0);
            }
          }
        }
      }

      // BUG 2 & 3 FIX: Generous boundary for the entire playable campus ground (no invisible wall at 105)
      // Clamps before hitting the blue void surrounding the map
      const MIN_X = -320.0, MAX_X = 320.0;
      const MIN_Z = -160.0, MAX_Z = 1380.0;
      this.controller.position.x = Math.max(MIN_X, Math.min(MAX_X, this.controller.position.x));
      this.controller.position.z = Math.max(MIN_Z, Math.min(MAX_Z, this.controller.position.z));
    } else {
      this.controller.updateRemote(dt);
    }

    this._walkTime += dt * Math.max(0, this.controller.speed) * 0.65;
    const moving = this.controller.speed > 0.5 && this.controller.grounded;
    for (const limb of this._limbs) {
      const swing = moving ? Math.sin(this._walkTime + limb.phase) * 0.22 : 0;
      limb.mesh.position.y = limb.baseY + swing;
    }
    if (!this.controller.grounded) {
      this.mesh.rotation.z = Math.sin(this.controller.yaw) * 0.02;
    } else {
      this.mesh.rotation.z = 0;
    }
    this._syncMesh();
  }

  getState() {
    const s = this.controller.getState(this.peerId);
    s.character = this.selectedCharacter;
    return s;
  }

  applyRemoteState(state) {
    if (this.isLocal || !state?.position) return;
    this.controller.setRemoteTarget(state);
    if (!this.controller._remoteTarget) return;

    if (!this._hasRemoteSnapshot) {
      const t = this.controller._remoteTarget;
      this.controller.position.x = t.x;
      this.controller.position.y = t.y;
      this.controller.position.z = t.z;
      this.controller.yaw = t.yaw;
      this.controller.speed = t.speed;
      this._hasRemoteSnapshot = true;
      this._syncMesh();
    }
  }

  setControlsEnabled(enabled) {
    this.controlsEnabled = Boolean(enabled);
  }

  teleportTo(transform) {
    const p = transform?.position;
    const yaw = transform ? (transform.yaw ?? transform.rotation ?? 0) : 0;
    if (!p || ![p.x, p.y, p.z, yaw].every(Number.isFinite)) {
      console.warn("Player.teleportTo: invalid transform", transform);
      return;
    }
    this.controller.reset(p, yaw);
    this._syncMesh();
  }

  grantBoost(amount = GAME_CONFIG.BOOST_PICKUP_AMOUNT) {
    this.controller.grantBoost(amount);
    this._emit("boost-changed", this.getState());
  }

  grantShield(durationSeconds = GAME_CONFIG.SHIELD_DURATION) {
    this.controller.grantShield(durationSeconds);
    this._emit("shield-changed", this.getState());
  }

  setRaceProgress(lastCheckpointIndex, progress) {
    if (Number.isInteger(lastCheckpointIndex)) this.controller.lastCheckpointIndex = lastCheckpointIndex;
    if (Number.isFinite(progress)) this.controller.progress = Math.max(this.controller.progress, progress);
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this._clearCharacter();
    this._listeners.clear();
  }
}