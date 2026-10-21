import { CLIENT_EVENTS, SERVER_EVENTS } from '../shared/events.js';
import { GAME_CONFIG } from '../shared/config.js';

const $ = (id) => document.getElementById(id);
function on(target, event, fn) { target?.addEventListener(event, fn); }
function first(obj, keys, fallback = undefined) {
  for (const key of keys) {
    if (obj?.[key] !== undefined) return obj[key];
  }
  return fallback;
}

/** Lobby presentation and intent forwarding. Enforces unique avatar selections per room. */
export class LobbyUI {
  constructor({ network, audio, onRaceStart, onSettings, onLeave, onCharacterChange, toast }) {
    this.network = network;
    this.audio = audio;
    this.onRaceStart = onRaceStart;
    this.onSettings = onSettings;
    this.onLeave = onLeave;
    this.onCharacterChange = onCharacterChange;
    this.toast = toast;
    this.playerName = 'Racer';
    this.room = null;
    this.isHost = false;
    this.ready = false;
    this.connected = false;
    this.bind();
  }

  bind() {
    on($('create-room'), 'click', async () => {
      await this.audio?.activate();
      if (!this.connected || !this.network) {
        return this.error('lobby-error', 'Not connected to the game server yet.');
      }
      this.playerName = this.readName();
      const preferredAvatar = $('avatar-select')?.value || 'Ritam';
      this.network.createRoom?.(this.playerName, preferredAvatar);
    });

    on($('join-room'), 'click', async () => {
      await this.audio?.activate();
      if (!this.connected || !this.network) {
        return this.error('lobby-error', 'Not connected to the game server yet.');
      }
      this.playerName = this.readName();
      const code = $('room-code-input')?.value.trim().toUpperCase();
      if (!code) {
        return this.error('lobby-error', 'Enter a room code first.');
      }
      const preferredAvatar = $('avatar-select')?.value || null;
      this.network.joinRoom?.(code, this.playerName, preferredAvatar);
    });

    on($('room-code-input'), 'input', () => {
      const el = $('room-code-input');
      if (el) el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    });

    on($('avatar-select'), 'change', (e) => {
      const chosen = e.target.value;
      if (typeof this.onCharacterChange === 'function') {
        this.onCharacterChange(chosen);
      }
      if (this.network?.setCharacter) {
        this.network.setCharacter(chosen);
      } else if (this.network?.socket?.emit) {
        this.network.socket.emit('player:set_character', { character: chosen });
      }
    });

    on($('ready-toggle'), 'click', () => {
      this.ready = !this.ready;
      this.network?.setReady?.(this.ready);
      const btn = $('ready-toggle');
      if (btn) btn.textContent = this.ready ? 'Cancel ready' : "I'm ready";
    });

    on($('start-race'), 'click', () => {
      this.network?.requestStartRace?.(GAME_CONFIG.DEBUG_ALLOW_SOLO);
    });

    on($('copy-room-code'), 'click', async () => {
      const code = $('room-code')?.textContent;
      if (!code || code === '----') return;
      try {
        await navigator.clipboard.writeText(code);
        this.toast?.('Room code copied');
      } catch {
        this.toast?.(`Room code: ${code}`);
      }
    });

    on($('leave-room'), 'click', () => {
      this.network?.leaveRoom?.();
      this.room = null;
      this.ready = false;
      this.showMenu();
      this.onLeave?.();
    });

    on($('settings-open'), 'click', () => this.onSettings?.());
    on($('settings-close'), 'click', () => this.onSettings?.(false));
  }

  readName() {
    const name = $('player-name')?.value.trim().replace(/\s+/g, ' ').slice(0, 15);
    if (!name) {
      this.error('lobby-error', 'Enter a racer name.');
      return 'Racer';
    }
    const input = $('player-name');
    if (input) input.value = name;
    return name;
  }

  setConnection(state, message = '') {
    this.connected = state === 'connected';
    const dot = $('connection-dot');
    const label = $('connection-label');

    dot?.classList.toggle('connected', this.connected);
    dot?.classList.toggle('error', state === 'error');

    if (label) {
      label.textContent = this.connected
        ? 'Connected'
        : state === 'connecting'
        ? 'Connecting…'
        : state === 'error'
        ? 'Connection error'
        : 'Not connected';
    }

    if (!$('room-panel')?.classList.contains('hidden') && message) {
      this.error('room-error', message);
    }
    if ($('lobby-summary')) {
      $('lobby-summary').textContent = this.connected
        ? 'Server connected. Ready to race.'
        : message || 'Connect to the game server to begin.';
    }
    if (!$('lobby-panel')?.classList.contains('hidden') && !this.connected) {
      this.error('lobby-error', message || 'The game server is not connected.');
    } else if (this.connected) {
      this.error('lobby-error', '');
    }
  }

  handleLobby(payload = {}) {
    this.room = payload.room ?? payload;
    const selfId = payload.playerId ?? payload.selfId ?? payload.you?.id ?? this.network?.playerId;
    const hostFlag = payload.isHost === true || payload.youAreHost === true || payload.host === true || payload.you?.isHost === true;
    this.isHost = hostFlag || Boolean(selfId && (this.room?.hostId === selfId || this.room?.host?.id === selfId));

    const playersRaw = first(this.room, ['players', 'members'], []);
    const players = Array.isArray(playersRaw) ? playersRaw : Object.values(playersRaw || {});

    const myPlayer = players.find(p => (p.id ?? p.playerId) === selfId);
    this.ready = Boolean(myPlayer?.isReady ?? myPlayer?.ready ?? this.ready);

    // Sync character dropdown with authoritative assigned avatar
    const myCharacter = myPlayer?.character || payload.you?.character;
    const avatarSelect = $('avatar-select');
    if (avatarSelect && myCharacter) {
      avatarSelect.value = myCharacter;
    }

    // Disable avatars already claimed by opponents
    if (avatarSelect) {
      const takenByPeers = new Set(
        players
          .filter(p => (p.id ?? p.playerId) !== selfId && p.character)
          .map(p => p.character)
      );

      for (const opt of avatarSelect.options) {
        const isTaken = takenByPeers.has(opt.value);
        opt.disabled = isTaken;
        if (isTaken && !opt.textContent.includes('(Taken)')) {
          opt.textContent = `${opt.textContent.replace(' (Taken)', '')} (Taken)`;
        } else if (!isTaken) {
          opt.textContent = opt.textContent.replace(' (Taken)', '');
        }
      }
    }

    const roomCodeEl = $('room-code');
    if (roomCodeEl) {
      roomCodeEl.textContent = first(this.room, ['code', 'roomCode', 'id'], '----');
    }

    const countEl = $('player-count');
    if (countEl) {
      countEl.textContent = `${players.length} / 4`;
    }

    const listEl = $('player-list');
    if (listEl) {
      listEl.replaceChildren();
      if (!players.length) {
        const li = document.createElement('li');
        li.className = 'empty-player';
        li.textContent = 'Waiting for lobby player data…';
        listEl.append(li);
      } else {
        for (const p of players.slice(0, 4)) {
          const isPlayerReady = Boolean(p.isReady ?? p.ready);
          const li = document.createElement('li');
          li.className = 'player-row';

          const avatar = document.createElement('span');
          avatar.className = 'player-avatar';
          avatar.textContent = String(p.character || p.name || 'R').slice(0, 1).toUpperCase();

          const nameWrap = document.createElement('span');
          nameWrap.className = 'player-name';
          nameWrap.textContent = p.name || 'Racer';

          const charTag = document.createElement('small');
          charTag.className = 'player-meta';
          charTag.style.color = '#38bdf8';
          charTag.textContent = ` [${p.character || 'Ritam'}]`;
          nameWrap.append(charTag);

          const roleTag = document.createElement('small');
          roleTag.className = 'player-meta';
          roleTag.textContent = (p.isHost || p.id === this.room?.hostId) ? 'HOST' : 'RACER';
          nameWrap.append(roleTag);

          const state = document.createElement('span');
          state.className = `player-state${isPlayerReady ? ' ready' : ''}`;
          state.textContent = isPlayerReady ? 'READY' : 'NOT READY';

          li.append(avatar, nameWrap, state);
          listEl.append(li);
        }
      }
    }

    const startBtn = $('start-race');
    if (startBtn) {
      const minPlayers = GAME_CONFIG.DEBUG_ALLOW_SOLO ? 1 : 2;
      const allReady = players.length >= minPlayers && players.every(p => Boolean(p.isReady ?? p.ready));
      startBtn.disabled = !this.isHost || !allReady;
      startBtn.title = !this.isHost
        ? 'Only the room host can start'
        : players.length < minPlayers
        ? 'At least two human players are required'
        : !allReady
        ? 'All connected players must be ready'
        : 'Start race';
    }

    const readyBtn = $('ready-toggle');
    if (readyBtn) {
      readyBtn.textContent = this.ready ? 'Cancel ready' : "I'm ready";
    }

    this.showRoom();
  }

  handleServerError(payload) {
    const message = typeof payload === 'string' ? payload : first(payload, ['message', 'error', 'code'], 'Server returned an error.');
    const code = typeof payload === 'object' ? String(first(payload, ['code', 'type'], '')).toLowerCase() : '';
    const text = code.includes('full')
      ? 'This room is full (maximum 4 racers).'
      : code.includes('invalid') || code.includes('not_found')
      ? 'That room code is invalid or no longer active.'
      : code.includes('host')
      ? 'Only the room host can do that.'
      : code.includes('taken') || message.includes('already taken')
      ? message
      : message;

    const target = this.room ? 'room-error' : 'lobby-error';
    this.error(target, text);
    this.toast?.(text);
  }

  error(id, message) {
    const el = $(id);
    if (el) el.textContent = message || '';
  }

  showMenu() {
    $('lobby-panel')?.classList.remove('hidden');$('room-panel')?.classList.add('hidden');
    $('race-hud')?.classList.add('hidden');$('standings-panel')?.classList.add('hidden');
    $('results-panel')?.classList.add('hidden');$('dnf-banner')?.classList.add('hidden');
  }

  showRoom() {
    const lobby = $('lobby-panel');
    const room = $('room-panel');
    const pause = $('pause-panel');

    if (lobby) lobby.classList.add('hidden');
    if (pause) pause.classList.add('hidden');

    if (room) {
      room.classList.remove('hidden');
      room.style.display = 'flex';
      room.style.visibility = 'visible';
    }
  }

  showRace() {
    $('lobby-panel')?.classList.add('hidden');$('room-panel')?.classList.add('hidden');
    $('race-hud')?.classList.remove('hidden');$('standings-panel')?.classList.remove('hidden');
  }

  showResults() {
    $('race-hud')?.classList.add('hidden');$('standings-panel')?.classList.add('hidden');
    $('results-panel')?.classList.remove('hidden');$('dnf-banner')?.classList.add('hidden');
  }

  setNetworkClient(network) {
    this.network = network;
  }

  static get eventNames() {
    return [SERVER_EVENTS.LOBBY_UPDATE, SERVER_EVENTS.SERVER_ERROR, CLIENT_EVENTS.ROOM_CREATE];
  }
}
