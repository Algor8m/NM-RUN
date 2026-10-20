const $ = (id) => document.getElementById(id);
export class SettingsUI {
  constructor({ onQuality, onEffects, onAudio } = {}) { this.onQuality = onQuality; this.onEffects = onEffects; this.onAudio = onAudio; this.visible = false; $('quality-select')?.addEventListener('change', e => this.onQuality?.(e.target.value)); $('effects-toggle')?.addEventListener('change', e => this.onEffects?.(e.target.checked)); $('audio-toggle')?.addEventListener('change', e => this.onAudio?.(e.target.checked)); }
  toggle(force) { this.visible = force === undefined ? !this.visible : Boolean(force); $('settings-panel')?.classList.toggle('hidden', !this.visible); return this.visible; }
  setQuality(value) { if ($('quality-select')) $('quality-select').value = value; }
  dispose() {}
}
