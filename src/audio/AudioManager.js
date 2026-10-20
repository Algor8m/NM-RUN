/** Lightweight synthesized effects. AudioContext is created/resumed only from a user gesture. */
export class AudioManager {
  constructor() { this.context = null; this.enabled = true; this.master = null; this.boostOsc = null; this.boostGain = null; }
  async activate() {
    if (!this.enabled) return false;
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) return false;
    if (!this.context) { this.context = new Ctx(); this.master = this.context.createGain(); this.master.gain.value = 0.22; this.master.connect(this.context.destination); }
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context.state === 'running';
  }
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.enabled ? 0.22 : 0, this.context.currentTime, 0.04);
    if (!this.enabled) this.stopBoost();
  }
  tone({ frequency = 440, endFrequency = frequency, duration = 0.12, type = 'sine', volume = 0.35, delay = 0 } = {}) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const t = this.context.currentTime + delay, osc = this.context.createOscillator(), gain = this.context.createGain();
    osc.type = type; osc.frequency.setValueAtTime(Math.max(1, frequency), t); osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), t + duration);
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + 0.015); gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain); gain.connect(this.master); osc.start(t); osc.stop(t + duration + 0.02);
  }
  jump() { this.tone({ frequency: 260, endFrequency: 720, duration: 0.16, type: 'triangle', volume: 0.25 }); }
  debrisHit() { this.tone({ frequency: 145, endFrequency: 48, duration: 0.22, type: 'sawtooth', volume: 0.28 }); this.tone({ frequency: 720, endFrequency: 220, duration: 0.1, type: 'square', volume: 0.08, delay: 0.015 }); }
  finish() { [523, 659, 784, 1047].forEach((frequency, i) => this.tone({ frequency, endFrequency: frequency * 1.01, duration: 0.32, type: 'triangle', volume: 0.2, delay: i * 0.11 })); }
  startBoost() {
    if (!this.enabled || !this.context || this.context.state !== 'running' || this.boostOsc) return;
    this.boostOsc = this.context.createOscillator(); this.boostGain = this.context.createGain();
    this.boostOsc.type = 'sawtooth'; this.boostOsc.frequency.value = 72; this.boostGain.gain.value = 0.0001;
    this.boostOsc.connect(this.boostGain); this.boostGain.connect(this.master); this.boostOsc.start();
    this.boostGain.gain.setTargetAtTime(0.055, this.context.currentTime, 0.12);
  }
  stopBoost() {
    if (!this.boostOsc || !this.context) return;
    const osc = this.boostOsc, gain = this.boostGain; this.boostOsc = null; this.boostGain = null;
    gain.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.04);
    try { osc.stop(this.context.currentTime + 0.18); } catch { /* already stopped */ }
  }
  dispose() { this.stopBoost(); if (this.context && this.context.state !== 'closed') this.context.close(); this.context = null; this.master = null; }
}
