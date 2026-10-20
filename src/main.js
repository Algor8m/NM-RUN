import * as THREE from 'three';
import { GAME_CONFIG, getServerUrl } from './shared/config.js';
import { CLIENT_EVENTS, SERVER_EVENTS } from './shared/events.js';
import { LobbyUI } from './ui/LobbyUI.js';
import { HUD } from './ui/HUD.js';
import { ResultsUI } from './ui/ResultsUI.js';
import { SettingsUI } from './ui/SettingsUI.js';
import { AudioManager } from './audio/AudioManager.js';
import { CameraEffects } from './effects/CameraEffects.js';

const $ = (id) => document.getElementById(id);
const status = { track: false, player: false, network: false };
const app = { running: true, scene: null, camera: null, renderer: null, track: null, player: null, network: null, networkModule: null, localPlayerId: null, lastFrame: 0, raceStarted: false, pausedOverlay: false, controls: Object.create(null), remotePlayers: new Map(), lastNetworkSend: 0, quality: 'balanced', previousBoosting: false };
const audio = new AudioManager();
let lobby, hud, results, settings, cameraEffects, toastTimer;

function toast(message) {
  const el = $('toast'); if (!el) return; el.textContent = message; el.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}
function setStatus(message, type = 'info') { console[type === 'error' ? 'error' : 'info'](`[NM Run] ${message}`); if (type === 'error') toast(message); }
function showPause(force) { app.pausedOverlay = force === undefined ? !app.pausedOverlay : Boolean(force); $('pause-panel')?.classList.toggle('hidden', !app.pausedOverlay); }
function safePosition(entity) {
  const state = entity?.getState?.() ?? entity?.state ?? entity;
  const pos = state?.position ?? entity?.position ?? entity?.mesh?.position;
  if (pos && Number.isFinite(Number(pos.x)) && Number.isFinite(Number(pos.y)) && Number.isFinite(Number(pos.z))) return { x: Number(pos.x), y: Number(pos.y), z: Number(pos.z) };
  return null;
}
function safeYaw(entity) { const state = entity?.getState?.() ?? entity?.state ?? entity; const rot = state?.rotation ?? entity?.rotation ?? entity?.mesh?.rotation; if (Number.isFinite(Number(rot))) return Number(rot); if (Number.isFinite(Number(rot?.y))) return Number(rot.y); return 0; }
function stateOf(entity) { try { return entity?.getState?.() ?? entity?.state ?? {}; } catch { return {}; } }
function addBootstrapBackdrop() {
  // Only a visual fallback when Person 1's track module is absent; this is not the course implementation.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ color: 0x2a594b, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.15; ground.name = 'P4 integration-preview ground'; app.scene.add(ground);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(16, 180), new THREE.MeshStandardMaterial({ color: 0x354352, roughness: 0.95 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, -0.1, -35); app.scene.add(road);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xc8ff42 });
  for (let z = -115; z < 55; z += 12) { const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 4), stripeMat); stripe.rotation.x = -Math.PI / 2; stripe.position.set(0, -0.08, z); app.scene.add(stripe); }
  const label = document.createElement('div'); label.style.cssText = 'position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);padding:9px 13px;border-radius:9px;background:#101722cc;border:1px solid #ffffff33;color:#c8ff42;font:700 11px Inter,sans-serif;letter-spacing:.12em;pointer-events:none'; label.textContent = 'P4 INTEGRATION PREVIEW · TRACK MODULE NOT LOADED'; $('game-viewport').append(label); app.previewLabel = label;
}
function setupRenderer() {
  const mount = $('renderer-mount'); app.scene = new THREE.Scene(); app.scene.background = new THREE.Color(0x9bc5d2); app.scene.fog = new THREE.Fog(0x9bc5d2, 95, 310);
  app.camera = new THREE.PerspectiveCamera(66, Math.max(1, mount.clientWidth) / Math.max(1, mount.clientHeight), 0.1, 700);
  app.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  app.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, app.quality === 'high' ? 1.75 : app.quality === 'low' ? 1 : 1.35));
  app.renderer.setSize(mount.clientWidth || window.innerWidth, mount.clientHeight || window.innerHeight);
  app.renderer.outputColorSpace = THREE.SRGBColorSpace; app.renderer.shadowMap.enabled = app.quality !== 'low'; app.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.replaceChildren(app.renderer.domElement);
  app.scene.add(new THREE.HemisphereLight(0xe6f8ff, 0x405344, 2.0));
  const sun = new THREE.DirectionalLight(0xfff2d2, 2.3); sun.position.set(-35, 70, 24); sun.castShadow = app.quality !== 'low'; sun.shadow.mapSize.set(1024, 1024); app.scene.add(sun);
  cameraEffects = new CameraEffects(app.camera);
  addBootstrapBackdrop();
  window.addEventListener('resize', resizeRenderer);
}
function resizeRenderer() {
  if (!app.renderer || !app.camera) return; const mount = $('renderer-mount'); const width = Math.max(1, mount.clientWidth), height = Math.max(1, mount.clientHeight);
  app.camera.aspect = width / height; app.camera.updateProjectionMatrix(); app.renderer.setSize(width, height, false);
}
function setQuality(value) {
  app.quality = value; if (!app.renderer) return;
  const ratio = value === 'high' ? 1.75 : value === 'low' ? 1 : 1.35;
  app.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratio)); app.renderer.shadowMap.enabled = value !== 'low';
  const light = app.scene.children.find(o => o.isDirectionalLight); if (light) light.castShadow = value !== 'low';
  resizeRenderer();
}
async function loadTrack() {
  try {
    const mod = await import('./track/TrackWorld.js');
    const TrackWorld = mod.TrackWorld ?? mod.default;
    if (typeof TrackWorld !== 'function') throw new Error('TrackWorld.js must export TrackWorld or a default constructor.');
    app.track = new TrackWorld();
app.track.build(app.scene);
    status.track = true; app.previewLabel?.remove(); app.previewLabel = null;
    setStatus('Person 1 track module loaded.');
  } catch (error) {
    status.track = false; setStatus(`Track module unavailable: ${error.message}. Showing a labelled integration preview, not the final track.`, 'error');
  }
}
async function loadPlayer() {
  try {
    const mod = await import('./player/PlayerController.js');
    const PlayerType = mod.PlayerController ?? mod.Player ?? mod.default;
    if (typeof PlayerType !== 'function') throw new Error('PlayerController.js must export PlayerController, Player, or a default constructor.');
    const playerOptions = { peerId: 'local', playerName: $('player-name')?.value || 'Racer', scene: app.scene, track: app.track, config: GAME_CONFIG, isLocal: true };
    app.player = new PlayerType(playerOptions);
    if (typeof app.player.build === 'function') app.player.build(app.scene);
    status.player = true; setStatus('Person 2 player module loaded.');
  } catch (error) {
    status.player = false; setStatus(`Player module unavailable: ${error.message}. Player gameplay is not active until Person 2 files are integrated.`, 'error');
  }
}
function subscribe(network, event, handler) {
  if (typeof network?.on === 'function') network.on(event, handler);
  else if (typeof network?.subscribe === 'function') network.subscribe(event, handler);
  else if (typeof network?.addEventListener === 'function') network.addEventListener(event, handler);
}
async function setupNetwork() {
  lobby.setConnection('connecting', 'Connecting to the game server…');
  try {
    const mod = await import('./network/NetworkClient.js');
    const NetworkType = mod.NetworkClient ?? mod.default;
    if (typeof NetworkType !== 'function') throw new Error('NetworkClient.js must export NetworkClient or a default constructor.');
    const url = getServerUrl(); app.network = new NetworkType(); lobby.setNetworkClient(app.network); results.setNetworkClient(app.network);
    subscribe(app.network, 'connect', () => { status.network = true; lobby.setConnection('connected'); setStatus(`Connected to ${url}`); });
    subscribe(app.network, 'disconnect', reason => { status.network = false; lobby.setConnection('disconnected', `Disconnected from server${reason ? `: ${reason}` : ''}. Reconnect or reload.`); });
    subscribe(app.network, 'connect_error', error => { status.network = false; lobby.setConnection('error', `Cannot reach ${url}. Check that Person 3's server is running and CORS permits this client. ${error?.message || ''}`); });
    subscribe(app.network, SERVER_EVENTS.LOBBY_UPDATE, payload => { app.localPlayerId = payload?.playerId ?? payload?.selfId ?? payload?.you?.id ?? app.localPlayerId; lobby.handleLobby(payload); });
    subscribe(app.network, SERVER_EVENTS.RACE_COUNTDOWN, payload => { $('countdown-panel').classList.remove('hidden'); $('countdown-value').textContent = String(payload?.seconds ?? payload?.count ?? GAME_CONFIG.COUNTDOWN_SECONDS); hud.message('Get ready!', 0); });
    subscribe(app.network, SERVER_EVENTS.RACE_START, payload => { $('countdown-panel').classList.add('hidden'); app.raceStarted = true; hud.start(); lobby.showRace(); hud.message('GO!'); app.raceStartPayload = payload; });
    subscribe(app.network, SERVER_EVENTS.PLAYER_STATE, payload => handleRemoteState(payload));
    subscribe(app.network, SERVER_EVENTS.RACE_RANKING, payload => hud.setRankings(payload, app.localPlayerId));
    subscribe(app.network, SERVER_EVENTS.RACE_FINISH, payload => { hud.message(payload?.message || 'Finish line crossed!', 0); });
    subscribe(app.network, SERVER_EVENTS.RACE_RESULTS, payload => { app.raceStarted = false; hud.stop(); results.show(payload); audio.finish(); });
    subscribe(app.network, SERVER_EVENTS.SERVER_ERROR, payload => lobby.handleServerError(payload));
    if (typeof app.network.connect === 'function') await app.network.connect(url);
    else throw new Error('NetworkClient must expose connect(serverUrl).');
    // Connection status is set only by the actual Socket.IO 'connect' event.
  } catch (error) {
    status.network = false; lobby.setConnection('error', `Network module/server unavailable: ${error.message}. Ensure Person 3's NetworkClient.js is present and the Node server is running.`);
    setStatus(`Networking not connected: ${error.message}`, 'error');
  }
}
function handleRemoteState(payload) {
  if (!payload) return;
  const states = Array.isArray(payload) ? payload : payload.players ?? [payload];
  for (const state of states) {
    const id = state.peerId ?? state.playerId ?? state.id; if (!id) continue;
    if (id === app.localPlayerId || state.isLocal) continue;
    const existing = app.remotePlayers.get(id);
    if (existing && typeof existing.applyRemoteState === 'function') existing.applyRemoteState(state);
    else if (app.player?.constructor && typeof app.player.applyRemoteState === 'function') {
      // P2 may expose a visual factory; do not instantiate an undocumented remote controller.
      if (typeof app.player.createRemotePlayer === 'function') { const remote = app.player.createRemotePlayer(state); remote?.applyRemoteState?.(state); app.remotePlayers.set(id, remote); }
    }
  }
}
function bindGlobalControls() {
  window.addEventListener('keydown', async event => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    app.controls[event.code] = true;
    if (event.code === 'Escape') { if (!settings.visible) showPause(); else settings.toggle(false); }
    if (['Space', 'ShiftLeft', 'ControlLeft'].includes(event.code)) await audio.activate();
    if (event.code === 'Space') audio.jump();
  });
  window.addEventListener('keyup', event => { app.controls[event.code] = false; });
  window.addEventListener('blur', () => { for (const key of Object.keys(app.controls)) app.controls[key] = false; });
  $('resume-race')?.addEventListener('click', () => showPause(false));
  $('pause-settings')?.addEventListener('click', () => settings.toggle(true));
  $('pause-leave')?.addEventListener('click', () => { app.network?.leaveRoom?.(); showPause(false); app.raceStarted = false; lobby.showMenu(); });
  $('rematch-request')?.addEventListener('click', () => audio.activate());
  $('return-menu')?.addEventListener('click', () => { app.raceStarted = false; lobby.showMenu(); });
}
function sendStateIfDue(now) {
  if (!app.raceStarted || !app.network?.sendPlayerState || now - app.lastNetworkSend < 1000 / GAME_CONFIG.NETWORK_SEND_RATE_HZ) return;
  const state = stateOf(app.player); if (!state || !Object.keys(state).length) return;
  app.network.sendPlayerState(state); app.lastNetworkSend = now;
}
function frame(now) {
  if (!app.running) return;
  const dt = app.lastFrame ? Math.min(0.05, Math.max(0, (now - app.lastFrame) / 1000)) : 0; app.lastFrame = now;
  try {
    app.track?.update?.(dt);
    if (app.player && typeof app.player.update === 'function') app.player.update(dt, app.controls, app.track);
    const state = stateOf(app.player), pos = safePosition(app.player);
    if (pos) cameraEffects?.update(dt, pos, safeYaw(app.player), Boolean(state.boosting));
    hud?.update(dt, state);
    if (Boolean(state.boosting) !== app.previousBoosting) { if (state.boosting) audio.startBoost(); else audio.stopBoost(); app.previousBoosting = Boolean(state.boosting); }
    sendStateIfDue(now);
    for (const remote of app.remotePlayers.values()) remote?.updateVisual?.(dt);
    app.renderer?.render(app.scene, app.camera);
  } catch (error) { console.error('[NM Run] Frame update failed:', error); }
  requestAnimationFrame(frame);
}
async function init() {
  setupRenderer();
  hud = new HUD({ onPause: () => showPause(true) });
  results = new ResultsUI({ network: null, onReturnMenu: () => { lobby.showMenu(); }, toast });
  lobby = new LobbyUI({ network: null, audio, onSettings: force => settings.toggle(force), onLeave: () => { app.raceStarted = false; }, toast });
  settings = new SettingsUI({ onQuality: setQuality, onEffects: value => cameraEffects?.setEnabled(value), onAudio: value => audio.setEnabled(value) });
  bindGlobalControls();
  await loadTrack();
  await loadPlayer();
  await setupNetwork();
  if (!status.track || !status.player || !status.network) {
    const missing = [!status.track && 'track (P1)', !status.player && 'player (P2)', !status.network && 'network/server (P3)'].filter(Boolean).join(', ');
    lobby.setConnection(status.network ? 'connected' : 'error', `Integration incomplete: ${missing}. Add the assigned modules; no fake racers are created.`);
  }
  app.lastFrame = performance.now(); requestAnimationFrame(frame);
  window.addEventListener('beforeunload', () => { app.running = false; audio.dispose(); hud.dispose(); settings.dispose(); app.renderer?.dispose(); });
}

init().catch(error => { console.error('[NM Run] Fatal startup error:', error); toast(`Startup failed: ${error.message}`); });
