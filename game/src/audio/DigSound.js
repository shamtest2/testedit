export default class DigSound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.muted = false;
    this._unlocked = false;
    this._noise = null;

    this._onGesture = this._onGesture.bind(this);
    window.addEventListener('pointerdown', this._onGesture);
    window.addEventListener('keydown', this._onGesture);
  }

  _onGesture() {
    if (this._unlocked) return;
    this._unlocked = true;
    window.removeEventListener('pointerdown', this._onGesture);
    window.removeEventListener('keydown', this._onGesture);
    this._init();
  }

  _init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;
    this.comp.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.comp);

    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * 2);
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
  }

  _resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  _now() {
    return this.ctx.currentTime;
  }

  _noiseSrc() {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    s.loop = true;
    return s;
  }

  setMuted(m) {
    this.muted = !!m;
    if (!this.ctx || !this.master) return;
    const t = this._now();
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.5, t + 0.12);
  }

  _whine(t0, t1, f0, f1, vol) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.linearRampToValueAtTime(f1, t1);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f0 * 2.5, t0);
    lp.frequency.linearRampToValueAtTime(f1 * 2.2, t1);
    lp.Q.value = 2.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.12, (t1 - t0) * 0.3));
    g.gain.setValueAtTime(vol, Math.max(t0 + 0.13, t1 - 0.12));
    g.gain.linearRampToValueAtTime(0.0001, t1);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t1 + 0.02);

    const hum = this.ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.setValueAtTime(f0 * 0.5, t0);
    hum.frequency.linearRampToValueAtTime(f1 * 0.5, t1);
    const hg = this.ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t0);
    hg.gain.linearRampToValueAtTime(vol * 0.35, t0 + 0.15);
    hg.gain.linearRampToValueAtTime(0.0001, t1);
    hum.connect(hg);
    hg.connect(this.master);
    hum.start(t0);
    hum.stop(t1 + 0.02);
  }

  _rumble(t0, t1, f, vol, wobble) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t0);
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = wobble || 5;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = f * 0.08;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.08);
    g.gain.setValueAtTime(vol, Math.max(t0 + 0.09, t1 - 0.1));
    g.gain.linearRampToValueAtTime(0.0001, t1);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    lfo.start(t0);
    osc.stop(t1 + 0.02);
    lfo.stop(t1 + 0.02);
  }

  _scrape(t0, t1, fA, fB, vol, ticks) {
    const src = this._noiseSrc();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(fA, t0);
    bp.frequency.linearRampToValueAtTime(fB, t1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.1);
    g.gain.linearRampToValueAtTime(0.0001, t1);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t1 + 0.02);

    const n = ticks || 12;
    const span = t1 - t0;
    for (let i = 0; i < n; i++) {
      const tt = t0 + (i / n) * span + Math.random() * (span / n);
      this._tick(tt, 0.035 + Math.random() * 0.03, 1400 + Math.random() * 2200);
    }
  }

  _tick(t, vol, freq) {
    const src = this._noiseSrc();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.02);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.07);
  }

  _thump(t, f0, f1, dur, vol) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);

    const src = this._noiseSrc();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 800;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(vol * 0.5, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(lp);
    lp.connect(ng);
    ng.connect(this.master);
    src.start(t);
    src.stop(t + 0.14);
  }

  _clank(t, vol) {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(230, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.24);

    const src = this._noiseSrc();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 3;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(vol * 0.6, t + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(this.master);
    src.start(t);
    src.stop(t + 0.12);
  }

  scoop() {
    if (!this.ctx) { this._unlocked = true; this._init(); }
    if (!this.ctx) return;
    this._resume();
    const t = this._now();

    this._whine(t + 0.0, t + 0.8, 180, 420 + Math.random() * 30, 0.06);
    this._rumble(t + 0.8, t + 1.3, 60, 0.09, 4 + Math.random() * 2);
    this._scrape(t + 1.3, t + 1.9, 400, 1800, 0.14, 10 + Math.floor(Math.random() * 5));
    this._thump(t + 1.9, 100, 40, 0.3, 0.22);
    this._whine(t + 1.9, t + 3.0, 320, 200, 0.05);

    const ticks = 8;
    for (let i = 0; i < ticks; i++) {
      const tt = t + 2.0 + (i / ticks) * 0.9;
      this._tick(tt, 0.02 * (1 - i / ticks), 1800 + Math.random() * 2600);
    }
  }

  dump() {
    if (!this.ctx) { this._unlocked = true; this._init(); }
    if (!this.ctx) return;
    this._resume();
    const t = this._now();

    this._whine(t + 0.0, t + 0.8, 200, 460 + Math.random() * 30, 0.06);

    const src = this._noiseSrc();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 6;
    bp.frequency.setValueAtTime(500, t + 0.8);
    bp.frequency.linearRampToValueAtTime(1200, t + 1.2);
    bp.frequency.linearRampToValueAtTime(700, t + 1.6);
    const cg = this.ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t + 0.8);
    cg.gain.linearRampToValueAtTime(0.05, t + 1.0);
    cg.gain.linearRampToValueAtTime(0.0001, t + 1.6);
    src.connect(bp);
    bp.connect(cg);
    cg.connect(this.master);
    src.start(t + 0.8);
    src.stop(t + 1.62);

    const pour = this._noiseSrc();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(2800, t + 1.3);
    hp.frequency.linearRampToValueAtTime(3600, t + 2.3);
    hp.Q.value = 0.9;
    const pg = this.ctx.createGain();
    pg.gain.setValueAtTime(0.0001, t + 1.3);
    pg.gain.linearRampToValueAtTime(0.09, t + 1.6);
    pg.gain.linearRampToValueAtTime(0.05, t + 2.0);
    pg.gain.linearRampToValueAtTime(0.0001, t + 2.3);
    pour.connect(hp);
    hp.connect(pg);
    pg.connect(this.master);
    pour.start(t + 1.3);
    pour.stop(t + 2.32);

    this._rumble(t + 1.3, t + 2.3, 45, 0.06, 6);

    const grains = 22;
    for (let i = 0; i < grains; i++) {
      const tt = t + 1.3 + Math.random() * 1.0;
      this._tick(tt, 0.02 + Math.random() * 0.02, 2200 + Math.random() * 3000);
    }

    this._thump(t + 1.9, 90, 35, 0.35, 0.26);
    this._clank(t + 1.9, 0.12);

    this._whine(t + 2.2, t + 3.0, 340, 180, 0.045);
  }
}
