import * as THREE from 'three';
import { CENTERLINE_ANCHORS, TRACK_CONFIG, TRACK_ZONES, CHECKPOINTS, OBSTACLE_DEFINITIONS, PICKUP_DEFINITIONS } from './TrackData.js';

const sharedMaterials = {};
function material(color, options = {}) {
  const key = `${color}-${options.roughness ?? 0.9}-${options.transparent ? 1 : 0}`;
  if (!sharedMaterials[key]) sharedMaterials[key] = new THREE.MeshStandardMaterial({ color, roughness: options.roughness ?? 0.9, transparent: options.transparent ?? false, opacity: options.opacity ?? 1 });
  return sharedMaterials[key];
}

function addBox(parent, { x, y, z, width, height, depth, color, name = '', rotationY = 0 }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(color));
  mesh.position.set(x, y + height / 2, z);
  mesh.rotation.y = rotationY;
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function sampleAnchors(anchors, subdivisions = 10) {
  const curve = new THREE.CatmullRomCurve3(anchors.map(p => new THREE.Vector3(p.x, p.y, p.z)), false, 'catmullrom', 0.35);
  const points = curve.getPoints((anchors.length - 1) * subdivisions);
  return points;
}

function makeRibbon(points, width, yOffset, color, parent, name) {
  const half = width / 2;
  const vertices = [];
  const indices = [];
  for (let i = 0; i < points.length; i++) {
    const previous = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tangentX = next.z - previous.z;
    const tangentZ = -(next.x - previous.x);
    const length = Math.hypot(tangentX, tangentZ) || 1;
    const nx = tangentX / length;
    const nz = tangentZ / length;
    vertices.push(points[i].x + nx * half, points[i].y + yOffset, points[i].z + nz * half);
    vertices.push(points[i].x - nx * half, points[i].y + yOffset, points[i].z - nz * half);
    if (i < points.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.name = name;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function nearestRouteIndex(point, routePoints) {
  let bestIndex = 0;
  let bestDistanceSq = Infinity;
  for (let i = 0; i < routePoints.length; i++) {
    const p = routePoints[i];
    const dx = point.x - p.x;
    const dz = point.z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDistanceSq) { bestDistanceSq = d2; bestIndex = i; }
  }
  return { index: bestIndex, distanceSq: bestDistanceSq };
}

export class TrackBuilder {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'NMRunTrackWorld';
    this.routePoints = sampleAnchors(CENTERLINE_ANCHORS, 12);
    this.obstacleMeshes = new Map();
    this.pickupMeshes = new Map();
    this.checkpointMeshes = [];
    this.debugGroup = new THREE.Group();
    this.debugGroup.name = 'TrackDebug';
    this.root.add(this.debugGroup);
    this.built = false;
  }

  build(scene) {
    if (this.built) return this.root;
    scene.add(this.root);
    this.#buildGround();
    this.#buildRoad();
    this.#buildEnvironment();
    this.#buildCheckpoints();
    this.#buildObstacles();
    this.#buildPickups();
    this.#buildStartGrid();
    this.#buildFinishGate();
    this.#buildDebug();
    this.built = true;
    return this.root;
  }

  #buildGround() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, 1580), material(0x7bbd78));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.55, 700);
    ground.receiveShadow = true;
    ground.name = 'CampusGround';
    this.root.add(ground);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(650, 1800), material(0x8bcf84));
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(0, -0.62, 700);
    this.root.add(outer);
  }

  #buildRoad() {
    makeRibbon(this.routePoints, TRACK_CONFIG.ROAD_WIDTH + TRACK_CONFIG.SHOULDER_WIDTH * 2, -0.12, 0xb8b9b5, this.root, 'RoadShoulders');
    makeRibbon(this.routePoints, TRACK_CONFIG.ROAD_WIDTH, 0, 0x343a43, this.root, 'RoadSurface');
    makeRibbon(this.routePoints, TRACK_CONFIG.ROAD_WIDTH + 0.15, 0.025, 0x343a43, this.root, 'RoadSurfaceTop');

    // Painted dashed centre markers and colour-coded zone stripes.
    for (let i = 0; i < this.routePoints.length - 3; i += 8) {
      const p = this.routePoints[i];
      const next = this.routePoints[Math.min(i + 1, this.routePoints.length - 1)];
      const yaw = Math.atan2(next.x - p.x, next.z - p.z);
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.035, 4.5), material(0xf8f3cf));
      dash.position.set(p.x, 0.055, p.z);
      dash.rotation.y = yaw;
      this.root.add(dash);
    }
    for (const zone of TRACK_ZONES) {
      const idx = Math.min(this.routePoints.length - 1, Math.floor(zone.start * (this.routePoints.length - 1)));
      const p = this.routePoints[idx];
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(TRACK_CONFIG.ROAD_WIDTH - 1, 0.045, 2.2), material(zone.color));
      stripe.position.set(p.x, 0.06, p.z);
      const next = this.routePoints[Math.min(idx + 1, this.routePoints.length - 1)];
      stripe.rotation.y = Math.atan2(next.x - p.x, next.z - p.z);
      this.root.add(stripe);
    }
  }

  #buildEnvironment() {
    // Campus layout is based on the supplied NMIMS Hyderabad/Jadcherla photos:
    // white academic blocks with blue ribbon windows, a broad entrance portal,
    // landscaped lawns/checker paving, sports courts and unfinished plots.
    const white = 0xe9e8e1, whiteShade = 0xd4d7d5, glass = 0x245577;

    // Broad white entrance portal. The road passes through the open centre.
    addBox(this.root, { x: -14, y: 0, z: 18, width: 2.6, height: 8.2, depth: 3, color: white, name: 'CampusGateLeft' });
    addBox(this.root, { x: 14, y: 0, z: 18, width: 2.6, height: 8.2, depth: 3, color: white, name: 'CampusGateRight' });
    addBox(this.root, { x: 0, y: 7.1, z: 18, width: 30.5, height: 2.1, depth: 3, color: white, name: 'CampusGateHeader' });
    addBox(this.root, { x: 0, y: 7.45, z: 19.7, width: 17, height: 0.35, depth: 0.18, color: 0x243442, name: 'CampusSignPanel' });
    // Small neutral sign blocks suggest institutional marks without copying logos.
    addBox(this.root, { x: -10.5, y: 6.5, z: 19.8, width: 1.2, height: 1.2, depth: 0.18, color: 0x1c4a63, name: 'GateSignMark' });

    // Signature academic building on the left of the first sweeping turn.
    // Facade faces +X, so its long blue window bands are visible from the route.
    const makeAcademicBlock = (x, z, width, depth, height, facing = 'front', name = 'AcademicBlock') => {
      addBox(this.root, { x, y: 0, z, width, height, depth, color: white, name });
      addBox(this.root, { x, y: height, z, width: width + 1.4, height: 1.15, depth: depth + 1.4, color: whiteShade, name: `${name}Roof` });
      // Horizontal blue-tinted ribbon windows separated by broad white bands.
      const floors = Math.max(3, Math.floor(height / 3.1));
      if (facing === 'front' || facing === 'both') {
        const count = Math.max(4, Math.floor(width / 5.2));
        for (let floor = 0; floor < floors; floor++) {
          for (let col = 0; col < count; col++) {
            const wx = x - width / 2 + (col + 0.5) * width / count;
            addBox(this.root, { x: wx, y: 1.0 + floor * 3.0, z: z + depth / 2 + 0.075, width: width / count - 0.55, height: 1.65, depth: 0.15, color: glass, name: `${name}FrontWindow` });
          }
        }
      }
      if (facing === 'side' || facing === 'both') {
        const count = Math.max(3, Math.floor(depth / 5));
        for (let floor = 0; floor < floors; floor++) {
          for (let col = 0; col < count; col++) {
            const wz = z - depth / 2 + (col + 0.5) * depth / count;
            addBox(this.root, { x: x + width / 2 + 0.075, y: 1.0 + floor * 3.0, z: wz, width: 0.15, height: 1.65, depth: depth / count - 0.55, color: glass, name: `${name}SideWindow` });
          }
        }
      }
      // Tall end-wing makes the building silhouette closer to the reference.
      addBox(this.root, { x: x - width / 2 + 2.4, y: 0, z, width: 4.8, height: height + 2.8, depth: depth + 1.2, color: whiteShade, name: `${name}EndWing` });
      for (let floor = 0; floor < floors; floor++) {
        addBox(this.root, { x: x - width / 2 + 2.4, y: 1.1 + floor * 3.0, z: z + depth / 2 + 0.72, width: 2.2, height: 1.55, depth: 0.12, color: 0x9aaeb8, name: `${name}EndWingWindow` });
      }
    };
    makeAcademicBlock(-34, 145, 46, 31, 19, 'both', 'MainAcademicBlock');
    makeAcademicBlock(113, 280, 30, 42, 17, 'side', 'AcademicBlockEast');
    makeAcademicBlock(-124, 740, 31, 45, 15, 'side', 'AcademicBlockWest');
    makeAcademicBlock(133, 1130, 34, 48, 18, 'side', 'AcademicBlockNorth');
    makeAcademicBlock(-105, 1290, 28, 38, 14, 'front', 'AcademicBlockSouth');

    // Broad light concrete internal avenues and campus paths.
    const pathMat = material(0xc9c9bd);
    const avenue = new THREE.Mesh(new THREE.PlaneGeometry(12, 1420), pathMat);
    avenue.rotation.x = -Math.PI / 2; avenue.position.set(150, -0.42, 740); avenue.name = 'CampusServiceRoad'; this.root.add(avenue);
    const forecourt = new THREE.Mesh(new THREE.PlaneGeometry(70, 34), material(0xd7d4c9));
    forecourt.rotation.x = -Math.PI / 2; forecourt.position.set(-36, -0.39, 220); forecourt.name = 'AcademicForecourt'; this.root.add(forecourt);

    // Landscaped lawn and a checkerboard paved promenade, inspired by the photos.
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(86, 88), material(0x5dad68));
    lawn.rotation.x = -Math.PI / 2; lawn.position.set(-8, -0.43, 470); lawn.name = 'CentralLandscapedLawn'; this.root.add(lawn);
    const pavingColors = [0xe1dfd5, 0xb9c0bd];
    const tileSize = 4;
    for (let row = 0; row < 8; row++) for (let col = 0; col < 15; col++) {
      const tile = new THREE.Mesh(new THREE.BoxGeometry(tileSize - 0.08, 0.08, tileSize - 0.08), material(pavingColors[(row + col) % 2]));
      tile.position.set(-37 + col * tileSize, -0.28, 430 + row * tileSize); tile.name = 'CheckerPromenadeTile'; this.root.add(tile);
    }
    // Low polygon planting beds.
    for (let i = 0; i < 14; i++) {
      const z = 395 + i * 13;
      const side = i % 2 ? 1 : -1;
      const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 0), material(i % 3 ? 0x397e4c : 0x638d46));
      bush.scale.set(1.4, 0.55, 1); bush.position.set(side * (25 + (i % 3) * 3), 1.1, z); bush.name = 'LandscapedShrub'; this.root.add(bush);
    }
    // Fountain/statue landmark in the quad.
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7.5, 0.8, 10), material(0xd9d7ce));
    fountain.position.set(-45, 0.05, 490); fountain.name = 'CentralQuadFountain'; this.root.add(fountain);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.12, 12), material(0x3e9dc1));
    water.position.set(-45, 0.52, 490); this.root.add(water);
    const statue = new THREE.Mesh(new THREE.ConeGeometry(1.25, 4.2, 5), material(0xe5c66d));
    statue.position.set(-45, 2.7, 490); this.root.add(statue);

    // Sports complex: fenced blue/green courts, a red oval running track,
    // basketball markings and simple shaded spectator stands.
    const sportsBase = new THREE.Mesh(new THREE.PlaneGeometry(105, 125), material(0x4b9c61));
    sportsBase.rotation.x = -Math.PI / 2; sportsBase.position.set(142, -0.42, 930); sportsBase.name = 'SportsComplexGround'; this.root.add(sportsBase);
    const courtSpecs = [
      { x: 119, z: 865, w: 29, d: 17, color: 0x315e9d },
      { x: 155, z: 865, w: 29, d: 17, color: 0x315e9d },
      { x: 119, z: 892, w: 29, d: 17, color: 0x3d8c79 },
      { x: 155, z: 892, w: 29, d: 17, color: 0x3d8c79 },
      { x: 137, z: 945, w: 38, d: 24, color: 0x315e9d },
    ];
    for (const c of courtSpecs) {
      const court = new THREE.Mesh(new THREE.BoxGeometry(c.w, 0.12, c.d), material(c.color));
      court.position.set(c.x, -0.22, c.z); court.name = 'SportsCourt'; this.root.add(court);
      // Simple pale boundary lines.
      for (const edge of [-1, 1]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(c.w - 1, 0.035, 0.18), material(0xf2f0d9));
        line.position.set(c.x, -0.13, c.z + edge * (c.d / 2 - 0.6)); this.root.add(line);
      }
    }
    // Oval-like track represented by four broad red strips around the court zone.
    for (const strip of [
      { x: 142, z: 830, w: 100, d: 3 }, { x: 142, z: 1005, w: 100, d: 3 },
      { x: 92, z: 918, w: 3, d: 90 }, { x: 192, z: 918, w: 3, d: 90 },
    ]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(strip.w, 0.08, strip.d), material(0xb95d55));
      mesh.position.set(strip.x, -0.17, strip.z); mesh.name = 'SportsRunningTrack'; this.root.add(mesh);
    }
    for (let i = 0; i < 9; i++) {
      addBox(this.root, { x: 106 + i * 8.5, y: 0, z: 1018, width: 7.5, height: 2.1, depth: 3, color: i % 2 ? 0x385a86 : 0xddd6c5, name: 'CoveredGrandstandSeat' });
    }
    // Fencing around the sports zone.
    for (const edge of [0, 1]) {
      const z = edge ? 1022 : 820;
      addBox(this.root, { x: 142, y: 0, z, width: 108, height: 2.4, depth: 0.25, color: 0x6d8d86, name: 'SportsFence' });
    }

    // Construction plots and unfinished structures are deliberately on the
    // outside of the racing line, echoing the developing campus surroundings.
    const soil = new THREE.Mesh(new THREE.PlaneGeometry(90, 78), material(0x9c7853));
    soil.rotation.x = -Math.PI / 2; soil.position.set(-132, -0.4, 650); soil.name = 'ConstructionPlot'; this.root.add(soil);
    for (let i = 0; i < 8; i++) {
      const x = -166 + i * 9;
      addBox(this.root, { x, y: 0, z: 625, width: 0.45, height: 12, depth: 0.45, color: 0xe2b34c, name: 'ScaffoldPost' });
      addBox(this.root, { x: x + 4, y: 5, z: 625, width: 8.5, height: 0.4, depth: 0.4, color: 0xe2b34c, name: 'ScaffoldRail' });
    }
    for (let i = 0; i < 7; i++) {
      const pile = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8, 0), material(i % 2 ? 0x8b8174 : 0xb09b7e));
      pile.scale.set(1.3, 0.65, 1.1); pile.position.set(-140 + i * 7, 1.1, 680 + (i % 3) * 5); pile.name = 'ConstructionDebrisPile'; this.root.add(pile);
    }

    // Tree-lined avenues: clustered low-poly crowns and pale trunks, mostly
    // outside road shoulders to preserve sightlines and collision readability.
    const treeRows = [
      { x: -68, startZ: 55, count: 18, step: 31 },
      { x: 175, startZ: 80, count: 20, step: 33 },
      { x: -150, startZ: 820, count: 16, step: 34 },
      { x: 35, startZ: 1190, count: 9, step: 28 },
    ];
    let treeIndex = 0;
    for (const row of treeRows) for (let i = 0; i < row.count; i++) {
      const x = row.x + (i % 3 - 1) * 4;
      const z = row.startZ + i * row.step;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.48, 3.3, 5), material(0x806044));
      trunk.position.set(x, 1.65, z); trunk.name = `CampusTreeTrunk-${treeIndex}`; this.root.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(2.5 + (i % 3) * 0.45, 5.6, 5), material(i % 3 ? 0x328653 : 0x4b9a58));
      crown.position.set(x, 5.1, z); crown.castShadow = true; crown.name = `CampusTreeCrown-${treeIndex}`; this.root.add(crown);
      treeIndex++;
    }
    // Checker-paved paths around the academic forecourt and lawns.
    for (let i = 0; i < 12; i++) {
      const tile = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.07, 3.8), material(i % 2 ? 0xd7d4ca : 0xb8beb9));
      tile.position.set(-82 + i * 4, -0.28, 345); tile.name = 'CampusWalkwayTile'; this.root.add(tile);
    }
  }

  #buildCheckpoints() {
    for (const cp of CHECKPOINTS) {
      const routeIndex = Math.floor(cp.progress * (this.routePoints.length - 1));
      const p = this.routePoints[routeIndex];
      const next = this.routePoints[Math.min(routeIndex + 1, this.routePoints.length - 1)];
      const yaw = Math.atan2(next.x - p.x, next.z - p.z);
      const group = new THREE.Group();
      group.name = cp.id;
      group.position.set(p.x, 0, p.z);
      group.rotation.y = yaw;
      const color = cp.index === 11 ? 0xffdf54 : 0x66d6d0;
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.45, 6.5, 0.45), material(color)); left.position.set(-TRACK_CONFIG.ROAD_WIDTH / 2 + 0.5, 3.25, 0); group.add(left);
      const right = left.clone(); right.position.x *= -1; group.add(right);
      const top = new THREE.Mesh(new THREE.BoxGeometry(TRACK_CONFIG.ROAD_WIDTH - 0.2, 0.45, 0.45), material(color)); top.position.set(0, 6.5, 0); group.add(top);
      this.root.add(group);
      this.checkpointMeshes.push(group);
    }
  }

  #buildObstacles() {
    for (const item of OBSTACLE_DEFINITIONS) {
      let mesh;
      if (item.kind === 'cone') {
        mesh = new THREE.Mesh(new THREE.ConeGeometry(item.width * 0.48, item.height, 6), material(0xff7b35));
        mesh.position.set(item.x, item.height / 2, item.z);
      } else if (item.kind === 'debris') {
        mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), material(0x8e8b84));
        mesh.scale.set(item.width / 2, item.height / 1.6, item.depth / 2);
        mesh.position.set(item.x, item.height / 2, item.z);
      } else if (item.kind === 'pipe') {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, item.width, 8), material(0x8799a5));
        mesh.rotation.z = Math.PI / 2; mesh.position.set(item.x, item.height / 2, item.z);
      } else if (item.kind === 'planks') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(item.width, item.height, item.depth), material(0x9c6d43));
        mesh.position.set(item.x, item.height / 2, item.z);
      } else {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(item.width, item.height, item.depth), material(0xf0a63d));
        mesh.position.set(item.x, item.height / 2, item.z);
        // White reflective bands across barricades.
        const band = new THREE.Mesh(new THREE.BoxGeometry(item.width * 0.82, 0.18, item.depth + 0.02), material(0xf5f0dc));
        band.position.set(0, 0.18, 0); mesh.add(band);
      }
      mesh.name = item.id; mesh.castShadow = true; mesh.receiveShadow = true;
      this.root.add(mesh); this.obstacleMeshes.set(item.id, mesh);
    }
  }

  #buildPickups() {
    for (const item of PICKUP_DEFINITIONS) {
      const color = item.type === 'boost' ? 0x36c8ff : 0x9d79ff;
      const geometry = item.type === 'boost' ? new THREE.OctahedronGeometry(1.25) : new THREE.IcosahedronGeometry(1.15, 0);
      const mesh = new THREE.Mesh(geometry, material(color, { roughness: 0.35 }));
      mesh.position.set(item.x, item.y, item.z);
      mesh.name = item.id; mesh.castShadow = true;
      this.root.add(mesh); this.pickupMeshes.set(item.id, mesh);
    }
  }

  #buildStartGrid() {
    const start = this.routePoints[0];
    const forward = this.routePoints[1].clone().sub(start).normalize();
    const yaw = Math.atan2(forward.x, forward.z);
    this.startTransforms = [-5.2, -1.75, 1.75, 5.2].map((lateral, index) => {
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);
      return { position: { x: start.x + rightX * lateral, y: 0.15, z: start.z + rightZ * lateral - 9 }, yaw, slot: index };
    });
    for (const transform of this.startTransforms) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.035, 0.5), material(0xf8f4d8));
      line.position.set(transform.position.x, 0.04, transform.position.z + 8);
      line.rotation.y = transform.yaw;
      this.root.add(line);
    }
  }

  #buildFinishGate() {
    const p = this.routePoints[this.routePoints.length - 1];
    addBox(this.root, { x: p.x - 9, y: 0, z: p.z, width: 0.65, height: 7, depth: 0.65, color: 0xf2d44c, name: 'FinishPostLeft' });
    addBox(this.root, { x: p.x + 9, y: 0, z: p.z, width: 0.65, height: 7, depth: 0.65, color: 0xf2d44c, name: 'FinishPostRight' });
    addBox(this.root, { x: p.x, y: 6.5, z: p.z, width: 18.5, height: 0.8, depth: 0.7, color: 0x252a30, name: 'FinishHeader' });
  }

  #buildDebug() {
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(this.routePoints.map(p => new THREE.Vector3(p.x, 0.18, p.z)));
    const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0xff3dce }));
    line.name = 'DebugCenterline'; this.debugGroup.add(line);
    this.routePoints.forEach((p, index) => {
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.7, 6, 4), material(0xff3dce));
      marker.position.set(p.x, 0.35, p.z); marker.name = `CenterlinePoint-${index}`; this.debugGroup.add(marker);
    });
    this.debugGroup.visible = false;
  }

  getRoot() { return this.root; }
  getRoutePoints() { return this.routePoints; }
  getObstacleMeshes() { return this.obstacleMeshes; }
  getPickupMeshes() { return this.pickupMeshes; }
  getStartTransforms() { return this.startTransforms.map(t => ({ ...t, position: { ...t.position } })); }
}

export function findNearestRoutePoint(position, routePoints) {
  return nearestRouteIndex(position, routePoints);
}
