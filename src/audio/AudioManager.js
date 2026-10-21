/** Lightweight synthesized sound effects and background music. AudioContext is created/resumed only from a user gesture. */
export class AudioManager {
  constructor() {
    this.context = null;
    this.enabled = true;
    this.musicEnabled = true;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.boostOsc = null;
    this.boostGain = null;
    this.musicInterval = null;
    this.musicStep = 0;
  }

  async activate() {
    if (!this.enabled) return false;
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) return false;

    if (!this.context) {
      this.context = new Ctx();
      this.master = this.context.createGain();
      this.master.gain.value = 0.28;
      this.master.connect(this.context.destination);

      this.sfxBus = this.context.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);

      this.musicBus = this.context.createGain();
      this.musicBus.gain.value = 0.22;
      this.musicBus.connect(this.master);
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    if (this.context.state === 'running' && !this.musicInterval) {
      this.startMusic();
    }

    return this.context.state === 'running';
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.enabled ? 0.28 : 0, this.context.currentTime, 0.04);
    }
    if (!this.enabled) {
      this.stopBoost();
      this.stopMusic();
    } else if (this.context && this.context.state === 'running') {
      this.startMusic();
    }
  }

  setMusicEnabled(enabled) {
    this.musicEnabled = Boolean(enabled);
    if (this.musicBus && this.context) {
      this.musicBus.gain.setTargetAtTime(this.musicEnabled ? 0.22 : 0, this.context.currentTime, 0.05);
    }
  }

  tone({ frequency = 440, endFrequency = frequency, duration = 0.12, type = 'sine', volume = 0.35, delay = 0 } = {}) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const t = this.context.currentTime + delay;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, frequency), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), t + duration);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gain);
    gain.connect(this.sfxBus || this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // --- Sound Effects ---

  jump() {
    this.tone({ frequency: 260, endFrequency: 720, duration: 0.16, type: 'triangle', volume: 0.25 });
  }

  debrisHit() {
    this.tone({ frequency: 145, endFrequency: 48, duration: 0.22, type: 'sawtooth', volume: 0.28 });
    this.tone({ frequency: 720, endFrequency: 220, duration: 0.1, type: 'square', volume: 0.08, delay: 0.015 });
  }

  obstacleHit() {
    this.debrisHit();
  }

  countdownTick() {
    this.tone({ frequency: 440, endFrequency: 440, duration: 0.08, type: 'sine', volume: 0.22 });
  }

  countdownGo() {
    this.tone({ frequency: 880, endFrequency: 1100, duration: 0.35, type: 'triangle', volume: 0.35 });
  }

  lapComplete() {
    this.tone({ frequency: 587, endFrequency: 880, duration: 0.2, type: 'triangle', volume: 0.24 });
  }

  finish() {
    [523, 659, 784, 1047].forEach((frequency, i) =>
      this.tone({ frequency, endFrequency: frequency * 1.01, duration: 0.32, type: 'triangle', volume: 0.2, delay: i * 0.11 })
    );
  }

  startBoost() {
    if (!this.enabled || !this.context || this.context.state !== 'running' || this.boostOsc) return;
    this.boostOsc = this.context.createOscillator();
    this.boostGain = this.context.createGain();
    this.boostOsc.type = 'sawtooth';
    this.boostOsc.frequency.value = 72;
    this.boostGain.gain.value = 0.0001;
    this.boostOsc.connect(this.boostGain);
    this.boostGain.connect(this.sfxBus || this.master);
    this.boostOsc.start();
    this.boostGain.gain.setTargetAtTime(0.055, this.context.currentTime, 0.12);
  }

  stopBoost() {
    if (!this.boostOsc || !this.context) return;
    const osc = this.boostOsc, gain = this.boostGain;
    this.boostOsc = null;
    this.boostGain = null;
    gain.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.04);
    try {
      osc.stop(this.context.currentTime + 0.18);
    } catch {
      /* already stopped */
    }
  }

  // --- Background Music Procedural Sequencer ---

  startMusic() {
    if (this.musicInterval || !this.context || this.context.state !== 'running') return;

    // Upbeat campus racing arpeggio pattern (Pentatonic Major scale in C/F)
    const melody = [
      261.63, 329.63, 392.00, 523.25, 392.00, 329.63, 440.00, 523.25,
      349.23, 440.00, 523.25, 659.25, 523.25, 440.00, 392.00, 329.63,
      293.66, 369.99, 440.00, 587.33, 440.00, 369.99, 392.00, 523.25,
      329.63, 392.00, 523.25, 659.25, 783.99, 659.25, 523.25, 392.00
    ];

    const bass = [
      130.81, 130.81, 174.61, 174.61,
      146.83, 146.83, 164.81, 196.00
    ];

    const noteDuration = 0.14;
    this.musicStep = 0;

    this.musicInterval = setInterval(() => {
      if (!this.enabled || !this.musicEnabled || !this.context || this.context.state !== 'running') return;

      const t = this.context.currentTime;
      const noteFreq = melody[this.musicStep % melody.length];

      // Lead note
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(noteFreq, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.04, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + noteDuration - 0.01);

      osc.connect(gain);
      gain.connect(this.musicBus || this.master);
      osc.start(t);
      osc.stop(t + noteDuration);

      // Bass note every 4 steps
      if (this.musicStep % 4 === 0) {
        const bassFreq = bass[Math.floor(this.musicStep / 4) % bass.length];
        const bassOsc = this.context.createOscillator();
        const bassGain = this.context.createGain();
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(bassFreq, t);

        bassGain.gain.setValueAtTime(0.0001, t);
        bassGain.gain.exponentialRampToValueAtTime(0.065, t + 0.03);
        bassGain.gain.exponentialRampToValueAtTime(0.0001, t + (noteDuration * 3.8));

        bassOsc.connect(bassGain);
        bassGain.connect(this.musicBus || this.master);
        bassOsc.start(t);
        bassOsc.stop(t + (noteDuration * 3.9));
      }

      this.musicStep++;
    }, noteDuration * 1000);
  }

  stopMusic() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
      this.musicStep = 0;
    }
  }

  dispose() {
    this.stopBoost();
    this.stopMusic();
    if (this.context && this.context.state !== 'closed') {
      this.context.close();
    }
    this.context = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
  }
}