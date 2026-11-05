export default class Music {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.ambienceBus = null;
    this._unlocked = false;
    this._started = false;
    this._ambienceStarted = false;
    this._paused = false;
    this._muted = false;
    this._volume = 1;
    this._intensity = 0;
    this._duckUntil = 0;
    this._lookahead = 0.1;
    this._schedulerTimer = null;
    this._nextNoteTime = 0;
    this._step = 0;
    this._bpm = 100;
    this._chords = [
      [57, 60, 64],
      [53, 57, 60],
      [48, 52, 55],
      [55, 59, 62]
    ];
    this._chordRoots = [45, 41, 36, 43];
    this._leadPattern = [0, 2, 1, 2, 3, 2, 1, 0];
    this._chordIndex = 0;
    this._ambienceNodes = [];
    this._hornTimeout = null;

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

    this.master = this.ctx.createGain();
    this.master.gain.value = this._muted ? 0 : 0.25 * this._volume;
    this.master.connect(this.ctx.destination);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 1;
    this.musicBus.connect(this.master);

    this.ambienceBus = this.ctx.createGain();
    this.ambienceBus.gain.value = 0.5;
    this.ambienceBus.connect(this.master);
  }

  _resumeCtx() {
    if (this.ctx && this.ctx.state === 'suspended' && !this._paused) {
      this.ctx.resume().catch(() => {});
    }
  }

  _now() {
    return this.ctx.currentTime;
  }

  _freq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  start() {
    if (!this.ctx) {
      this._unlocked = true;
      this._init();
    }
    if (!this.ctx || this._started) return;
    this._resumeCtx();
    this._started = true;
    this._step = 0;
    this._chordIndex = 0;
    this._nextNoteTime = this._now() + 0.1;
    this._schedulerTimer = setInterval(() => this._scheduler(), 40);
  }

  _scheduler() {
    if (!this.ctx || this._paused) return;
    const stepDur = 60 / this._bpm / 2;
    while (this._nextNoteTime < this._now() + this._lookahead) {
      this._scheduleStep(this._step, this._nextNoteTime);
      this._nextNoteTime += stepDur;
      this._step = (this._step + 1) % 16;
    }
  }

  _scheduleStep(step, t) {
    const inten = this._intensity;

    if (step % 4 === 0) {
      this._kick(t);
    }
    if (step % 2 === 1) {
      this._hat(t, 0.06 + inten * 0.05);
    }

    if (step === 0 || step === 8) {
      const root = this._chordRoots[this._chordIndex];
      const bassMidi = root - 12;
      this._bass(t, this._freq(bassMidi), 0.32);
      if (step === 0) {
        const chord = this._chords[this._chordIndex];
        this._pad(t, chord, 1.9);
      }
    }

    if (step % 2 === 0) {
      const chord = this._chords[this._chordIndex];
      const note = chord[this._leadPattern[(step / 2) % 8] % chord.length] + 12;
      this._lead(t, this._freq(note), 0.05 + inten * 0.06);
    }

    if (step === 15) {
      this._chordIndex = (this._chordIndex + 1) % 4;
    }
  }

  _kick(t) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(g);
    g.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  _hat(t, vol) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * 0.06);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(hp);
    hp.connect(g);
    g.connect(this.musicBus);
    src.start(t);
    src.stop(t + 0.06);
  }

  _bass(t, freq, dur) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(280, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _pad(t, midis, dur) {
    for (let i = 0; i < midis.length; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = this._freq(midis[i]);
      osc.detune.value = (Math.random() - 0.5) * 8;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.25);
      g.gain.setValueAtTime(0.07, t + dur - 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(this.musicBus);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  }

  _lead(t, freq, vol) {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g);
    g.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  startAmbience() {
    if (!this.ctx) {
      this._unlocked = true;
      this._init();
    }
    if (!this.ctx || this._ambienceStarted) return;
    this._ambienceStarted = true;
    this._resumeCtx();

    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * 4);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
      data[i] = last;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    const g = this.ctx.createGain();
    g.gain.value = 0.12;
    src.connect(lp);
    lp.connect(g);
    g.connect(this.ambienceBus);
    src.start();
    this._ambienceNodes.push(src, lp, g);

    const windBuf = this.ctx.createBuffer(1, Math.floor(sr * 3), sr);
    const wd = windBuf.getChannelData(0);
    let w = 0;
    for (let i = 0; i < wd.length; i++) {
      w = w * 0.995 + (Math.random() * 2 - 1) * 0.005;
      wd[i] = w;
    }
    const wind = this.ctx.createBufferSource();
    wind.buffer = windBuf;
    wind.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 800;
    bp.Q.value = 0.4;
    const wg = this.ctx.createGain();
    wg.gain.value = 0.05;
    wind.connect(bp);
    bp.connect(wg);
    wg.connect(this.ambienceBus);
    wind.start();
    this._ambienceNodes.push(wind, bp, wg);

    this._scheduleHorn();
  }

  _scheduleHorn() {
    const delay = 6000 + Math.random() * 12000;
    this._hornTimeout = setTimeout(() => {
      if (this.ctx && this._ambienceStarted && !this._paused) {
        this._farHorn();
      }
      this._scheduleHorn();
    }, delay);
  }

  _farHorn() {
    const t = this._now();
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 220 + Math.random() * 80;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.025, t + 0.15);
    g.gain.setValueAtTime(0.025, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.ambienceBus);
    osc.start(t);
    osc.stop(t + 1);
  }

  setIntensity(v) {
    this._intensity = Math.max(0, Math.min(1, v || 0));
  }

  duck(ms) {
    if (!this.ctx || !this.musicBus) return;
    const t = this._now();
    const dur = Math.max(50, ms || 300) / 1000;
    const g = this.musicBus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.5, t + 0.05);
    g.setValueAtTime(0.5, t + dur - 0.08);
    g.linearRampToValueAtTime(1, t + dur);
  }

  pause() {
    if (!this.ctx) return;
    this._paused = true;
    if (this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (!this.ctx) return;
    this._paused = false;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(muted) {
    this._muted = !!muted;
    if (!this.ctx || !this.master) return;
    const t = this._now();
    const target = this._muted ? 0 : 0.25 * this._volume;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(target, t + 0.15);
  }

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v || 0));
    if (!this.ctx || !this.master) return;
    const t = this._now();
    const target = this._muted ? 0 : 0.25 * this._volume;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(target, t + 0.15);
  }

  stop() {
    if (this._schedulerTimer) {
      clearInterval(this._schedulerTimer);
      this._schedulerTimer = null;
    }
    if (this._hornTimeout) {
      clearTimeout(this._hornTimeout);
      this._hornTimeout = null;
    }
    this._started = false;
    this._ambienceStarted = false;
    for (let i = 0; i < this._ambienceNodes.length; i++) {
      const n = this._ambienceNodes[i];
      if (n && n.stop) { try { n.stop(); } catch (e) {} }
      if (n && n.disconnect) { try { n.disconnect(); } catch (e) {} }
    }
    this._ambienceNodes.length = 0;
  }
}
