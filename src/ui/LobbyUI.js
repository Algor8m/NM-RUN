import { CLIENT_EVENTS, SERVER_EVENTS } from '../shared/events.js';

const $ = (id) => document.getElementById(id);
function on(target, event, fn) { target?.addEventListener(event, fn); }
function first(obj, keys, fallback = undefined) { for (const key of keys) if (obj?.[key] !== undefined) return obj[key]; return fallback; }

/** Lobby presentation and intent forwarding. It never invents remote players or connection status. */
export class LobbyUI {
  constructor({ network, audio, onRaceStart, onSettings, onLeave, toast }) {
    this.network = network; this.audio = audio; this.onRaceStart = onRaceStart; this.onSettings = onSettings; this.onLeave = onLeave; this.toast = toast;
    this.playerName = 'Racer'; this.room = null; this.isHost = false; this.ready = false; this.connected = false; this.bind();
  }
  bind() {
    on($('create-room'), 'click', async () => { await this.audio?.activate(); if (!this.connected || !this.network) return this.error('lobby-error', 'Not connected to the game server yet.'); this.playerName = this.readName(); this.network.createRoom?.(this.playerName); });
    on($('join-room'), 'click', async () => { await this.audio?.activate(); if (!this.connected || !this.network) return this.error('lobby-error', 'Not connected to the game server yet.'); this.playerName = this.readName(); const code = $('room-code-input')?.value.trim().toUpperCase(); if (!code) return this.error('lobby-error', 'Enter a room code first.'); this.network.joinRoom?.(code, this.playerName); });
    on($('room-code-input'), 'input', () => { const el = $('room-code-input'); if (el) el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); });
    on($('ready-toggle'), 'click', () => { this.ready = !this.ready; this.network?.setReady?.(this.ready); $('ready-toggle').textContent = this.ready ? 'Cancel ready' : "I'm ready"; });
    on($('start-race'), 'click', () => this.network?.requestStartRace?.());
    on($('copy-room-code'), 'click', async () => { const code = $('room-code')?.textContent; if (!code || code === '----') return; try { await navigator.clipboard.writeText(code); this.toast?.('Room code copied'); } catch { this.toast?.(`Room code: ${code}`); } });
    on($('leave-room'), 'click', () => { this.network?.leaveRoom?.(); this.room = null; this.ready = false; this.showMenu(); this.onLeave?.(); });
    on($('settings-open'), 'click', () => this.onSettings?.());
    on($('settings-close'), 'click', () => this.onSettings?.(false));
  }
  readName() { const name = $('player-name')?.value.trim().replace(/\s+/g, ' ').slice(0, 20); if (!name) { this.error('lobby-error', 'Enter a racer name.'); return 'Racer'; } $('player-name').value = name; return name; }
  setConnection(state, message = '') {
    this.connected = state === 'connected'; const dot = $('connection-dot'), label = $('connection-label');
    dot?.classList.toggle('connected', this.connected); dot?.classList.toggle('error', state === 'error');
    if (label) label.textContent = this.connected ? 'Connected' : state === 'connecting' ? 'Connecting…' : state === 'error' ? 'Connection error' : 'Not connected';
    if (!$('room-panel')?.classList.contains('hidden') && message) this.error('room-error', message);
    if ($('lobby-summary')) $('lobby-summary').textContent = this.connected ? 'Server connected. Ready to race.' : message || 'Connect to the game server to begin.';
    if (!$('lobby-panel')?.classList.contains('hidden') && !this.connected) this.error('lobby-error', message || 'The game server is not connected.');
  }
  handleLobby(payload = {}) {
    this.room = payload.room ?? payload;
    const selfId = payload.playerId ?? payload.selfId ?? payload.you?.id;
    const hostFlag = payload.isHost === true || payload.youAreHost === true || payload.host === true;
    this.isHost = hostFlag || Boolean(selfId && (this.room?.hostId === selfId || this.room?.host?.id === selfId));
    const playersRaw = first(this.room, ['players', 'members'], []); const players = Array.isArray(playersRaw) ? playersRaw : Object.values(playersRaw || {});
    this.ready = Boolean(players.find(p => (p.id ?? p.playerId) === selfId)?.ready ?? this.ready);
    $('room-code').textContent = first(this.room, ['code', 'roomCode', 'id'], '----'); $('player-count').textContent = `${players.length} / 4`;
    $('player-list').replaceChildren();
    if (!players.length) { const li = document.createElement('li'); li.className = 'empty-player'; li.textContent = 'Waiting for lobby player data…'; $('player-list').append(li); }
    for (const p of players.slice(0, 4)) {
      const li = document.createElement('li'); li.className = 'player-row';
      const avatar = document.createElement('span'); avatar.className = 'player-avatar'; avatar.textContent = String(p.name || 'R').slice(0, 1).toUpperCase();
      const nameWrap = document.createElement('span'); nameWrap.className = 'player-name'; nameWrap.textContent = p.name || 'Racer';
      const meta = document.createElement('small'); meta.className = 'player-meta'; meta.textContent = p.isHost || p.id === this.room?.hostId ? 'HOST' : 'RACER'; nameWrap.append(meta);
      const state = document.createElement('span'); state.className = `player-state${p.ready ? ' ready' : ''}`; state.textContent = p.ready ? 'READY' : 'NOT READY';
      li.append(avatar, nameWrap, state); $('player-list').append(li);
    }
    const host = this.isHost;
    $('start-race').disabled = !host || players.length < 2 || players.some(p => !p.ready);
    $('start-race').title = !host ? 'Only the room host can start' : players.length < 2 ? 'At least two human players are required' : players.some(p => !p.ready) ? 'All connected players must be ready' : 'Start race';
    $('ready-toggle').textContent = this.ready ? 'Cancel ready' : "I'm ready";
    this.showRoom();
  }
  handleServerError(payload) {
    const message = typeof payload === 'string' ? payload : first(payload, ['message', 'error', 'code'], 'Server returned an error.');
    const code = typeof payload === 'object' ? String(first(payload, ['code', 'type'], '')).toLowerCase() : '';
    const text = code.includes('full') ? 'This room is full (maximum 4 racers).' : code.includes('invalid') || code.includes('not_found') ? 'That room code is invalid or no longer active.' : code.includes('host') ? 'Only the room host can do that.' : message;
    const target = this.room ? 'room-error' : 'lobby-error'; this.error(target, text); this.toast?.(text);
  }
  error(id, message) { const el = $(id); if (el) el.textContent = message || ''; }
  showMenu() { $('lobby-panel')?.classList.remove('hidden'); $('room-panel')?.classList.add('hidden'); $('race-hud')?.classList.add('hidden'); $('standings-panel')?.classList.add('hidden'); $('results-panel')?.classList.add('hidden'); }
  showRoom() { $('lobby-panel')?.classList.add('hidden'); $('room-panel')?.classList.remove('hidden'); $('pause-panel')?.classList.add('hidden'); }
  showRace() { $('lobby-panel')?.classList.add('hidden'); $('room-panel')?.classList.add('hidden'); $('race-hud')?.classList.remove('hidden'); $('standings-panel')?.classList.remove('hidden'); }
  showResults() { $('race-hud')?.classList.add('hidden'); $('standings-panel')?.classList.add('hidden'); $('results-panel')?.classList.remove('hidden'); }
  setNetworkClient(network) { this.network = network; }
  static get eventNames() { return [SERVER_EVENTS.LOBBY_UPDATE, SERVER_EVENTS.SERVER_ERROR, CLIENT_EVENTS.ROOM_CREATE]; }
}
