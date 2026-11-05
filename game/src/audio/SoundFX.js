export default class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._unlocked = false;
    this._noiseBuffer = null;
    this._engine = null;
    this._engineSpeed = 0;
    this._pendingEngine = null;

    this._onFirstGesture = this._onFirstGesture.bind(this);
    window.addEventListener('pointerdown', this._onFirstGesture, { once: false });
    window.addEventListener('keydown', this._onFirstGesture, { once: false });
    window.addEventListener('touchstart', this._onFirstGesture, { once: false });
  }

  _onFirstGesture() {
    if (this._unlocked) return;
    this._unlocked = true;
    window.removeEventListener('pointerdown', this._onFirstGesture);
    window.removeEventListener('keydown', this._onFirstGesture);
    window.removeEventListener('touchstart', this._onFirstGesture);
    this._init();
    if (this._pendingEngine !== null) {
      const s = this._pendingEngine;
      this._pendingEngine = null;
      this.setEngine(s);
    }
  }

  _init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this._buildNoise();
  }

  _buildNoise() {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * 1.2);
    const buffer = this.ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this._noiseBuffer = buffer;
  }

  _resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  _now() {
    return this.ctx.currentTime;
  }

  _noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;
    return src;
  }

  scoop() {
    if (!this.ctx) return;
    this._resume();
    const t = this._now();
    const src = this._noiseSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    filter.frequency.setValueAtTime(1800, t);
    filter.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + 0.34);
  }

  dump() {
    if (!this.ctx) return;
    this._resume();
    const t = this._now();
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.35);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.7, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.47);

    const src = this._noiseSource();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.35, t + 0.04);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(lp);
    lp.connect(ng);
    ng.connect(this.master);
    src.start(t);
    src.stop(t + 0.52);
  }

  coin() {
    if (!this.ctx) return;
    this._resume();
    const t = this._now();
    const freqs = [1318.5, 1760];
    for (let i = 0; i < freqs.length; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      const start = t + i * 0.06;
      osc.frequency.setValueAtTime(freqs[i], start);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.28, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(g);
      g.connect(this.master);
      osc.start(start);
      osc.stop(start + 0.24);
    }
  }

  complete() {
    if (!this.ctx) return;
    this._resume();
    const t = this._now();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    for (let i = 0; i < notes.length; i++) {
      const start = t + i * 0.13;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(notes[i], start);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.3, start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
      osc.connect(g);
      g.connect(this.master);
      osc.start(start);
      osc.stop(start + 0.3);
    }
  }

  click() {
    if (!this.ctx) return;
    this._resume();
    const t = this._now();
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.master && this.ctx) {
      const t = this._now();
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.8, t + 0.1);
    }
  }

  setEngine(speedKmh) {
    const speed = Math.max(0, Math.min(200, speedKmh || 0));
    this._engineSpeed = speed;
    if (!this.ctx) {
      this._pendingEngine = speed;
      return;
    }
    this._resume();
    const t = this._now();
    const vol = speed < 0.5 ? 0 : 0.06 + Math.min(0.14, speed / 900);
    const freq = 50 + speed * 1.9;

    if (!this._engine) {
      if (speed < 0.5) return;
      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = freq;
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 0.5;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      lp.Q.value = 0.7;
      const g = this.ctx.createGain();
      g.gain.value = 0.0001;
      osc1.connect(lp);
      osc2.connect(lp);
      lp.connect(g);
      g.connect(this.master);
      osc1.start(t);
      osc2.start(t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.25);
      this._engine = { osc1, osc2, lp, g, vol, freq };
      return;
    }

    const e = this._engine;
    e.g.gain.cancelScheduledValues(t);
    e.g.gain.setValueAtTime(e.g.gain.value, t);
    e.g.gain.linearRampToValueAtTime(vol, t + 0.12);
    e.osc1.frequency.cancelScheduledValues(t);
    e.osc1.frequency.setValueAtTime(e.osc1.frequency.value, t);
    e.osc1.frequency.linearRampToValueAtTime(Math.max(30, freq), t + 0.15);
    e.osc2.frequency.cancelScheduledValues(t);
    e.osc2.frequency.setValueAtTime(e.osc2.frequency.value, t);
    e.osc2.frequency.linearRampToValueAtTime(Math.max(20, freq * 0.5), t + 0.15);
    e.lp.frequency.cancelScheduledValues(t);
    e.lp.frequency.setValueAtTime(e.lp.frequency.value, t);
    e.lp.frequency.linearRampToValueAtTime(500 + speed * 6, t + 0.15);
    e.freq = freq;
    e.vol = vol;
  }

  _stopEngine() {
    if (!this._engine || !this.ctx) return;
    const t = this._now();
    const e = this._engine;
    e.g.gain.cancelScheduledValues(t);
    e.g.gain.setValueAtTime(e.g.gain.value, t);
    e.g.gain.linearRampToValueAtTime(0.0001, t + 0.15);
    try { e.osc1.stop(t + 0.18); } catch (err) {}
    try { e.osc2.stop(t + 0.18); } catch (err) {}
    this._engine = null;
  }
}
