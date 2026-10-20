import * as THREE from 'three';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js';
import { TrackWorld } from './TrackWorld.js';

const host = document.querySelector('#view');
const logElement = document.querySelector('#log');
const logLines = [];
function log(message) {
  logLines.unshift(message);
  logElement.textContent = logLines.slice(0, 12).join('\n');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bd4ef);
scene.fog = new THREE.Fog(0x9bd4ef, 240, 1650);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 2400);
camera.position.set(110, 125, -75);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xe5f5ff, 0x52684c, 2.0));
const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
sun.position.set(-100, 180, 160); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -180; sun.shadow.camera.right = 180; sun.shadow.camera.top = 220; sun.shadow.camera.bottom = -220;
scene.add(sun);

const grid = new THREE.GridHelper(400, 40, 0x42634e, 0x6d956d);
grid.position.y = -0.51; scene.add(grid);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 350); controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49;

const track = new TrackWorld();
track.build(scene);
document.querySelector('#length').textContent = `${track.getTotalLength().toLocaleString()} units`;
document.querySelector('#checkpoints').textContent = String(track.getCheckpointCount());
document.querySelector('#obstacles').textContent = String(track.getObstacleBounds().length);
document.querySelector('#pickups').textContent = String(track.getPickupSpawns().length);
log(`Built track: ${track.getTotalLength()} world units.`);
log(`Checkpoint count: ${track.getCheckpointCount()}; last is ${track.getCheckpoint(11).id}.`);
log(`Start slots: ${track.getStartTransforms().length}.`);

let debugVisible = false;
document.querySelector('#debugBtn').addEventListener('click', event => {
  debugVisible = !debugVisible; track.setDebugVisible(debugVisible);
  event.currentTarget.classList.toggle('active', debugVisible);
  log(`Debug centerline ${debugVisible ? 'visible' : 'hidden'}.`);
});

document.querySelector('#topBtn').addEventListener('click', event => {
  const topDown = event.currentTarget.dataset.top === 'true';
  if (topDown) {
    camera.position.set(110, 125, -75); controls.target.set(0, 0, 350);
    event.currentTarget.dataset.top = 'false'; event.currentTarget.textContent = 'Top-down view';
  } else {
    camera.position.set(0, 1550, 690); controls.target.set(0, 0, 700);
    event.currentTarget.dataset.top = 'true'; event.currentTarget.textContent = 'Perspective view';
  }
  controls.update();
});

document.querySelector('#startBtn').addEventListener('click', () => {
  const starts = track.getStartTransforms();
  for (const start of starts) {
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0xff48bb }));
    marker.position.set(start.position.x, 0.25, start.position.z); marker.name = `StartSlot-${start.slot}`; scene.add(marker);
  }
  log(`Rendered ${starts.length} start-slot markers (repeated clicks add markers).`);
});

document.querySelector('#pickupBtn').addEventListener('click', () => {
  const first = track.getPickupSpawns()[0];
  const currentlyActive = first.active;
  track.setPickupActive(first.id, !currentlyActive);
  log(`${first.id} active=${!currentlyActive}.`);
});

document.querySelector('#checkBtn').addEventListener('click', () => {
  const points = track.getCenterline();
  let passed = 0;
  for (const p of points) {
    const progress = track.getProgress(p, -1);
    if (Number.isFinite(progress) && progress >= 0 && progress <= 1) passed++;
  }
  const initial = track.getProgress(points[0], -1);
  const finalWithoutCheckpoint = track.getProgress(points[points.length - 1], -1);
  const finalWithAcceptedGates = track.getProgress(points[points.length - 1], 10);
  log(`Progress check: ${passed}/${points.length} finite route samples; start=${initial.toFixed(3)}, end(no gates)=${finalWithoutCheckpoint.toFixed(3)}, end(after CP11)=${finalWithAcceptedGates.toFixed(3)}.`);
});

document.querySelector('#resetBtn').addEventListener('click', () => {
  camera.position.set(110, 125, -75); controls.target.set(0, 0, 350); controls.update();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
});
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  track.update(delta);
  controls.update();
  renderer.render(scene, camera);
}
animate();
