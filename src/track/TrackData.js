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
  // Entrance avenue and start grid.
  { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 76.5 },
  // Sweep past the signature academic block and its landscaped forecourt.
  { x: 21.6, y: 0, z: 135 }, { x: 59.4, y: 0, z: 198 },
  { x: 73.8, y: 0, z: 270 }, { x: 54, y: 0, z: 328.5 },
  // Curve around the central lawn and checkerboard walkways.
  { x: 4.5, y: 0, z: 378 }, { x: -52.2, y: 0, z: 423 },
  { x: -79.2, y: 0, z: 490.5 }, { x: -70.2, y: 0, z: 558 },
  // Construction plots and a long tree-lined campus road.
  { x: -28.8, y: 0, z: 612 }, { x: 28.8, y: 0, z: 661.5 },
  { x: 70.2, y: 0, z: 729 }, { x: 82.8, y: 0, z: 801 },
  // Sports complex: courts, running track and spectator shade.
  { x: 58.5, y: 0, z: 868.5 }, { x: 10.8, y: 0, z: 922.5 },
  // Open green and return along the campus buildings.
  { x: -40.5, y: 0, z: 985.5 }, { x: -55.8, y: 0, z: 1057.5 },
  { x: -25.2, y: 0, z: 1125 }, { x: 25.2, y: 0, z: 1188 },
  { x: 40.5, y: 0, z: 1260 }, { x: 16.2, y: 0, z: 1332 },
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
export const OBSTACLE_DEFINITIONS = Object.freeze([
  { id: 'barrier-01', kind: 'barricade', x: 6.3, z: 118.8, width: 3.5, height: 1.3, depth: 1.2 },
  { id: 'cones-01', kind: 'cone', x: 46.8, z: 184.5, width: 2.5, height: 1.2, depth: 2.5 },
  { id: 'debris-01', kind: 'debris', x: 71.1, z: 297, width: 4, height: 1.2, depth: 3 },
  { id: 'pipe-01', kind: 'pipe', x: 3.6, z: 373.5, width: 4.5, height: 0.8, depth: 1.3 },
  { id: 'barrier-02', kind: 'barricade', x: -74.7, z: 499.5, width: 3.5, height: 1.3, depth: 1.2 },
  { id: 'debris-02', kind: 'debris', x: -56.7, z: 585, width: 4, height: 1.2, depth: 3 },
  { id: 'planks-01', kind: 'planks', x: 16.2, z: 657, width: 4.5, height: 0.5, depth: 1.2 },
  { id: 'cones-02', kind: 'cone', x: 77.4, z: 765, width: 2.5, height: 1.2, depth: 2.5 },
  { id: 'barrier-03', kind: 'barricade', x: 55.8, z: 882, width: 3.5, height: 1.3, depth: 1.2 },
  { id: 'debris-03', kind: 'debris', x: -50.4, z: 999, width: 4, height: 1.2, depth: 3 },
  { id: 'cones-03', kind: 'cone', x: -10.8, z: 1143, width: 2.5, height: 1.2, depth: 2.5 },
  { id: 'barrier-04', kind: 'barricade', x: 31.5, z: 1278, width: 3.5, height: 1.3, depth: 1.2 },
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
