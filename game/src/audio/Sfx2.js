export default class Sfx2 {
  constructor() {
    this.ctx = null; this.master = null; this.noise = null; this.muted = false;
    this.lastDump = -9; this.lastScoop = -9;
    const go = () => this._init();
    window.addEventListener('pointerdown', go);
    window.addEventListener('keydown', go);
    window.addEventListener('touchstart', go);
  }
  _init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.55;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const n = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }
  _ready() { return this.ctx && this.ctx.state === 'running' && !this.muted; }
  _burst(t, dur, type, f0, f1, q, vol, att) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.loop = true;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  _tone(t, f0, f1, dur, type, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  scoop() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    if (t - this.lastScoop < 0.5) return; this.lastScoop = t;
    this._burst(t, 0.45, 'bandpass', 350, 1400, 0.9, 0.35, 0.12);
    this._burst(t, 0.3, 'lowpass', 500, 150, 0.7, 0.5, 0.03);
    this._tone(t + 0.04, 110, 45, 0.25, 'sine', 0.6);
    for (let i = 0; i < 7; i++) this._burst(t + 0.05 + Math.random() * 0.4, 0.05, 'bandpass', 1800 + Math.random() * 2200, 900, 3, 0.12 * (1 - i / 10), 0.004);
  }
  dump() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    if (t - this.lastDump < 1.5) return; this.lastDump = t;
    for (let i = 0; i < 16; i++) this._burst(t + i * 0.045 + Math.random() * 0.03, 0.07, 'bandpass', 2200 + Math.random() * 2500, 1200, 2.5, 0.16 * (1 - i / 22), 0.004);
    this._burst(t, 0.7, 'lowpass', 600, 120, 0.7, 0.3, 0.1);
    this._tone(t + 0.35, 95, 38, 0.35, 'sine', 0.8);
    this._tone(t + 0.35, 230, 120, 0.12, 'triangle', 0.25);
    this._burst(t + 0.35, 0.18, 'bandpass', 1400, 500, 1.2, 0.35, 0.005);
  }
  coin() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime + 0.45;
    this._tone(t, 988, 988, 0.22, 'sine', 0.25);
    this._tone(t + 0.09, 1319, 1319, 0.45, 'sine', 0.25);
  }
  complete() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime + 0.3, notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this._tone(t + i * 0.11, f, f, i === 3 ? 0.7 : 0.25, 'triangle', 0.3));
  }
  click() { if (this._ready()) this._tone(this.ctx.currentTime, 700, 500, 0.05, 'sine', 0.15); }
  setMuted(m) { this.muted = !!m; }
}
