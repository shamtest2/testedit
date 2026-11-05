export class AudioManager {
    constructor() {
        this.ctx = null; this.engineOsc = null; this.engineGain = null; this.engineFilter = null; this.musicOsc = null; this.musicGain = null;
    }
    init() {
        if (this.ctx) return;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
        
        this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 40;
        this.engineFilter = this.ctx.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 400;
        this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
        this.engineOsc.connect(this.engineFilter); this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.ctx.destination); this.engineOsc.start();

        this.musicOsc = this.ctx.createOscillator(); this.musicOsc.type = 'sine'; this.musicOsc.frequency.value = 55;
        this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.03;
        const lfo = this.ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.1;
        const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 0.01;
        lfo.connect(lfoGain); lfoGain.connect(this.musicGain.gain);
        this.musicOsc.connect(this.musicGain); this.musicGain.connect(this.ctx.destination);
        this.musicOsc.start(); lfo.start();
    }
    playEngine(speedRatio) {
        if (!this.ctx) return;
        const targetFreq = 40 + (speedRatio * 60); this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
        const targetVol = 0.02 + (speedRatio * 0.08); this.engineGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);
        const targetFilterFreq = 400 + (speedRatio * 600); this.engineFilter.frequency.setTargetAtTime(targetFilterFreq, this.ctx.currentTime, 0.2);
    }
    playDumpThud() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
        osc.type = 'square'; osc.frequency.setValueAtTime(100, this.ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.5, this.ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
        osc.connect(gain); gain.connect(this.ctx.destination); osc.start(); osc.stop(this.ctx.currentTime + 0.4);
    }
    playScoop() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
        osc.type = 'triangle'; osc.frequency.setValueAtTime(300, this.ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        osc.connect(gain); gain.connect(this.ctx.destination); osc.start(); osc.stop(this.ctx.currentTime + 0.1);
    }
    // NEW: Heavy dirt crunch sound
    playDirtCrunch() {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * 0.5;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) { data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2)); }
        const src = this.ctx.createBufferSource(); src.buffer = buffer;
        const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 500;
        const gain = this.ctx.createGain(); gain.gain.setValueAtTime(0.4, this.ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
        src.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination); src.start();
    }
    playSuccess() {
        if (!this.ctx) return;
        [440, 554, 659, 880].forEach((freq, index) => {
            const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
            osc.type = 'sine'; osc.frequency.setValueAtTime(freq, this.ctx.currentTime + index * 0.1);
            gain.gain.setValueAtTime(0.1, this.ctx.currentTime + index * 0.1); gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + index * 0.1 + 0.2);
            osc.connect(gain); gain.connect(this.ctx.destination); osc.start(this.ctx.currentTime + index * 0.1); osc.stop(this.ctx.currentTime + index * 0.1 + 0.2);
        });
    }
}
