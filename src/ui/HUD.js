const $ = (id) => document.getElementById(id);
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(Number(n)) ? Number(n) : min));
function listFrom(payload) { if (Array.isArray(payload)) return payload; return payload?.rankings ?? payload?.standings ?? payload?.players ?? payload?.results ?? []; }

/** Purely displays server ranking events and local player telemetry. */
export class HUD {
  constructor({ onPause } = {}) { this.startedAt = null; this.elapsed = 0; this.running = false; this.onPause = onPause; document.getElementById('pause-open')?.addEventListener('click', () => this.onPause?.()); }
  start() { this.startedAt = performance.now(); this.elapsed = 0; this.running = true; this.show(); }
  stop() { this.running = false; }
  show() { $('race-hud')?.classList.remove('hidden'); $('standings-panel')?.classList.remove('hidden'); }
  update(dt, state = {}) {
    if (this.running) this.elapsed += Math.max(0, Math.min(0.1, dt || 0));
    const endurance = clamp(state.endurance ?? state.health ?? 100), boost = clamp(state.boost ?? 0);
    if ($('endurance-value')) $('endurance-value').textContent = `${Math.round(endurance)}%`; if ($('endurance-fill')) $('endurance-fill').style.width = `${endurance}%`;
    if ($('boost-value')) $('boost-value').textContent = `${Math.round(boost)}%`; if ($('boost-fill')) $('boost-fill').style.width = `${boost}%`;
    if ($('hud-segment')) $('hud-segment').textContent = state.segment ?? state.zone ?? 'Campus circuit';
    if ($('hud-timer')) $('hud-timer').textContent = this.formatTime(state.raceTime ?? this.elapsed);
    if (state.positionRank != null && $('hud-position')) $('hud-position').innerHTML = `${Math.max(1, Math.min(4, Number(state.positionRank)))}<small> / 4</small>`;
  }
  setRankings(payload, localPlayerId = null) {
    const players = listFrom(payload); const ol = $('standings-list'); if (!ol) return;
    ol.replaceChildren();
    const sorted = [...players].slice(0, 4);
    sorted.forEach((p, index) => {
      const li = document.createElement('li'); li.className = 'standing-row';
      const rank = document.createElement('span'); rank.className = 'standing-rank'; rank.textContent = String(p.rank ?? p.place ?? index + 1).padStart(2, '0');
      const name = document.createElement('span'); name.className = 'standing-name'; name.textContent = p.name ?? p.playerName ?? 'Racer';
      const progress = document.createElement('span'); progress.className = 'standing-progress';
      const pct = Number(p.progressPercent ?? p.progress); progress.textContent = Number.isFinite(pct) ? `${Math.round(pct <= 1 ? pct * 100 : pct)}%` : '';
      if (localPlayerId && (p.id === localPlayerId || p.playerId === localPlayerId)) name.textContent += ' (YOU)';
      li.append(rank, name, progress); ol.append(li);
    });
    if (!sorted.length) { const li = document.createElement('li'); li.className = 'standing-row'; li.textContent = 'Waiting for server standings…'; ol.append(li); }
  }
  message(text, duration = 2200) { const el = $('race-message'); if (!el) return; el.textContent = text; el.classList.remove('hidden'); if (duration > 0) { clearTimeout(this.messageTimer); this.messageTimer = setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, duration); } }
  setPosition(rank) { if (rank == null || !Number.isFinite(Number(rank))) return; $('hud-position').innerHTML = `${Math.max(1, Math.min(4, Number(rank)))}<small> / 4</small>`; }
  formatTime(seconds) { const s = Math.max(0, Number(seconds) || 0); const minutes = Math.floor(s / 60), whole = Math.floor(s % 60), tenth = Math.floor((s % 1) * 10); return `${String(minutes).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${tenth}`; }
  dispose() { clearTimeout(this.messageTimer); }
}
