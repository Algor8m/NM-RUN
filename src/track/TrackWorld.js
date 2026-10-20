import * as THREE from 'three';
import { TrackBuilder, findNearestRoutePoint } from './TrackBuilder.js';
import { CENTERLINE_ANCHORS, TRACK_CONFIG, TRACK_ZONES, CHECKPOINTS, OBSTACLE_DEFINITIONS, PICKUP_DEFINITIONS } from './TrackData.js';

/**
 * Public P1 track API. Three.js Y is up. The route progresses along sampled
 * centreline points from index 0 to the final point. Progress is normalized 0..1.
 */
export class TrackWorld {
  constructor(options = {}) {
    this.options = options;
    this.builder = new TrackBuilder();
    this.scene = null;
    this.pickupActive = new Map(PICKUP_DEFINITIONS.map(p => [p.id, true]));
    this.obstacleActive = new Map(OBSTACLE_DEFINITIONS.map(o => [o.id, true]));
    this.routePoints = this.builder.getRoutePoints();
    this.checkpoints = this.#makeCheckpointDefinitions();
    this.obstacleBounds = this.#makeObstacleBounds();
    this.pickupSpawns = PICKUP_DEFINITIONS.map(p => ({ id: p.id, type: p.type, position: { x: p.x, y: p.y, z: p.z }, respawnSeconds: p.respawnSeconds }));
    this.totalLength = this.#calculateLength(this.routePoints);
    this.startTransforms = this.#makeStartTransforms();
    this.zoneBoundaries = TRACK_ZONES;
  }

  build(scene) {
    if (!(scene instanceof THREE.Scene) && (!scene || typeof scene.add !== 'function')) {
      throw new TypeError('TrackWorld.build(scene) expects a Three.js Scene or scene-like object with add().');
    }
    this.scene = scene;
    this.builder.build(scene);
    return this;
  }

  getStartTransforms() { return this.startTransforms.map(t => ({ ...t, position: { ...t.position } })); }
  getCheckpointCount() { return this.checkpoints.length; }
  getCheckpoint(index) { return this.checkpoints[index] ? structuredCloneSafe(this.checkpoints[index]) : null; }
  getCheckpointTriggers() { return this.checkpoints.map(cp => structuredCloneSafe(cp)); }
  getObstacleBounds() {
    return this.obstacleBounds.map(b => ({ ...b, min: { ...b.min }, max: { ...b.max }, active: this.obstacleActive.get(b.id) ?? false }));
  }
  getPickupSpawns() { return this.pickupSpawns.map(p => ({ ...p, position: { ...p.position }, active: this.pickupActive.get(p.id) ?? false })); }
  getCenterline() { return this.routePoints.map(p => ({ x: p.x, y: p.y, z: p.z })); }
  getTotalLength() { return this.totalLength; }

  setPickupActive(id, active) {
    if (!this.pickupActive.has(id)) return false;
    const next = Boolean(active);
    this.pickupActive.set(id, next);
    const mesh = this.builder.getPickupMeshes().get(id);
    if (mesh) mesh.visible = next;
    return true;
  }

  setObstacleActive(id, active) {
    if (!this.obstacleActive.has(id)) return false;
    const next = Boolean(active);
    this.obstacleActive.set(id, next);
    const mesh = this.builder.getObstacleMeshes().get(id);
    if (mesh) mesh.visible = next;
    return true;
  }

  /**
   * Normalized progress estimate constrained by the last server-accepted
   * checkpoint. This is a client-side estimate, not race authority.
   */
  getProgress(position, lastCheckpointIndex = -1) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return 0;
    const nearest = findNearestRoutePoint(position, this.routePoints).index;
    const raw = nearest / Math.max(1, this.routePoints.length - 1);
    const acceptedFloor = lastCheckpointIndex < 0 ? 0 : (lastCheckpointIndex + 1) / this.checkpoints.length;
    const nextGateCeiling = Math.min(1, (lastCheckpointIndex + 2) / this.checkpoints.length);
    return Math.max(acceptedFloor, Math.min(raw, nextGateCeiling));
  }

  getRespawnTransform(lastCheckpointIndex = -1) {
    const progress = lastCheckpointIndex < 0 ? 0 : this.checkpoints[Math.min(lastCheckpointIndex, this.checkpoints.length - 1)].progress;
    const index = Math.max(0, Math.min(this.routePoints.length - 2, Math.floor(progress * (this.routePoints.length - 1))));
    const p = this.routePoints[index];
    const next = this.routePoints[index + 1];
    return { position: { x: p.x, y: 0.2, z: p.z - 5 }, yaw: Math.atan2(next.x - p.x, next.z - p.z) };
  }

  update(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const time = performance.now() * 0.001;
    for (const [id, mesh] of this.builder.getPickupMeshes()) {
      if (this.pickupActive.get(id)) {
        mesh.rotation.y += deltaSeconds * 1.5;
        mesh.position.y = (PICKUP_DEFINITIONS.find(p => p.id === id)?.y ?? 1.5) + Math.sin(time * 2.2 + mesh.position.z) * 0.18;
      }
    }
  }

  /** Exposed for the standalone harness: toggles route points and labels. */
  setDebugVisible(visible) {
    const root = this.builder.getRoot();
    const debug = root.getObjectByName('TrackDebug');
    if (debug) debug.visible = Boolean(visible);
  }

  #makeStartTransforms() {
    const start = this.routePoints[0];
    const next = this.routePoints[1];
    const yaw = Math.atan2(next.x - start.x, next.z - start.z);
    return [-5.2, -1.75, 1.75, 5.2].map((lateral, slot) => ({
      position: { x: start.x + Math.cos(yaw) * lateral, y: 0.15, z: start.z - 9 - Math.sin(yaw) * lateral }, yaw, slot,
    }));
  }

  #makeCheckpointDefinitions() {
    return CHECKPOINTS.map(cp => {
      const routeIndex = Math.floor(cp.progress * (this.routePoints.length - 1));
      const p = this.routePoints[routeIndex];
      const next = this.routePoints[Math.min(routeIndex + 1, this.routePoints.length - 1)];
      const yaw = Math.atan2(next.x - p.x, next.z - p.z);
      return {
        id: cp.id, index: cp.index, label: cp.label, progress: cp.progress,
        position: { x: p.x, y: 0, z: p.z }, yaw,
        bounds: { min: { x: p.x - TRACK_CONFIG.ROAD_WIDTH / 2, y: 0, z: p.z - 2 }, max: { x: p.x + TRACK_CONFIG.ROAD_WIDTH / 2, y: 7, z: p.z + 2 } },
        isFinish: cp.index === CHECKPOINTS.length - 1,
      };
    });
  }

  #makeObstacleBounds() {
    return OBSTACLE_DEFINITIONS.map(o => ({
      id: o.id, kind: o.kind,
      min: { x: o.x - o.width / 2, y: 0, z: o.z - o.depth / 2 },
      max: { x: o.x + o.width / 2, y: o.height, z: o.z + o.depth / 2 },
      active: true,
    }));
  }

  #calculateLength(points) {
    let length = 0;
    for (let i = 1; i < points.length; i++) length += points[i].distanceTo(points[i - 1]);
    return Math.round(length * 10) / 10;
  }
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export default TrackWorld;
