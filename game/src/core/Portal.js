export class Portal {
  constructor() {
    this.available = false;
    this.SDK = null;
    this._initialized = false;
    this._loadingActive = false;
    this._gameplayActive = false;
    this._happySent = false;
    this._lastMidgame = 0;
    this._adRunning = false;
    this._midgameMinGap = 120000;
    this._boundVis = null;
    this._boundBlur = null;
    this._boundFocus = null;

    this.onPause = null;
    this.onResume = null;
    this.onAdStart = null;
    this.onAdEnd = null;

    this._installAutoPause();
  }

  async init() {
    if (this._initialized) return this.available;
    this._initialized = true;

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      this.available = false;
      return false;
    }

    if (!window.CrazyGames) {
      await this._injectSDK();
    }

    const start = Date.now();
    while (!window.CrazyGames && Date.now() - start < 3000) {
      await this._sleep(50);
    }

    if (window.CrazyGames && window.CrazyGames.SDK) {
      try {
        await window.CrazyGames.SDK.init();
        this.SDK = window.CrazyGames.SDK;
        this.available = true;
      } catch (e) {
        this.available = false;
        this.SDK = null;
      }
    } else {
      this.available = false;
    }
    return this.available;
  }

  _injectSDK() {
    return new Promise((resolve) => {
      try {
        const existing = document.querySelector('script[data-crazygames-sdk]');
        if (existing) { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
        s.async = true;
        s.setAttribute('data-crazygames-sdk', '1');
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.head.appendChild(s);
        setTimeout(resolve, 3000);
      } catch (e) {
        resolve();
      }
    });
  }

  _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  _safe(fn) {
    try {
      if (this.available && this.SDK && typeof fn === 'function') fn();
    } catch (e) {}
  }

  loadingStart() {
    if (this._loadingActive) return;
    this._loadingActive = true;
    this._safe(() => this.SDK.game.loadingStart());
  }

  loadingStop() {
    if (!this._loadingActive) return;
    this._loadingActive = false;
    this._safe(() => this.SDK.game.loadingStop());
  }

  gameplayStart() {
    if (this._gameplayActive) return;
    this._gameplayActive = true;
    this._safe(() => this.SDK.game.gameplayStart());
  }

  gameplayStop() {
    if (!this._gameplayActive) return;
    this._gameplayActive = false;
    this._safe(() => this.SDK.game.gameplayStop());
  }

  happytime() {
    if (this._happySent) return;
    this._happySent = true;
    this._safe(() => this.SDK.game.happytime());
  }

  requestMidgame(onDone) {
    if (!this.available || !this.SDK || this._adRunning) {
      if (typeof onDone === 'function') onDone();
      return;
    }
    const now = Date.now();
    if (now - this._lastMidgame < this._midgameMinGap) {
      if (typeof onDone === 'function') onDone();
      return;
    }
    this._lastMidgame = now;
    this._adRunning = true;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this._adRunning = false;
      if (typeof this.onAdEnd === 'function') this.onAdEnd();
      if (typeof onDone === 'function') onDone();
    };
    try {
      this.SDK.ad.requestAd('midgame', {
        adStarted: () => {
          if (typeof this.onAdStart === 'function') this.onAdStart();
        },
        adFinished: finish,
        adError: finish
      });
    } catch (e) {
      finish();
    }
  }

  requestRewarded(onReward, onFail) {
    if (!this.available || !this.SDK || this._adRunning) {
      if (typeof onFail === 'function') onFail();
      return;
    }
    this._adRunning = true;
    let finished = false;
    let rewarded = false;
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      this._adRunning = false;
      if (typeof this.onAdEnd === 'function') this.onAdEnd();
      if (ok && typeof onReward === 'function') onReward();
      else if (!ok && typeof onFail === 'function') onFail();
    };
    try {
      this.SDK.ad.requestAd('rewarded', {
        adStarted: () => {
          if (typeof this.onAdStart === 'function') this.onAdStart();
        },
        adFinished: () => { rewarded = true; finish(true); },
        adError: () => finish(false)
      });
    } catch (e) {
      finish(false);
    }
  }

  getLanguage() {
    try {
      if (this.available && this.SDK && this.SDK.system && this.SDK.system.getSystemInfo) {
        const info = this.SDK.system.getSystemInfo();
        if (info && info.locale) return String(info.locale).slice(0, 2).toLowerCase();
      }
    } catch (e) {}
    try {
      if (typeof navigator !== 'undefined' && navigator.language) {
        return String(navigator.language).slice(0, 2).toLowerCase();
      }
    } catch (e) {}
    return 'en';
  }

  save(key, obj) {
    const payload = JSON.stringify({ v: 1, data: obj });
    try {
      if (this.available && this.SDK && this.SDK.data && this.SDK.data.setItem) {
        this.SDK.data.setItem(key, payload);
        return true;
      }
    } catch (e) {}
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, payload);
        return true;
      }
    } catch (e) {}
    return false;
  }

  load(key, fallback) {
    let raw = null;
    try {
      if (this.available && this.SDK && this.SDK.data && this.SDK.data.getItem) {
        raw = this.SDK.data.getItem(key);
      }
    } catch (e) { raw = null; }
    if (raw === null || raw === undefined) {
      try {
        if (typeof localStorage !== 'undefined') raw = localStorage.getItem(key);
      } catch (e) { raw = null; }
    }
    if (raw === null || raw === undefined) return fallback;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'data' in parsed) return parsed.data;
      return parsed;
    } catch (e) {
      return fallback;
    }
  }

  setGameplayActive(active) {
    if (active) this.gameplayStart();
    else this.gameplayStop();
  }

  _installAutoPause() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    this._boundVis = () => {
      if (document.visibilityState === 'hidden') {
        if (typeof this.onPause === 'function') this.onPause();
      } else {
        if (typeof this.onResume === 'function') this.onResume();
      }
    };
    this._boundBlur = () => {
      if (typeof this.onPause === 'function') this.onPause();
    };
    this._boundFocus = () => {
      if (typeof this.onResume === 'function') this.onResume();
    };
    document.addEventListener('visibilitychange', this._boundVis);
    window.addEventListener('blur', this._boundBlur);
    window.addEventListener('focus', this._boundFocus);
  }

  destroy() {
    if (typeof document === 'undefined') return;
    if (this._boundVis) document.removeEventListener('visibilitychange', this._boundVis);
    if (this._boundBlur) window.removeEventListener('blur', this._boundBlur);
    if (this._boundFocus) window.removeEventListener('focus', this._boundFocus);
  }
}

export class LoadingScreen {
  constructor() {
    this._progress = 0;
    this._target = 0;
    this._tipIndex = 0;
    this._tipTimer = null;
    this._raf = null;
    this._destroyed = false;
    this._tips = [
      'Press F near the pile to dig',
      'Watch the timer',
      'Upgrade your engine in the shop'
    ];

    this._injectCSS();

    let el = typeof document !== 'undefined' ? document.getElementById('loading-screen') : null;
    if (!el) {
      el = document.createElement('div');
      el.id = 'loading-screen';
      el.className = 'ls-loading';
      document.body.appendChild(el);
    }
    el.innerHTML = '';
    this._el = el;

    const inner = document.createElement('div');
    inner.className = 'ls-loading-inner';

    const title = document.createElement('div');
    title.className = 'ls-title';
    title.textContent = 'TerraForm 3D';
    inner.appendChild(title);

    const barWrap = document.createElement('div');
    barWrap.className = 'ls-bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'ls-bar';
    barWrap.appendChild(bar);
    inner.appendChild(barWrap);
    this._bar = bar;

    const pct = document.createElement('div');
    pct.className = 'ls-pct';
    pct.textContent = '0%';
    inner.appendChild(pct);
    this._pct = pct;

    const status = document.createElement('div');
    status.className = 'ls-status';
    status.textContent = 'Loading…';
    inner.appendChild(status);
    this._status = status;

    const tip = document.createElement('div');
    tip.className = 'ls-tip';
    tip.textContent = this._tips[0];
    inner.appendChild(tip);
    this._tip = tip;

    el.appendChild(inner);

    this._tipTimer = setInterval(() => this._nextTip(), 2500);
    this._loop();
  }

  _injectCSS() {
    if (document.getElementById('loading-screen-css')) return;
    const s = document.createElement('style');
    s.id = 'loading-screen-css';
    s.textContent = `
      .ls-loading {
        position: fixed;
        inset: 0;
        z-index: 20000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(ellipse at center, #0e1a2b 0%, #060b15 100%);
        color: #fff;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        opacity: 1;
        transition: opacity 0.4s ease;
        user-select: none;
      }
      .ls-loading.ls-fade { opacity: 0; pointer-events: none; }
      .ls-loading-inner {
        width: min(420px, 82vw);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        text-align: center;
      }
      .ls-title {
        font-size: clamp(26px, 6vw, 42px);
        font-weight: 900;
        letter-spacing: 1px;
        color: #fbbf24;
        text-shadow: 0 3px 12px rgba(251,191,36,0.25);
      }
      .ls-bar-wrap {
        width: 100%;
        height: 10px;
        border-radius: 8px;
        background: rgba(148,163,184,0.18);
        overflow: hidden;
        border: 1px solid rgba(148,163,184,0.22);
      }
      .ls-bar {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #d97706, #fbbf24);
        border-radius: 8px;
        transition: width 0.18s linear;
      }
      .ls-pct {
        font-size: 14px;
        font-weight: 700;
        color: #cbd5e1;
        min-height: 18px;
      }
      .ls-status {
        font-size: 12px;
        font-weight: 600;
        color: #94a3b8;
        min-height: 16px;
      }
      .ls-tip {
        margin-top: 8px;
        font-size: 13px;
        font-weight: 600;
        color: #fcd34d;
        opacity: 0.9;
        min-height: 18px;
        transition: opacity 0.3s ease;
      }
    `;
    document.head.appendChild(s);
  }

  _nextTip() {
    if (this._destroyed || !this._tip) return;
    this._tip.style.opacity = '0';
    setTimeout(() => {
      if (this._destroyed || !this._tip) return;
      this._tipIndex = (this._tipIndex + 1) % this._tips.length;
      this._tip.textContent = this._tips[this._tipIndex];
      this._tip.style.opacity = '0.9';
    }, 300);
  }

  setProgress(p) {
    const v = Math.max(0, Math.min(1, Number(p) || 0));
    if (v > this._target) this._target = v;
  }

  setStatus(text) {
    if (this._status) this._status.textContent = String(text == null ? '' : text);
  }

  _loop() {
    if (this._destroyed) return;
    const diff = this._target - this._progress;
    this._progress += diff * 0.15;
    if (Math.abs(this._target - this._progress) < 0.001) this._progress = this._target;
    const pct = Math.round(this._progress * 100);
    if (this._bar) this._bar.style.width = (this._progress * 100).toFixed(1) + '%';
    if (this._pct) this._pct.textContent = pct + '%';
    this._raf = requestAnimationFrame(() => this._loop());
  }

  finish() {
    if (this._destroyed) return;
    this._target = 1;
    this._progress = 1;
    if (this._bar) this._bar.style.width = '100%';
    if (this._pct) this._pct.textContent = '100%';
    this._destroyed = true;
    if (this._tipTimer) clearInterval(this._tipTimer);
    this._tipTimer = null;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    const el = this._el;
    if (el) {
      el.classList.add('ls-fade');
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 420);
    }
    const css = document.getElementById('loading-screen-css');
    if (css && css.parentNode) css.parentNode.removeChild(css);
    this._el = null;
    this._bar = null;
    this._pct = null;
    this._status = null;
    this._tip = null;
  }
}
