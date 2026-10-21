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
  // Closed campus circuit: start/finish is at the entrance avenue. The curve
  // closes from the final anchor back to the first without a duplicate point.
  { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 95 },
  { x: 25, y: 0, z: 185 }, { x: 82, y: 0, z: 245 },
  { x: 112, y: 0, z: 360 }, { x: 105, y: 0, z: 570 },
  { x: 125, y: 0, z: 790 }, { x: 88, y: 0, z: 960 },
  { x: 15, y: 0, z: 1080 }, { x: -95, y: 0, z: 1040 },
  { x: -150, y: 0, z: 900 }, { x: -155, y: 0, z: 690 },
  { x: -125, y: 0, z: 490 }, { x: -95, y: 0, z: 310 },
  { x: -60, y: 0, z: 180 }, { x: -35, y: 0, z: 75 },
]);

// Segment ranges are normalized route progress. The sports ground is a
// sub-zone between construction and final sprint, not a sixth core segment.
export const TRACK_ZONES = Object.freeze([
  { id: 'campus-entrance', name: 'Campus Entrance & Starting Grid', start: 0.00, end: 0.13, color: 0x2f8f62 },
  { id: 'academic-blocks', name: 'Academic Block Paths', start: 0.13, end: 0.32, color: 0x357fba },
  { id: 'central-quad', name: 'Central Quad', start: 0.32, end: 0.49, color: 0x8b69b8 },
  { id: 'construction', name: 'Under-Construction Zone', start: 0.49, end: 0.70, color: 0xc98535 },
  { id: 'final-sprint', name: 'Open Ground & Final Sprint', start: 0.70, end: 1.00, color: 0x2c9b9b },
]);

// Twelve ordered gates; checkpoint 11 is the finish trigger.
export const CHECKPOINTS = Object.freeze(Array.from({ length: 12 }, (_, index) => ({
  id: index === 11 ? 'finish' : `checkpoint-${String(index + 1).padStart(2, '0')}`,
  index,
  progress: (index + 1) / 12,
  label: index === 11 ? 'FINISH' : `CHECKPOINT ${index + 1}`,
})));

// Stable obstacle IDs and deterministic world positions. Bounds are generated
// from these records by TrackWorld and exported as plain numeric objects.
function makeGeneratedObstacles() {
  let seed = 20261020;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const kinds = ['tree', 'rock', 'construction', 'barricade', 'debris'];
  const result = [];
  // Use interior points of the closed anchor loop and a lateral offset so
  // hazards spawn on the drivable road instead of arbitrary world coordinates.
  for (let i = 0; i < 24; i++) {
    const segment = (i * 3 + 1) % CENTERLINE_ANCHORS.length;
    const a = CENTERLINE_ANCHORS[segment];
    const b = CENTERLINE_ANCHORS[(segment + 1) % CENTERLINE_ANCHORS.length];
    const t = 0.25 + random() * 0.5;
    const dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz) || 1;
    const lateral = (random() - 0.5) * 9.5;
    const x = a.x + dx * t + (dz / length) * lateral;
    const z = a.z + dz * t - (dx / length) * lateral;
    const kind = kinds[Math.floor(random() * kinds.length)];
    const index = String(i + 1).padStart(2, '0');
    const size = kind === 'tree' ? 3.2 : kind === 'construction' ? 4.5 : 2.8;
    result.push({ id: `random-${kind}-${index}`, kind, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10,
      width: size, height: kind === 'tree' ? 5.5 : kind === 'rock' ? 1.8 : kind === 'cone' ? 1.2 : 1.4,
      depth: kind === 'tree' ? 3.2 : kind === 'construction' ? 1.5 : 2.6 });
  }
  return result;
}

export const OBSTACLE_DEFINITIONS = Object.freeze([
  // Original stable IDs retained for other team members' integrations.
  { id: 'barrier-01', kind: 'barricade', x: 5, z: 70, width: 3.5, height: 1.3, depth: 1.2 },
  { id: 'cones-01', kind: 'cone', x: 35, z: 205, width: 2.5, height: 1.2, depth: 2.5 },
  { id: 'debris-01', kind: 'debris', x: 106, z: 410, width: 4, height: 1.2, depth: 3 },
  { id: 'pipe-01', kind: 'pipe', x: 105, z: 600, width: 4.5, height: 0.8, depth: 1.3 },
  { id: 'barrier-02', kind: 'barricade', x: 120, z: 820, width: 3.5, height: 1.3, depth: 1.2 },
  { id: 'debris-02', kind: 'debris', x: 72, z: 985, width: 4, height: 1.2, depth: 3 },
  { id: 'planks-01', kind: 'planks', x: -35, z: 1060, width: 4.5, height: 0.5, depth: 1.2 },
  { id: 'cones-02', kind: 'cone', x: -142, z: 940, width: 2.5, height: 1.2, depth: 2.5 },
  { id: 'barrier-03', kind: 'barricade', x: -150, z: 740, width: 3.5, height: 1.3, depth: 1.2 },
  { id: 'debris-03', kind: 'debris', x: -115, z: 520, width: 4, height: 1.2, depth: 3 },
  { id: 'cones-03', kind: 'cone', x: -75, z: 285, width: 2.5, height: 1.2, depth: 2.5 },
  { id: 'barrier-04', kind: 'barricade', x: -28, z: 120, width: 3.5, height: 1.3, depth: 1.2 },
  // Additional obstacles are generated with a fixed seed, so placements look
  // varied but stay identical for every client and server build.
  ...makeGeneratedObstacles(),
]);

export const PICKUP_DEFINITIONS = Object.freeze([
  { id: 'boost-01', type: 'boost', x: -4.5, y: 1.5, z: 63, respawnSeconds: 10 },
  { id: 'shield-01', type: 'shield', x: 34.2, y: 1.5, z: 157.5, respawnSeconds: 10 },
  { id: 'boost-02', type: 'boost', x: 67.5, y: 1.5, z: 256.5, respawnSeconds: 10 },
  { id: 'boost-03', type: 'boost', x: 20.7, y: 1.5, z: 360, respawnSeconds: 10 },
  { id: 'shield-02', type: 'shield', x: -73.8, y: 1.5, z: 513, respawnSeconds: 10 },
  { id: 'boost-04', type: 'boost', x: -13.5, y: 1.5, z: 630, respawnSeconds: 10 },
  { id: 'shield-03', type: 'shield', x: 51.3, y: 1.5, z: 711, respawnSeconds: 10 },
  { id: 'boost-05', type: 'boost', x: 75.6, y: 1.5, z: 828, respawnSeconds: 10 },
  { id: 'boost-06', type: 'boost', x: -10.8, y: 1.5, z: 940.5, respawnSeconds: 10 },
  { id: 'shield-04', type: 'shield', x: -52.2, y: 1.5, z: 1035, respawnSeconds: 10 },
  { id: 'boost-07', type: 'boost', x: 10.8, y: 1.5, z: 1170, respawnSeconds: 10 },
  { id: 'shield-05', type: 'shield', x: 31.5, y: 1.5, z: 1296, respawnSeconds: 10 },
]);
