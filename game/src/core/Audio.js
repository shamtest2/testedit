// AudioHub: the ONLY audio system of TerraForm 3D.
// One AudioContext. Everything is synthesized. No files, no network.
// Tune the loudness of each group in LEVELS (one number each).

const LEVELS = {
  master: 0.9,
  music: 0.3,
  ambience: 0.22,
  engine: 0.7,
  sfx: 0.8,
  reverb: 0.4,
};

const MUTE_KEY = 'terraform_muted_v1';
const BPM = 92;
const STEP = 60 / BPM / 2; // one eighth note in seconds

let DEBUG = false;
try {
  DEBUG = !!(import.meta.env && import.meta.env.DEV) || /[?&]debug/.test(location.search);
} catch (e) { /* ignore */ }

// Debug only: count every AudioContext that gets created (should be 1).
if (DEBUG && typeof window !== 'undefined' && !window.__acWrapped) {
  window.__acWrapped = true;
  window.__acCount = 0;
  const Orig = window.AudioContext;
  if (Orig) {
    const Wrapped = function (...args) {
      window.__acCount++;
      return new Orig(...args);
    };
    Wrapped.prototype = Orig.prototype;
    window.AudioContext = Wrapped;
  }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Am - F - C - G, two bars each (16 eighth notes per chord)
const CHORDS = [
  { root: 45, notes: [57, 60, 64, 69] },
  { root: 41, notes: [57, 60, 65, 69] },
  { root: 48, notes: [55, 60, 64, 67] },
  { root: 43, notes: [55, 59, 62, 67] },
];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3];

export class AudioHub {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* ignore */ }
    this.intensity = 0;
    this._intTarget = 0;
    this._eng = { speed: 0, throttle: 0, stamp: 0, rpm: 0.12 };
    this._duckUntil = 0;
    this._loadUntil = 0;
    this._musicOn = false;
    this._ambOn = false;
    this._step = 0;
    this._nextStep = 0;
    this._nextClank = 0;
    this._nextBird = 0;
    this._nextBeep = 0;
    this._gesture = false;
    this._dbgEl = null;
    this._dbgNext = 0;
    this._bind();
    this._initDebug();
    this._timer = setInterval(() => {
      try { this._tick(); } catch (e) { /* never break the game */ }
    }, 50);
  }

  // ------------------------------------------------------------------ setup

  _bind() {
    const onGesture = () => this._onGesture();
    ['pointerdown', 'pointerup', 'keydown', 'touchend', 'click'].forEach((ev) => {
      window.addEventListener(ev, onGesture, { capture: true, passive: true });
    });
    document.addEventListener('visibilitychange', () => this._onVisibility());
    window.addEventListener('pagehide', () => this._suspend());
    window.addEventListener('pageshow', () => this._onVisibility());
  }

  _onGesture() {
    this._gesture = true;
    try {
      if (!this.ctx) this._build();
      else this._resume();
    } catch (e) { /* ignore */ }
  }

  _onVisibility() {
    if (document.hidden) this._suspend();
    else if (this._gesture) this._resume();
  }

  _suspend() {
    try {
      if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
    } catch (e) { /* ignore */ }
  }

  _resume() {
    try {
      if (this.ctx && this.ctx.state !== 'running' && !document.hidden) this.ctx.resume();
    } catch (e) { /* ignore */ }
  }

  _initDebug() {
    if (!DEBUG || typeof document === 'undefined') return;
    const make = () => {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:8px;top:104px;z-index:99999;font:14px/1.35 monospace;' +
        'color:#4ade80;background:rgba(0,0,0,0.7);padding:4px 8px;border-radius:6px;' +
        'pointer-events:none;display:none;white-space:pre';
      (document.body || document.documentElement).appendChild(el);
      this._dbgEl = el;
    };
    if (document.body) make();
    else window.addEventListener('DOMContentLoaded', make);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' && this._dbgEl) {
        this._dbgEl.style.display = this._dbgEl.style.display === 'none' ? 'block' : 'none';
      }
    });
  }

  _build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const mk = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };

    // master chain: gain -> warm low shelf -> soft high shelf -> compressor -> out
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 20;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.25;
    this.master = mk(this.muted ? 0 : LEVELS.master);
    this.warm = ctx.createBiquadFilter();
    this.warm.type = 'lowshelf';
    this.warm.frequency.value = 150;
    this.warm.gain.value = 4;
    this.soft = ctx.createBiquadFilter();
    this.soft.type = 'highshelf';
    this.soft.frequency.value = 8000;
    this.soft.gain.value = -5;
    this.master.connect(this.warm);
    this.warm.connect(this.soft);
    this.soft.connect(this.comp);
    this.comp.connect(ctx.destination);

    // reverb (synthetic room with pre-delay) = the depth
    this.reverbIn = mk(1);
    const pre = ctx.createDelay(0.2);
    pre.delayTime.value = 0.025;
    const conv = ctx.createConvolver();
    conv.buffer = this._makeIR(2.4, 2.6);
    const rOut = mk(LEVELS.reverb);
    this.reverbIn.connect(pre);
    pre.connect(conv);
    conv.connect(rOut);
    rOut.connect(this.master);

    // buses
    this.musicBus = mk(LEVELS.music);
    this.duckGain = mk(1);
    this.musicBus.connect(this.duckGain);
    this.duckGain.connect(this.master);
    this.ambBus = mk(LEVELS.ambience);
    this.engBus = mk(LEVELS.engine);
    this.sfxBus = mk(LEVELS.sfx);
    this.ambBus.connect(this.master);
    this.engBus.connect(this.master);
    this.sfxBus.connect(this.master);
    const send = (bus, amt) => { const s = mk(amt); bus.connect(s); s.connect(this.reverbIn); };
    send(this.sfxBus, 0.45);
    send(this.musicBus, 0.4);
    send(this.ambBus, 0.35);
    send(this.engBus, 0.12);

    // noise buffers
    this.whiteBuf = this._noiseBuffer(false);
    this.brownBuf = this._noiseBuffer(true);

    this._buildEngine();
    this._buildAmbience();
    this._buildMusicFx();

    this._musicOn = true;
    this._ambOn = true;
    this._step = 0;
    this._nextStep = ctx.currentTime + 0.15;
    this._nextClank = ctx.currentTime + 6;
    this._nextBird = ctx.currentTime + 4;

    if (document.hidden) ctx.suspend();
    else ctx.resume();
  }

  _noiseBuffer(brown) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        d[i] = w;
      }
    }
    return buf;
  }

  _makeIR(sec, decay) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * sec);
    const buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * (0.6 - 0.5 * t); // tail gets darker
        d[i] = lp * Math.pow(1 - t, decay);
      }
      // early reflections: gives a feeling of walls and space
      [0.011, 0.019, 0.029, 0.043, 0.061, 0.083].forEach((tt, k) => {
        const idx = Math.floor(tt * sr * (c ? 1.07 : 1));
        if (idx < len) d[idx] += (k % 2 ? -1 : 1) * 0.7 / (1 + k * 0.5);
      });
    }
    return buf;
  }

  _curve(k) {
    const n = 256;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * k);
    }
    return c;
  }

  _pulseWave() {
    const n = 40;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    for (let i = 1; i < n; i++) re[i] = Math.exp(-i / 14);
    return this.ctx.createPeriodicWave(re, im);
  }

  _loopSrc(buf) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    return s;
  }

  _go(s) { s.start(0, Math.random() * 2); }

  _buildEngine() {
    const ctx = this.ctx;
    const mk = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const e = (this.eng = {});

    // core tone: two saws plus a sub sine, pushed through a shaper for harmonics
    e.a = ctx.createOscillator(); e.a.type = 'sawtooth'; e.a.frequency.value = 40;
    e.b = ctx.createOscillator(); e.b.type = 'sawtooth'; e.b.frequency.value = 80.8;
    e.sub = ctx.createOscillator(); e.sub.type = 'sine'; e.sub.frequency.value = 40;
    const ga = mk(0.5), gb = mk(0.14), gs = mk(0.45);
    e.shaper = ctx.createWaveShaper();
    e.shaper.curve = this._curve(3);
    e.shaper.oversample = '2x';
    e.lp = ctx.createBiquadFilter();
    e.lp.type = 'lowpass';
    e.lp.frequency.value = 600;
    e.lp.Q.value = 0.9;
    e.body = ctx.createBiquadFilter();
    e.body.type = 'peaking';
    e.body.frequency.value = 240;
    e.body.gain.value = 6;
    e.body.Q.value = 0.8;
    e.chug = mk(0.55);
    e.out = mk(0);

    // the diesel knock: sharp pulses that make the chug-chug-chug
    e.knock = ctx.createOscillator();
    e.knock.setPeriodicWave(this._pulseWave());
    e.knock.frequency.value = 7;
    const kd = mk(0.4);
    e.knock.connect(kd);
    kd.connect(e.chug.gain);

    e.a.connect(ga); ga.connect(e.shaper);
    e.b.connect(gb); gb.connect(e.shaper);
    e.shaper.connect(e.lp);
    e.sub.connect(gs); gs.connect(e.lp);
    e.lp.connect(e.body);
    e.body.connect(e.chug);
    e.chug.connect(e.out);
    e.out.connect(this.engBus);

    // metal clatter that pulses with the knock
    e.csrc = this._loopSrc(this.whiteBuf);
    e.cbp = ctx.createBiquadFilter();
    e.cbp.type = 'bandpass';
    e.cbp.frequency.value = 1800;
    e.cbp.Q.value = 1.2;
    e.cl = mk(0.5);
    const cd = mk(0.5);
    e.knock.connect(cd);
    cd.connect(e.cl.gain);
    e.clOut = mk(0);
    e.csrc.connect(e.cbp); e.cbp.connect(e.cl); e.cl.connect(e.clOut); e.clOut.connect(this.engBus);

    // exhaust rumble that pulses with the knock
    e.xsrc = this._loopSrc(this.brownBuf);
    e.xlp = ctx.createBiquadFilter();
    e.xlp.type = 'lowpass';
    e.xlp.frequency.value = 180;
    e.xlp.Q.value = 0.7;
    e.xg = mk(0.5);
    const xd = mk(0.45);
    e.knock.connect(xd);
    xd.connect(e.xg.gain);
    e.xOut = mk(0);
    e.xsrc.connect(e.xlp); e.xlp.connect(e.xg); e.xg.connect(e.xOut); e.xOut.connect(this.engBus);

    // turbo whistle (only when revving)
    e.turbo = ctx.createOscillator();
    e.turbo.type = 'sine';
    e.turbo.frequency.value = 2000;
    e.tg = mk(0);
    e.turbo.connect(e.tg);
    e.tg.connect(this.engBus);

    e.a.start(); e.b.start(); e.sub.start(); e.knock.start(); e.turbo.start();
    this._go(e.csrc); this._go(e.xsrc);
  }

  _buildAmbience() {
    const ctx = this.ctx;
    const mk = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const a = (this.amb = {});
    // wind
    a.src = this._loopSrc(this.brownBuf);
    a.bp = ctx.createBiquadFilter();
    a.bp.type = 'bandpass';
    a.bp.frequency.value = 380;
    a.bp.Q.value = 0.5;
    a.sway = mk(0.6);
    a.lfo = ctx.createOscillator();
    a.lfo.type = 'sine';
    a.lfo.frequency.value = 0.08;
    const lfoD = mk(0.3);
    a.lfo.connect(lfoD);
    lfoD.connect(a.sway.gain);
    a.spd = mk(0.4);
    a.src.connect(a.bp); a.bp.connect(a.sway); a.sway.connect(a.spd); a.spd.connect(this.ambBus);
    // low city rumble
    a.r = this._loopSrc(this.brownBuf);
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 110;
    const rg = mk(0.8);
    a.r.connect(rlp); rlp.connect(rg); rg.connect(this.ambBus);
    // air hiss
    a.h = this._loopSrc(this.whiteBuf);
    const hbp = ctx.createBiquadFilter();
    hbp.type = 'bandpass';
    hbp.frequency.value = 3200;
    hbp.Q.value = 0.4;
    const hg = mk(0.03);
    a.h.connect(hbp); hbp.connect(hg); hg.connect(this.ambBus);
    // ground / gravel rumble that grows with speed
    a.gr = this._loopSrc(this.brownBuf);
    const gbp = ctx.createBiquadFilter();
    gbp.type = 'bandpass';
    gbp.frequency.value = 150;
    gbp.Q.value = 0.6;
    a.grg = mk(0);
    a.gr.connect(gbp); gbp.connect(a.grg); a.grg.connect(this.ambBus);
    a.lfo.start();
    this._go(a.src); this._go(a.r); this._go(a.h); this._go(a.gr);
  }

  _buildMusicFx() {
    const ctx = this.ctx;
    const mk = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    // stereo ping-pong echo
    this.delayIn = mk(1);
    const dL = ctx.createDelay(1.0);
    const dR = ctx.createDelay(1.0);
    dL.delayTime.value = STEP * 1.5;
    dR.delayTime.value = STEP * 1.5;
    const lp1 = ctx.createBiquadFilter();
    const lp2 = ctx.createBiquadFilter();
    lp1.type = 'lowpass'; lp1.frequency.value = 2600;
    lp2.type = 'lowpass'; lp2.frequency.value = 2600;
    const fb1 = mk(0.4);
    const fb2 = mk(0.4);
    const pL = ctx.createStereoPanner(); pL.pan.value = -0.7;
    const pR = ctx.createStereoPanner(); pR.pan.value = 0.7;
    const dOut = mk(0.5);
    this.delayIn.connect(dL);
    dL.connect(lp1);
    lp1.connect(pL); pL.connect(dOut);
    lp1.connect(fb1); fb1.connect(dR);
    dR.connect(lp2);
    lp2.connect(pR); pR.connect(dOut);
    lp2.connect(fb2); fb2.connect(dL);
    dOut.connect(this.musicBus);
  }

  // ------------------------------------------------------------------ tick

  _tick() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') { this._dbg(); return; }
    const now = ctx.currentTime;
    this.intensity += (this._intTarget - this.intensity) * 0.05;
    this._updateEngine(now);
    this._beeper(now);
    this._scheduleMusic(now);
    this._ambient(now);
    if (this._duckUntil && now > this._duckUntil) {
      this.duckGain.gain.setTargetAtTime(1, now, 0.5);
      this._duckUntil = 0;
    }
    this._dbg();
  }

  _updateEngine(now) {
    const e = this.eng, s = this._eng;
    if (!e) return;
    const on = performance.now() - s.stamp < 400;
    const sp = Math.abs(s.speed);
    const load = this._loadUntil > now ? 1 : 0;
    const target = on
      ? clamp(0.12 + Math.min(sp / 42, 1) * 0.55 + s.throttle * 0.25 + load * 0.2, 0, 1)
      : 0.12;
    s.rpm += (target - s.rpm) * (target > s.rpm ? 0.1 : 0.06);
    const r = s.rpm;
    const f = 38 + r * 60;
    e.a.frequency.setTargetAtTime(f, now, 0.07);
    e.b.frequency.setTargetAtTime(f * 2.02, now, 0.07);
    e.sub.frequency.setTargetAtTime(f, now, 0.07);
    e.lp.frequency.setTargetAtTime(420 + r * 1700, now, 0.08);
    e.knock.frequency.setTargetAtTime(6 + r * 17, now, 0.1);
    e.out.gain.setTargetAtTime(on ? 0.5 + r * 0.5 : 0, now, on ? 0.12 : 0.2);
    e.xlp.frequency.setTargetAtTime(140 + r * 260, now, 0.1);
    e.xOut.gain.setTargetAtTime(on ? 0.35 + r * 0.5 : 0, now, 0.15);
    e.cbp.frequency.setTargetAtTime(1500 + r * 1500, now, 0.1);
    e.clOut.gain.setTargetAtTime(on ? 0.06 + r * 0.22 : 0, now, 0.15);
    e.turbo.frequency.setTargetAtTime(1400 + r * 2600, now, 0.12);
    const tg = on ? Math.max(0, r - 0.3) * 0.07 * (0.4 + s.throttle * 0.6) : 0;
    e.tg.gain.setTargetAtTime(tg, now, 0.15);
    if (this.amb) {
      this.amb.spd.gain.setTargetAtTime(0.35 + Math.min(sp / 45, 1) * 0.9, now, 0.3);
      this.amb.grg.gain.setTargetAtTime(on ? Math.min(sp / 40, 1) * 0.9 : 0, now, 0.25);
    }
  }

  _beeper(now) {
    const s = this._eng;
    const rev = performance.now() - s.stamp < 400 && s.speed < -1.5;
    if (!rev) { this._nextBeep = 0; return; }
    if (now >= this._nextBeep) {
      this._nextBeep = now + 0.85;
      this._tone({ type: 'square', f0: 1000, f1: 1000, t: now + 0.01, dur: 0.4, a: 0.005, vol: 0.1, lp: 2200, sus: true });
    }
  }

  _ambient(now) {
    if (!this._ambOn) return;
    if (now > this._nextClank) {
      this._clank(now + 0.02, 0.45 + Math.random() * 0.3, 200 + Math.random() * 400, this.ambBus);
      this._nextClank = now + 7 + Math.random() * 12;
    }
    if (now > this._nextBird) {
      this._bird(now + 0.02);
      this._nextBird = now + 6 + Math.random() * 10;
    }
  }

  _bird(t) {
    const base = 2600 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      this._tone({
        type: 'sine', f0: base, f1: base * (1.15 + Math.random() * 0.3),
        t: t + i * 0.13, dur: 0.09, a: 0.01, vol: 0.35, bus: this.ambBus,
      });
    }
  }

  _dbg() {
    if (!this._dbgEl || this._dbgEl.style.display === 'none') return;
    const n = performance.now();
    if (n < this._dbgNext) return;
    this._dbgNext = n + 250;
    const c = this.ctx;
    const duck = c && this.duckGain ? this.duckGain.gain.value.toFixed(2) : '-';
    this._dbgEl.textContent =
      'audio ' + (c ? c.state : 'waiting (press a key)') + '\n' +
      'contexts ' + (window.__acCount || 0) + ' | duck ' + duck + '\n' +
      'rpm ' + this._eng.rpm.toFixed(2) + ' | muted ' + (this.muted ? 'yes' : 'no');
  }

  // ------------------------------------------------------------ primitives

  _run(fn) {
    try {
      const c = this.ctx;
      if (!c || c.state !== 'running' || this.muted) return;
      fn();
    } catch (e) { /* never break the game */ }
  }

  _load(sec) {
    this._loadUntil = this.ctx.currentTime + sec;
  }

  _shape(p, t, a, peak, dur, sus) {
    peak = Math.max(peak, 0.0002);
    a = Math.min(a, dur * 0.5);
    p.setValueAtTime(0.0001, t);
    p.exponentialRampToValueAtTime(peak, t + a);
    if (sus) {
      const r = Math.min(0.3, dur * 0.4);
      p.setValueAtTime(peak, Math.max(t + a, t + dur - r));
    }
    p.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  _osc(type, f0, f1, t, dur) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    return o;
  }

  _src(kind, t, dur) {
    const s = this.ctx.createBufferSource();
    const b = kind === 'brown' ? this.brownBuf : this.whiteBuf;
    s.buffer = b;
    s.loop = true;
    s.start(t, Math.random() * (b.duration - 1));
    s.stop(t + dur + 0.05);
    return s;
  }

  _tone(o) {
    const ctx = this.ctx;
    const t = o.t, dur = o.dur;
    const osc = this._osc(o.type || 'sine', o.f0, o.f1, t, dur);
    const g = ctx.createGain();
    this._shape(g.gain, t, o.a || 0.005, o.vol, dur, o.sus);
    let node = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(o.bus || this.sfxBus);
    if (o.send) g.connect(o.send);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _noise(o) {
    const ctx = this.ctx;
    const src = this._src(o.kind || 'white', o.t, o.dur);
    let node = src;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter;
      f.frequency.setValueAtTime(o.f0, o.t);
      if (o.f1 && o.f1 !== o.f0) f.frequency.exponentialRampToValueAtTime(o.f1, o.t + o.dur);
      f.Q.value = o.q || 1;
      node.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    this._shape(g.gain, o.t, o.a || 0.005, o.vol, o.dur, o.sus);
    node.connect(g);
    g.connect(o.bus || this.sfxBus);
  }

  // ------------------------------------------------------- sound ingredients

  _whine(t, dur, f0, f1, vol) {
    const ctx = this.ctx;
    const o = this._osc('sawtooth', f0, f1, t, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 4;
    bp.frequency.setValueAtTime(f0 * 2, t);
    bp.frequency.exponentialRampToValueAtTime(f1 * 2, t + dur);
    const g = ctx.createGain();
    this._shape(g.gain, t, 0.15, vol, dur, true);
    o.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
    // pump motor hum and a little air noise
    this._tone({ type: 'sine', f0: f0 * 0.33, f1: f1 * 0.33, t, dur, a: 0.12, vol: vol * 0.7, sus: true });
    this._noise({ kind: 'white', filter: 'bandpass', f0: 2400, f1: 3400, q: 1.5, t, dur, a: 0.15, vol: vol * 0.08, sus: true });
  }

  _valve(t) {
    this._noise({ kind: 'white', filter: 'bandpass', f0: 1400, q: 2, t, dur: 0.06, a: 0.002, vol: 0.25 });
    this._tone({ type: 'square', f0: 180, f1: 120, t, dur: 0.05, a: 0.002, vol: 0.12, lp: 900 });
  }

  _thump(t, vol, f) {
    this._tone({ type: 'sine', f0: f, f1: f * 0.32, t, dur: 0.5, a: 0.004, vol });
    this._noise({ kind: 'brown', filter: 'lowpass', f0: 500, f1: 120, t, dur: 0.35, a: 0.003, vol: vol * 0.9 });
    this._noise({ kind: 'white', filter: 'highpass', f0: 1500, q: 0.5, t, dur: 0.03, a: 0.002, vol: vol * 0.25 });
  }

  _rumble(t, dur, vol) {
    this._noise({ kind: 'brown', filter: 'lowpass', f0: 180, f1: 90, t, dur, a: 0.1, vol, sus: true });
  }

  _hiss(t, dur, vol) {
    this._noise({ kind: 'white', filter: 'highpass', f0: 3500, q: 0.5, t, dur, a: 0.01, vol });
  }

  _scrape(t, dur, vol) {
    const ctx = this.ctx;
    const s = this._src('white', t, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.linearRampToValueAtTime(1900, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    const n = Math.floor(dur / 0.035);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const env = Math.sin(Math.PI * Math.min(1, k * 1.15));
      g.gain.setValueAtTime(vol * env * (0.25 + Math.random() * 0.75) + 0.0001, t + i * 0.035);
    }
    g.gain.setValueAtTime(0.0001, t + dur);
    s.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    this._noise({ kind: 'brown', filter: 'lowpass', f0: 500, q: 0.7, t, dur, a: 0.1, vol: vol * 0.6, sus: true });
  }

  _grains(t, dur, vol) {
    const ctx = this.ctx;
    const s = this._src('white', t, dur);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    const n = Math.floor(dur / 0.03);
    for (let i = 0; i < n; i++) {
      const spike = Math.random() < 0.45 ? vol * (0.3 + Math.random() * 0.7) : 0.0001;
      g.gain.setValueAtTime(spike + 0.0001, t + i * 0.03);
    }
    g.gain.setValueAtTime(0.0001, t + dur);
    s.connect(hp);
    hp.connect(g);
    g.connect(this.sfxBus);
  }

  _creak(t, dur, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(150, t);
    const n = Math.floor(dur / 0.06);
    for (let i = 0; i < n; i++) {
      o.frequency.linearRampToValueAtTime(120 + Math.random() * 90 + i * 3, t + (i + 1) * 0.06);
    }
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 7;
    const g = ctx.createGain();
    this._shape(g.gain, t, 0.12, vol, dur, true);
    o.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _pour(t, dur, vol) {
    this._noise({ kind: 'white', filter: 'lowpass', f0: 2200, f1: 1200, q: 0.7, t, dur, a: 0.15, vol, sus: true });
    this._noise({ kind: 'brown', filter: 'lowpass', f0: 300, q: 0.7, t, dur, a: 0.15, vol: vol * 0.8, sus: true });
    this._grains(t, dur, vol * 0.5);
  }

  _clank(t, vol, base, bus) {
    const ratios = [1, 2.76, 5.4, 8.93];
    ratios.forEach((r, i) => {
      this._tone({
        type: 'sine', f0: base * r, f1: base * r * 0.99, t,
        dur: 0.5 / (1 + i * 0.6), a: 0.002, vol: vol / (1 + i * 0.7), bus: bus || this.sfxBus,
      });
    });
  }

  // ------------------------------------------------------------------ music

  _scheduleMusic(now) {
    if (!this._musicOn) return;
    if (this._nextStep < now - 0.5) this._nextStep = now + 0.05;
    const ahead = now + 0.3;
    while (this._nextStep < ahead) {
      this._playStep(this._step, this._nextStep);
      this._nextStep += STEP;
      this._step = (this._step + 1) % 64;
    }
  }

  _playStep(step, t) {
    const chord = CHORDS[Math.floor(step / 16) % 4];
    const s16 = step % 16;
    const s8 = step % 8;
    const it = this.intensity;
    const bus = this.musicBus;

    if (s16 === 0) this._pad(chord, t, 16 * STEP);

    // bass
    if (s16 === 0 || s16 === 6 || s16 === 8 || s16 === 14) {
      const v = s16 === 0 ? 0.55 : 0.38;
      const f = mtof(chord.root);
      this._tone({ type: 'sine', f0: f, f1: f * 0.998, t, dur: 0.7, a: 0.01, vol: v, bus });
      this._tone({ type: 'triangle', f0: f, f1: f * 0.998, t, dur: 0.5, a: 0.01, vol: v * 0.35, lp: 420, bus });
    }

    // arpeggio with ping-pong echo
    if (it > 0.5 || s8 % 2 === 0) {
      const m = chord.notes[ARP[s8] % chord.notes.length] + 12;
      const f = mtof(m);
      const v = (s8 % 2 === 0 ? 0.34 : 0.22) * (0.7 + it * 0.5);
      this._tone({ type: 'triangle', f0: f, f1: f * 0.999, t, dur: 0.55, a: 0.004, vol: v, lp: 2400, bus, send: this.delayIn });
      this._tone({ type: 'sine', f0: f * 2, f1: f * 2, t, dur: 0.3, a: 0.004, vol: v * 0.25, bus });
    }

    // slow singing lead when you drive a bit
    if (it > 0.35 && (s16 === 4 || s16 === 12)) {
      const m = chord.notes[s16 === 4 ? 2 : 3] + 12;
      const f = mtof(m);
      this._tone({ type: 'triangle', f0: f, f1: f * 1.002, t, dur: 1.3, a: 0.06, vol: 0.22, lp: 3000, bus, send: this.delayIn });
    }

    // drums
    if (it > 0.25) {
      const pv = 0.4 + it * 0.6;
      if (s8 === 0 || s8 === 4) {
        this._tone({ type: 'sine', f0: 120, f1: 42, t, dur: 0.22, a: 0.003, vol: 0.55 * pv, bus });
      }
      if ((s8 === 2 || s8 === 6) && it > 0.5) {
        this._noise({ kind: 'white', filter: 'bandpass', f0: 1800, q: 0.8, t, dur: 0.14, a: 0.003, vol: 0.18 * pv, bus });
        this._tone({ type: 'sine', f0: 190, f1: 150, t, dur: 0.1, a: 0.002, vol: 0.2 * pv, bus });
      }
      if (s8 % 2 === 1) {
        this._noise({ kind: 'white', filter: 'highpass', f0: 7000, q: 0.5, t, dur: 0.05, a: 0.002, vol: 0.07 * pv, bus });
      }
    }
  }

  _pad(chord, t, dur) {
    const ctx = this.ctx;
    // two stereo sides, each with its own filter, so the pad feels wide
    [-1, 1].forEach((side) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.6;
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.linearRampToValueAtTime(1300, t + dur * 0.5);
      lp.frequency.linearRampToValueAtTime(600, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.9, t + 1.2);
      g.gain.linearRampToValueAtTime(0.7, t + dur - 0.5);
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2);
      const pan = ctx.createStereoPanner();
      pan.pan.value = side * 0.55;
      lp.connect(g);
      g.connect(pan);
      pan.connect(this.musicBus);
      chord.notes.forEach((m) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = side * 7;
        const og = ctx.createGain();
        og.gain.value = 0.075;
        o.connect(og);
        og.connect(lp);
        o.start(t);
        o.stop(t + dur + 1.4);
      });
    });
    // warm sub drone under the pad
    this._tone({ type: 'sine', f0: mtof(chord.root - 12), f1: mtof(chord.root - 12), t, dur: dur + 0.5, a: 0.8, vol: 0.5, sus: true, bus: this.musicBus });
    this._tone({ type: 'triangle', f0: mtof(chord.root), f1: mtof(chord.root), t, dur: dur + 0.5, a: 0.8, vol: 0.18, lp: 300, sus: true, bus: this.musicBus });
  }

  // ------------------------------------------------------------- public API

  start() { this._onGesture(); this._musicOn = true; this._ambOn = true; }
  startAmbience() { this.start(); }
  unlock() { this._onGesture(); }
  stop() { this._musicOn = false; }

  setIntensity(v) { this._intTarget = clamp(+v || 0, 0, 1); }

  setEngine(speedKmh, throttle) {
    const s = this._eng;
    s.speed = +speedKmh || 0;
    s.throttle = clamp(+throttle || 0, 0, 1);
    s.stamp = performance.now();
  }

  setMuted(v) {
    this.muted = !!v;
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : LEVELS.master, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }
  toggleMute() { return this.setMuted(!this.muted); }
  toggle() { return this.toggleMute(); }
  isMuted() { return this.muted; }

  duck(sec) {
    try {
      const c = this.ctx;
      if (!c || c.state !== 'running') return;
      const now = c.currentTime;
      this.duckGain.gain.setTargetAtTime(0.5, now, 0.12);
      this._duckUntil = now + (sec || 3);
    } catch (e) { /* ignore */ }
  }

  dig(type, name) {
    this._run(() => {
      const t = this.ctx.currentTime + 0.02;
      if (type === 'dump') {
        switch (name) {
          case 'start':
            this.duck(3.0);
            this._load(1.8);
            this._valve(t);
            this._whine(t + 0.05, 1.2, 260, 620, 0.5);
            break;
          case 'tip':
            this._valve(t);
            this._creak(t, 0.9, 0.35);
            this._rumble(t, 0.9, 0.4);
            break;
          case 'drop':
            this._pour(t, 1.4, 0.6);
            this._rumble(t, 1.2, 0.5);
            break;
          case 'thud':
            this._thump(t, 1.0, 80);
            this._tone({ type: 'sine', f0: 58, f1: 40, t, dur: 0.9, a: 0.01, vol: 0.7 });
            this._clank(t + 0.02, 0.5, 230);
            this._grains(t + 0.05, 0.5, 0.35);
            this._whine(t + 0.1, 0.6, 620, 300, 0.35);
            break;
          case 'end': this._hiss(t, 0.5, 0.3); break;
          default: break;
        }
      } else {
        switch (name) {
          case 'start':
            this._load(2.4);
            this._valve(t);
            this._whine(t + 0.05, 1.3, 240, 520, 0.45);
            break;
          case 'dig':
            this._thump(t, 0.8, 95);
            this._scrape(t + 0.05, 0.7, 0.55);
            break;
          case 'fill':
            this._thump(t, 1.0, 70);
            this._grains(t, 0.7, 0.5);
            this._rumble(t, 0.5, 0.4);
            break;
          case 'lift':
            this._whine(t, 1.0, 300, 700, 0.4);
            break;
          case 'end': this._hiss(t, 0.5, 0.3); break;
          default: break;
        }
      }
    });
  }

  coin() {
    this._run(() => {
      const t = this.ctx.currentTime + 0.01;
      [[1318.5, 0], [1760, 0.075], [2349, 0.15]].forEach(([f, d], i) => {
        const v = i === 2 ? 0.25 : 0.55;
        this._tone({ type: 'sine', f0: f, f1: f * 1.002, t: t + d, dur: 0.6, a: 0.004, vol: v });
        this._tone({ type: 'triangle', f0: f * 2, f1: f * 2.004, t: t + d, dur: 0.35, a: 0.004, vol: v * 0.22 });
      });
      this._tone({ type: 'sine', f0: 659, f1: 660, t, dur: 0.25, a: 0.004, vol: 0.2 });
    });
  }

  complete() {
    this._run(() => {
      const t = this.ctx.currentTime + 0.02;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const d = i * 0.13;
        const len = i === 3 ? 1.6 : 0.5;
        this._tone({ type: 'triangle', f0: f, f1: f * 1.001, t: t + d, dur: len, a: 0.01, vol: 0.4 });
        this._tone({ type: 'sine', f0: f * 2, f1: f * 2.002, t: t + d, dur: len * 0.7, a: 0.01, vol: 0.12 });
      });
      [261.63, 329.63, 392].forEach((f) => {
        this._tone({ type: 'sine', f0: f, f1: f * 1.001, t: t + 0.4, dur: 2.0, a: 0.3, vol: 0.2 });
      });
      this._clank(t + 0.4, 0.12, 1300);
    });
  }

  click() {
    this._run(() => {
      const t = this.ctx.currentTime + 0.005;
      this._tone({ type: 'sine', f0: 1500, f1: 900, t, dur: 0.05, a: 0.002, vol: 0.25 });
      this._noise({ kind: 'white', filter: 'highpass', f0: 4000, q: 0.5, t, dur: 0.02, a: 0.001, vol: 0.1 });
    });
  }

  debugText() { return ''; }

  // Compatibility: old code may still call these. They do nothing now.
  init() {}
  playEngine() {}
  playScoop() {}
  playDumpThud() {}
  playDirtCrunch() {}
  playSuccess() { this.complete(); }
}
