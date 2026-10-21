/**
 * NM Run — deterministic track data (Person 1)
 * Coordinate convention: Three.js Y is up; the route progresses from the
 * first point toward the last point. The starter route mainly advances in +Z,
 * with gentle X offsets. All distances are world units.
 */

export const TRACK_CONFIG = Object.freeze({
  ROAD_WIDTH: 18,
  ROAD_THICKNESS: 0.6,
  SHOULDER_WIDTH: 2.2,
  KERB_WIDTH: 0.65,
  CHECKPOINT_COUNT: 12,
  TARGET_LENGTH_MIN: 1200,
  TARGET_LENGTH_MAX: 1600,
});

// Route is authored as connected centreline anchors. TrackBuilder interpolates
// between them to create a smooth continuous ribbon.
export const CENTERLINE_ANCHORS = Object.freeze([
  // Closed campus circuit: start/finish is at the entrance avenue.
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 95 },
  { x: 25, y: 0, z: 185 },
  { x: 82, y: 0, z: 245 },
  { x: 112, y: 0, z: 360 },
  { x: 105, y: 0, z: 570 },
  { x: 125, y: 0, z: 790 },
  { x: 88, y: 0, z: 960 },
  { x: 15, y: 0, z: 1080 },
  { x: -95, y: 0, z: 1040 },
  { x: -150, y: 0, z: 900 },
  { x: -155, y: 0, z: 690 },
  { x: -125, y: 0, z: 490 },
  { x: -95, y: 0, z: 310 },
  { x: -60, y: 0, z: 180 },
  { x: -35, y: 0, z: 75 },
]);

// Fix 2: 4 Side-by-Side Starting Grid Slots facing directly down the starting straight (+Z)
export const STARTING_GRID_SLOTS = Object.freeze([
  { slot: 0, position: { x: -4.5, y: 0.1, z: 0 }, yaw: 0 },
  { slot: 1, position: { x: -1.5, y: 0.1, z: 0 }, yaw: 0 },
  { slot: 2, position: { x: 1.5, y: 0.1, z: 0 }, yaw: 0 },
  { slot: 3, position: { x: 4.5, y: 0.1, z: 0 }, yaw: 0 },
]);

// Segment ranges are normalized route progress.
export const TRACK_ZONES = Object.freeze([
  { id: 'campus-entrance', name: 'Campus Entrance & Starting Grid', start: 0.00, end: 0.13, color: 0x2f8f62 },
  { id: 'academic-blocks', name: 'Academic Block Paths', start: 0.13, end: 0.32, color: 0x357fba },
  { id: 'central-quad', name: 'Central Quad', start: 0.32, end: 0.49, color: 0x8b69b8 },
  { id: 'construction', name: 'Under-Construction Zone', start: 0.49, end: 0.70, color: 0xc98535 },
  { id: 'final-sprint', name: 'Open Ground & Final Sprint', start: 0.70, end: 1.00, color: 0x2c9b9b },
]);

// Twelve ordered gates with deterministic world positions along the route
export const CHECKPOINTS = Object.freeze([
  { id: 'checkpoint-01', index: 0, progress: 1 / 12, label: 'CHECKPOINT 1', x: 0, y: 0, z: 95 },
  { id: 'checkpoint-02', index: 1, progress: 2 / 12, label: 'CHECKPOINT 2', x: 25, y: 0, z: 185 },
  { id: 'checkpoint-03', index: 2, progress: 3 / 12, label: 'CHECKPOINT 3', x: 82, y: 0, z: 245 },
  { id: 'checkpoint-04', index: 3, progress: 4 / 12, label: 'CHECKPOINT 4', x: 112, y: 0, z: 360 },
  { id: 'checkpoint-05', index: 4, progress: 5 / 12, label: 'CHECKPOINT 5', x: 105, y: 0, z: 570 },
  { id: 'checkpoint-06', index: 5, progress: 6 / 12, label: 'CHECKPOINT 6', x: 125, y: 0, z: 790 },
  { id: 'checkpoint-07', index: 6, progress: 7 / 12, label: 'CHECKPOINT 7', x: 88, y: 0, z: 960 },
  { id: 'checkpoint-08', index: 7, progress: 8 / 12, label: 'CHECKPOINT 8', x: -95, y: 0, z: 1040 },
  { id: 'checkpoint-09', index: 8, progress: 9 / 12, label: 'CHECKPOINT 9', x: -150, y: 0, z: 900 },
  { id: 'checkpoint-10', index: 9, progress: 10 / 12, label: 'CHECKPOINT 10', x: -155, y: 0, z: 690 },
  { id: 'checkpoint-11', index: 10, progress: 11 / 12, label: 'CHECKPOINT 11', x: -95, y: 0, z: 310 },
  { id: 'finish', index: 11, progress: 1.0, label: 'FINISH', x: 0, y: 0, z: 0 },
]);

// Deterministic on-track obstacle bounds
function makeGeneratedObstacles() {
  let seed = 20261020;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const kinds = ['rock', 'construction', 'barricade', 'debris'];
  const result = [];

  // Fix 3: Strict lateral clamp so hazards stay strictly within the drivable road (-5.5 to +5.5)
  for (let i = 0; i < 20; i++) {
    const segment = (i * 3 + 1) % CENTERLINE_ANCHORS.length;
    const a = CENTERLINE_ANCHORS[segment];
    const b = CENTERLINE_ANCHORS[(segment + 1) % CENTERLINE_ANCHORS.length];
    const t = 0.25 + random() * 0.5;
    const dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz) || 1;
    const lateral = (random() - 0.5) * 7.5; // strictly within road half-width

    const x = a.x + dx * t + (dz / length) * lateral;
    const z = a.z + dz * t - (dx / length) * lateral;
    const kind = kinds[Math.floor(random() * kinds.length)];
    const index = String(i + 1).padStart(2, '0');
    const size = kind === 'construction' ? 3.8 : 2.4;

    result.push({
      id: `random-${kind}-${index}`,
      kind,
      x: Math.round(x * 10) / 10,
      z: Math.round(z * 10) / 10,
      width: size,
      height: kind === 'rock' ? 1.4 : 1.2,
      depth: 2.2
    });
  }
  return result;
}

export const OBSTACLE_DEFINITIONS = Object.freeze([
  { id: 'barrier-01', kind: 'barricade', x: 2.5, z: 70, width: 3.5, height: 1.3, depth: 1.2 },
  { id: 'cones-01', kind: 'cone', x: 23, z: 180, width: 2.5, height: 1.2, depth: 2.5 },
  { id: 'debris-01', kind: 'debris', x: 80, z: 250, width: 3.5, height: 1.2, depth: 2.5 },
  { id: 'pipe-01', kind: 'pipe', x: 110, z: 370, width: 4.0, height: 0.8, depth: 1.3 },
  { id: 'barrier-02', kind: 'barricade', x: 104, z: 580, width: 3.5, height: 1.3, depth: 1.2 },
  { id: 'debris-02', kind: 'debris', x: 122, z: 795, width: 3.5, height: 1.2, depth: 2.5 },
  { id: 'planks-01', kind: 'planks', x: 85, z: 965, width: 4.0, height: 0.5, depth: 1.2 },
  { id: 'cones-02', kind: 'cone', x: 12, z: 1075, width: 2.5, height: 1.2, depth: 2.5 },
  { id: 'barrier-03', kind: 'barricade', x: -92, z: 1035, width: 3.5, height: 1.3, depth: 1.2 },
  { id: 'debris-03', kind: 'debris', x: -148, z: 895, width: 3.5, height: 1.2, depth: 2.5 },
  { id: 'cones-03', kind: 'cone', x: -152, z: 685, width: 2.5, height: 1.2, depth: 2.5 },
  { id: 'barrier-04', kind: 'barricade', x: -122, z: 485, width: 3.5, height: 1.3, depth: 1.2 },
  ...makeGeneratedObstacles(),
]);

// Pickups snapped directly along the drivable track road corridor
export const PICKUP_DEFINITIONS = Object.freeze([
  { id: 'boost-01', type: 'boost', x: 0, y: 1.2, z: 45, respawnSeconds: 10 },
  { id: 'shield-01', type: 'shield', x: 12, y: 1.2, z: 140, respawnSeconds: 10 },
  { id: 'boost-02', type: 'boost', x: 50, y: 1.2, z: 215, respawnSeconds: 10 },
  { id: 'boost-03', type: 'boost', x: 95, y: 1.2, z: 300, respawnSeconds: 10 },
  { id: 'shield-02', type: 'shield', x: 108, y: 1.2, z: 460, respawnSeconds: 10 },
  { id: 'boost-04', type: 'boost', x: 115, y: 1.2, z: 680, respawnSeconds: 10 },
  { id: 'shield-03', type: 'shield', x: 105, y: 1.2, z: 875, respawnSeconds: 10 },
  { id: 'boost-05', type: 'boost', x: 50, y: 1.2, z: 1020, respawnSeconds: 10 },
  { id: 'boost-06', type: 'boost', x: -50, y: 1.2, z: 1060, respawnSeconds: 10 },
  { id: 'shield-04', type: 'shield', x: -125, y: 1.2, z: 970, respawnSeconds: 10 },
  { id: 'boost-07', type: 'boost', x: -140, y: 1.2, z: 590, respawnSeconds: 10 },
  { id: 'shield-05', type: 'shield', x: -75, y: 1.2, z: 245, respawnSeconds: 10 },
]);