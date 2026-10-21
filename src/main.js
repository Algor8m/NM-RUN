import * as THREE from 'three';
import { GAME_CONFIG, getServerUrl } from './shared/config.js';
import { CLIENT_EVENTS, SERVER_EVENTS } from './shared/events.js';
import { LobbyUI } from './ui/LobbyUI.js';
import { HUD } from './ui/HUD.js';
import { ResultsUI } from './ui/ResultsUI.js';
import { SettingsUI } from './ui/SettingsUI.js';
import { AudioManager } from './audio/AudioManager.js';
import { CameraEffects } from './effects/CameraEffects.js';
import { CHECKPOINTS, STARTING_GRID_SLOTS } from './track/TrackData.js';

const $ = (id) => document.getElementById(id);
const status = { track: false, player: false, network: false };
const app = {
  running: true,
  scene: null,
  camera: null,
  renderer: null,
  track: null,
  player: null,
  network: null,
  PlayerClass: null,
  localPlayerId: null,
  playerSlot: 0,
  lastFrame: 0,
  raceStarted: false,
  pausedOverlay: false,
  controls: Object.create(null),
  remotePlayers: new Map(),
  lastNetworkSend: 0,
  quality: 'balanced',
  previousBoosting: false,
  currentLap: 1,
  totalLaps: 2,
  lastCheckpointIndex: -1,
  dnfInterval: null
};

const audio = new AudioManager();
let lobby, hud, results, settings, cameraEffects, toastTimer;

function toast(message) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

function setStatus(message, type = 'info') {
  console[type === 'error' ? 'error' : 'info'](`[NM Run] ${message}`);
  if (type === 'error') toast(message);
}

function showPause(force) {
  app.pausedOverlay = force === undefined ? !app.pausedOverlay : Boolean(force);
  $('pause-panel')?.classList.toggle('hidden', !app.pausedOverlay);
}

function safePosition(entity) {
  const state = entity?.getState?.() ?? entity?.state ?? entity;
  const pos = state?.position ?? entity?.position ?? entity?.mesh?.position;
  if (pos && Number.isFinite(Number(pos.x)) && Number.isFinite(Number(pos.y)) && Number.isFinite(Number(pos.z))) {
    return { x: Number(pos.x), y: Number(pos.y), z: Number(pos.z) };
  }
  return null;
}

function safeYaw(entity) {
  const state = entity?.getState?.() ?? entity?.state ?? entity;
  const rot = state?.rotation ?? entity?.rotation ?? entity?.mesh?.rotation;
  if (Number.isFinite(Number(rot))) return Number(rot);
  if (Number.isFinite(Number(rot?.y))) return Number(rot.y);
  return 0;
}

function stateOf(entity) {
  try {
    return entity?.getState?.() ?? entity?.state ?? {};
  } catch {
    return {};
  }
}

function setupRenderer() {
  const mount = $('renderer-mount');
  app.scene = new THREE.Scene();
  app.scene.background = new THREE.Color(0x9bc5d2);
  app.scene.fog = new THREE.Fog(0x9bc5d2, 120, 480);

  app.camera = new THREE.PerspectiveCamera(
    66,
    Math.max(1, mount.clientWidth) / Math.max(1, mount.clientHeight),
    0.1,
    900
  );

  app.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  app.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, app.quality === 'high' ? 1.75 : app.quality === 'low' ? 1 : 1.35));
  app.renderer.setSize(mount.clientWidth || window.innerWidth, mount.clientHeight || window.innerHeight);
  app.renderer.outputColorSpace = THREE.SRGBColorSpace;
  app.renderer.shadowMap.enabled = app.quality !== 'low';
  app.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  mount.replaceChildren(app.renderer.domElement);

  app.scene.add(new THREE.HemisphereLight(0xe6f8ff, 0x405344, 2.0));
  const sun = new THREE.DirectionalLight(0xfff2d2, 2.3);
  sun.position.set(-35, 70, 24);
  sun.castShadow = app.quality !== 'low';
  sun.shadow.mapSize.set(1024, 1024);
  app.scene.add(sun);

  cameraEffects = new CameraEffects(app.camera);
  // BUG 2 & 3 FIX: Removed addBootstrapBackdrop() so there is NO dark green overlapping patch.
  window.addEventListener('resize', resizeRenderer);
}

function resizeRenderer() {
  if (!app.renderer || !app.camera) return;
  const mount = $('renderer-mount');
  const width = Math.max(1, mount.clientWidth), height = Math.max(1, mount.clientHeight);
  app.camera.aspect = width / height;
  app.camera.updateProjectionMatrix();
  app.renderer.setSize(width, height, false);
}

function setQuality(value) {
  app.quality = value;
  if (!app.renderer) return;
  const ratio = value === 'high' ? 1.75 : value === 'low' ? 1 : 1.35;
  app.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratio));
  app.renderer.shadowMap.enabled = value !== 'low';
  const light = app.scene.children.find(o => o.isDirectionalLight);
  if (light) light.castShadow = value !== 'low';
  resizeRenderer();
}

async function loadTrack() {
  try {
    const mod = await import('./track/TrackWorld.js');
    const TrackWorld = mod.TrackWorld ?? mod.default;
    if (typeof TrackWorld !== 'function') throw new Error('TrackWorld.js must export TrackWorld or a default constructor.');
    app.track = new TrackWorld();
    app.track.build(app.scene);
    status.track = true;
    setStatus('Person 1 track module loaded.');
  } catch (error) {
    status.track = false;
    setStatus(`Track module unavailable: ${error.message}.`, 'error');
  }
}

async function loadPlayer() {
  try {
    const mod = await import('./player/Player.js').catch(async () => await import('./player/PlayerController.js'));
    const PlayerType = mod.Player ?? mod.PlayerController ?? mod.default;
    if (typeof PlayerType !== 'function') throw new Error('Player module missing Player/PlayerController export.');
    app.PlayerClass = PlayerType;

    const validCharacters = ['Tanishi', 'Yash', 'Anjali', 'Ritam'];
    const typedName = $('player-name')?.value?.trim() || 'Racer';

    // BUG 1 FIX: Selected avatar directly determines player skin
    const dropdownChar = $('avatar-select')?.value;
    const chosenCharacter = validCharacters.find(c => c.toLowerCase() === (dropdownChar || '').toLowerCase()) || 'Ritam';

    const playerOptions = {
      peerId: 'local',
      name: typedName,
      playerName: typedName,
      character: chosenCharacter,
      scene: app.scene,
      track: app.track,
      config: GAME_CONFIG,
      isLocal: true
    };

    app.player = new PlayerType(playerOptions);
    app.player.character = chosenCharacter;
    app.player.selectedCharacter = chosenCharacter;

    if (typeof app.player.setControlsEnabled === 'function') {
      app.player.setControlsEnabled(false);
    }

    if (typeof app.player.setCharacter === 'function') {
      app.player.setCharacter(chosenCharacter);
    }

    if (app.player.mesh && !app.scene.children.includes(app.player.mesh)) {
      app.scene.add(app.player.mesh);
    } else if (typeof app.player.build === 'function') {
      app.player.build(app.scene);
    }

    const slotIdx = app.playerSlot || 0;
    const startSlot = STARTING_GRID_SLOTS[slotIdx] || STARTING_GRID_SLOTS[0];
    if (startSlot) {
      if (typeof app.player.teleportTo === 'function') {
        app.player.teleportTo(startSlot);
      } else if (app.player.mesh) {
        app.player.mesh.position.set(startSlot.position.x, startSlot.position.y, startSlot.position.z);
        app.player.mesh.rotation.y = startSlot.yaw || 0;
      }
    }

    status.player = true;
    setStatus(`Player loaded: ${typedName} as ${chosenCharacter}`);
  } catch (error) {
    status.player = false;
    setStatus(`Player module unavailable: ${error.message}`, 'error');
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
    if (!NetworkType) throw new Error('NetworkClient.js missing export.');
    const url = getServerUrl();
    app.network = new NetworkType();
    lobby.setNetworkClient(app.network);
    results.setNetworkClient(app.network);

    const onConnected = () => {
      status.network = true;
      lobby.setConnection('connected');
      const errEl = $('lobby-error');
      if (errEl) errEl.textContent = '';
      setStatus(`Connected to ${url}`);
    };

    const onError = (error) => {
      status.network = false;
      lobby.setConnection('error', `Cannot reach ${url}. ${error?.message || ''}`);
    };

    subscribe(app.network, 'connect', onConnected);
    subscribe(app.network, 'connected', onConnected);
    subscribe(app.network, 'connect_error', onError);
    subscribe(app.network, 'error', onError);
    subscribe(app.network, 'disconnect', reason => {
      status.network = false;
      lobby.setConnection('disconnected', `Disconnected: ${reason || ''}`);
    });

    // BUG 1 FIX: Synchronize local player's model with server-confirmed character
    subscribe(app.network, SERVER_EVENTS.LOBBY_UPDATE, payload => {
      app.localPlayerId = payload?.playerId ?? payload?.selfId ?? payload?.you?.id ?? app.network.playerId ?? app.localPlayerId;
      if (payload?.you?.slot !== undefined) {
        app.playerSlot = payload.you.slot;
        const startSlot = STARTING_GRID_SLOTS[app.playerSlot] || STARTING_GRID_SLOTS[0];
        if (app.player && !app.raceStarted && startSlot) {
          app.player.teleportTo?.(startSlot);
        }
      }
      if (payload?.you?.character && app.player && app.player.selectedCharacter !== payload.you.character) {
        app.player.character = payload.you.character;
        app.player.selectedCharacter = payload.you.character;
        if (typeof app.player.setCharacter === 'function') {
          app.player.setCharacter(payload.you.character);
        }
      }
      lobby.handleLobby(payload);
    });

    subscribe(app.network, SERVER_EVENTS.RACE_COUNTDOWN, payload => {
      $('countdown-panel')?.classList.remove('hidden');
      const count = payload?.seconds ?? payload?.count ?? 3;
      const val = $('countdown-value');
      if (val) val.textContent = String(count);
      audio?.countdownTick();
      hud?.message('Get ready!', 0);
    });

    subscribe(app.network, SERVER_EVENTS.RACE_START, payload => {
      $('countdown-panel')?.classList.add('hidden');$('dnf-banner')?.classList.add('hidden');
      app.raceStarted = true;
      app.currentLap = 1;
      app.lastCheckpointIndex = -1;

      const lapEl = $('hud-lap');
      if (lapEl) lapEl.textContent = `1 / ${app.totalLaps}`;

      hud?.start();
      lobby?.showRace();
      hud?.message('GO!');
      audio?.countdownGo();
      audio?.activate();

      if (typeof app.player?.setControlsEnabled === 'function') {
        app.player.setControlsEnabled(true);
      }
      if (app.player) {
        app.player.controlsEnabled = true;
        app.player.canMove = true;
      }
    });

    subscribe(app.network, SERVER_EVENTS.PLAYER_STATE, payload => handleRemoteState(payload));
    subscribe(app.network, SERVER_EVENTS.RACE_RANKING, payload => hud?.setRankings(payload, app.localPlayerId));

    subscribe(app.network, 'race:first_finisher', payload => {
      const banner = $('dnf-banner');
      const secsEl = $('dnf-seconds');
      if (banner && secsEl) {
        banner.classList.remove('hidden');
        let remaining = payload.timeoutSeconds || 30;
        secsEl.textContent = String(remaining);
        clearInterval(app.dnfInterval);
        app.dnfInterval = setInterval(() => {
          remaining--;
          if (remaining >= 0) secsEl.textContent = String(remaining);
          else clearInterval(app.dnfInterval);
        }, 1000);
      }
      hud?.message(`${payload.winnerName || 'Winner'} finished! 30s remaining!`, 4000);
    });

    subscribe(app.network, SERVER_EVENTS.RACE_FINISH, payload => {
      hud?.message(payload?.message || 'Finish line crossed!', 0);
      audio?.finish();
    });

    subscribe(app.network, SERVER_EVENTS.RACE_RESULTS, payload => {
      app.raceStarted = false;
      clearInterval(app.dnfInterval);
      $('dnf-banner')?.classList.add('hidden');
      hud?.stop();
      results?.show(payload);
      audio?.finish();
    });

    subscribe(app.network, SERVER_EVENTS.SERVER_ERROR, payload => lobby?.handleServerError(payload));

    if (typeof app.network.connect === 'function') {
      await app.network.connect(url);
      onConnected();
    }
  } catch (error) {
    status.network = false;
    lobby?.setConnection('error', `Network unavailable: ${error.message}`);
    setStatus(`Networking not connected: ${error.message}`, 'error');
  }
}

function getFormattedInput() {
  return {
    forward: Boolean(app.controls['KeyW'] || app.controls['ArrowUp']),
    backward: Boolean(app.controls['KeyS'] || app.controls['ArrowDown']),
    back: Boolean(app.controls['KeyS'] || app.controls['ArrowDown']),
    left: Boolean(app.controls['KeyA'] || app.controls['ArrowLeft']),
    right: Boolean(app.controls['KeyD'] || app.controls['ArrowRight']),
    jump: Boolean(app.controls['Space']),
    dodge: Boolean(app.controls['ControlLeft'] || app.controls['ControlRight']),
    boost: Boolean(app.controls['ShiftLeft'] || app.controls['ShiftRight'])
  };
}

function updateCheckpointsAndLaps(pos) {
  if (!app.raceStarted || !pos) return;

  const nextIdx = (app.lastCheckpointIndex + 1) % CHECKPOINTS.length;
  const targetCp = CHECKPOINTS[nextIdx];

  if (targetCp) {
    const dx = targetCp.x - pos.x;
    const dz = targetCp.z - pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 22.0) {
      if (app.lastCheckpointIndex === CHECKPOINTS.length - 1 && nextIdx === 0) {
        app.currentLap += 1;
        audio?.lapComplete();
        const lapEl = $('hud-lap');
        if (lapEl) lapEl.textContent = `${Math.min(app.currentLap, app.totalLaps)} / ${app.totalLaps}`;
        hud?.message(`LAP ${app.currentLap}!`, 2000);
      }
      app.lastCheckpointIndex = nextIdx;
    }
  }
}

function handleRemoteState(payload) {
  if (!payload) return;
  const states = Array.isArray(payload) ? payload : payload.players ?? [payload];

  for (const state of states) {
    const id = state.peerId ?? state.playerId ?? state.id;
    if (!id || id === app.localPlayerId || id === app.network?.playerId || state.isLocal) continue;

    let remote = app.remotePlayers.get(id);

    const validCharacters = ['Tanishi', 'Yash', 'Anjali', 'Ritam'];
    let peerChar = state.character;
    if (!peerChar || !validCharacters.includes(peerChar)) {
      peerChar = validCharacters.find(c => c.toLowerCase() === (state.name || '').toLowerCase()) || 'Anjali';
    }

    if (!remote) {
      if (app.PlayerClass) {
        remote = new app.PlayerClass({
          peerId: id,
          name: state.name || peerChar,
          character: peerChar,
          isLocal: false
        });

        remote.selectedCharacter = peerChar;

        if (typeof remote.setCharacter === 'function') {
          remote.setCharacter(peerChar);
        }

        if (remote.mesh && !app.scene.children.includes(remote.mesh)) {
          app.scene.add(remote.mesh);
        }
      }
      app.remotePlayers.set(id, remote);
    } else {
      if (peerChar && remote.selectedCharacter !== peerChar) {
        remote.selectedCharacter = peerChar;
        if (typeof remote.setCharacter === 'function') {
          remote.setCharacter(peerChar);
        }
      }
    }

    if (remote && typeof remote.applyRemoteState === 'function') {
      remote.applyRemoteState(state);
    }
  }
}

function bindGlobalControls() {
  window.addEventListener('keydown', async event => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
    app.controls[event.code] = true;
    if (event.code === 'Escape') {
      if (!settings.visible) showPause();
      else settings.toggle(false);
    }
    if (['Space', 'ShiftLeft', 'ControlLeft'].includes(event.code)) {
      await audio.activate();
    }
    if (event.code === 'Space') audio.jump();
  });

  window.addEventListener('keyup', event => {
    app.controls[event.code] = false;
  });

  window.addEventListener('blur', () => {
    for (const key of Object.keys(app.controls)) app.controls[key] = false;
  });

  $('resume-race')?.addEventListener('click', () => showPause(false));
  $('pause-settings')?.addEventListener('click', () => settings.toggle(true));$('pause-leave')?.addEventListener('click', () => {
    app.network?.leaveRoom?.();
    showPause(false);
    app.raceStarted = false;
    audio?.stopMusic();
    lobby.showMenu();
  });
  $('rematch-request')?.addEventListener('click', () => audio.activate());$('return-menu')?.addEventListener('click', () => {
    app.raceStarted = false;
    audio?.stopMusic();
    lobby.showMenu();
  });
}

function sendStateIfDue(now) {
  if (!app.raceStarted || !app.network?.sendPlayerState || now - app.lastNetworkSend < 1000 / GAME_CONFIG.NETWORK_SEND_RATE_HZ) return;
  const state = stateOf(app.player);
  if (!state || !Object.keys(state).length) return;

  // BUG 1 FIX: Always broadcast the exact assigned avatar name
  const selectedChar = app.player?.selectedCharacter || $('avatar-select')?.value || 'Ritam';
  state.name = $('player-name')?.value || 'Racer';
  state.character = selectedChar;
  state.lastCheckpointIndex = app.lastCheckpointIndex;
  state.lap = app.currentLap;

  const lapFraction = Math.max(0, app.currentLap - 1);
  const totalUnits = app.totalLaps * CHECKPOINTS.length;
  const completedUnits = (lapFraction * CHECKPOINTS.length) + Math.max(0, app.lastCheckpointIndex);
  state.progress = Math.min(99.9, Math.max(0, (completedUnits / totalUnits) * 100));

  app.network.sendPlayerState(state);
  app.lastNetworkSend = now;
}

function frame(now) {
  if (!app.running) return;
  const dt = app.lastFrame ? Math.min(0.05, Math.max(0, (now - app.lastFrame) / 1000)) : 0;
  app.lastFrame = now;

  try {
    app.track?.update?.(dt);

    if (app.player && typeof app.player.update === 'function') {
      const input = getFormattedInput();
      app.player.update(dt, input, app.track);
    }

    const state = stateOf(app.player);
    const pos = safePosition(app.player);

    if (pos) {
      updateCheckpointsAndLaps(pos);
      cameraEffects?.update(dt, pos, safeYaw(app.player), Boolean(state.boosting));
    }

    hud?.update(dt, state);

    if (Boolean(state.boosting) !== app.previousBoosting) {
      if (state.boosting) audio.startBoost();
      else audio.stopBoost();
      app.previousBoosting = Boolean(state.boosting);
    }

    sendStateIfDue(now);

    for (const remote of app.remotePlayers.values()) {
      if (typeof remote.update === 'function') {
        remote.update(dt, null, null);
      } else if (typeof remote.updateVisual === 'function') {
        remote.updateVisual(dt);
      }
    }

    app.renderer?.render(app.scene, app.camera);
  } catch (error) {
    console.error('[NM Run] Frame update failed:', error);
  }

  requestAnimationFrame(frame);
}

async function init() {
  setupRenderer();
  hud = new HUD({ onPause: () => showPause(true) });
  results = new ResultsUI({
    network: null,
    onReturnMenu: () => {
      audio?.stopMusic();
      lobby.showMenu();
    },
    toast
  });
  lobby = new LobbyUI({
    network: null,
    audio,
    onSettings: force => settings.toggle(force),
    onLeave: () => {
      app.raceStarted = false;
      audio?.stopMusic();
    },
    onCharacterChange: (chosenCharacter) => {
      if (app.player) {
        app.player.character = chosenCharacter;
        app.player.selectedCharacter = chosenCharacter;
        if (typeof app.player.setCharacter === 'function') {
          app.player.setCharacter(chosenCharacter);
        }
        toast(`Selected character: ${chosenCharacter}`);
      }
    },
    toast
  });
  settings = new SettingsUI({
    onQuality: setQuality,
    onEffects: value => cameraEffects?.setEnabled(value),
    onAudio: value => audio.setEnabled(value)
  });

  bindGlobalControls();
  await loadTrack();
  await loadPlayer();
  await setupNetwork();

  if (!status.track || !status.player || !status.network) {
    const missing = [
      !status.track && 'track (P1)',
      !status.player && 'player (P2)',
      !status.network && 'network/server (P3)'
    ].filter(Boolean).join(', ');
    lobby.setConnection(status.network ? 'connected' : 'error', `Integration incomplete: ${missing}.`);
  }

  app.lastFrame = performance.now();
  requestAnimationFrame(frame);

  window.addEventListener('beforeunload', () => {
    app.running = false;
    audio.dispose();
    hud.dispose();
    settings.dispose();
    app.renderer?.dispose();
  });
}

init().catch(error => {
  console.error('[NM Run] Fatal startup error:', error);
  toast(`Startup failed: ${error.message}`);
});