const $ = (id) => document.getElementById(id);
export class ResultsUI {
  constructor({ network, onReturnMenu, toast } = {}) { this.network = network; this.onReturnMenu = onReturnMenu; this.toast = toast; $('rematch-request')?.addEventListener('click', () => this.network?.requestRematch?.()); $('return-menu')?.addEventListener('click', () => { this.network?.leaveRoom?.(); this.hide(); this.onReturnMenu?.(); }); }
  setNetworkClient(network) { this.network = network; }
  show(payload = {}) {
    $('results-panel')?.classList.remove('hidden'); $('race-hud')?.classList.add('hidden'); $('standings-panel')?.classList.add('hidden');
    const results = Array.isArray(payload) ? payload : payload.results ?? payload.rankings ?? payload.players ?? [];
    const list = $('results-list'); list.replaceChildren();
    results.slice(0, 4).forEach((p, index) => {
      const li = document.createElement('li'); li.className = 'result-row';
      const place = document.createElement('span'); place.className = 'result-place'; place.textContent = String(p.rank ?? p.place ?? index + 1).padStart(2, '0');
      const name = document.createElement('span'); name.className = 'result-player'; name.textContent = p.name ?? p.playerName ?? 'Racer';
      const time = document.createElement('span'); time.className = 'result-time'; const t = p.finishTime ?? p.time ?? p.elapsedSeconds; time.textContent = Number.isFinite(Number(t)) ? `${Number(t).toFixed(2)} s` : '';
      li.append(place, name, time); list.append(li);
    });
    if (!results.length) { const li = document.createElement('li'); li.className = 'empty-player'; li.textContent = 'The server has not supplied result rows yet.'; list.append(li); }
    $('results-subtitle').textContent = payload.verified === false ? 'Results received; verification status not supplied by server.' : 'Finish order received from the server';
  }
  hide() { $('results-panel')?.classList.add('hidden'); }
  error(message) { $('results-error').textContent = message || ''; }
}
