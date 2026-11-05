// TerraForm 3D - CrazyGames SDK bridge (M9)
// One small class so the rest of the game never touches window.CrazyGames directly.
//
// Docs followed:
//  - sdk/intro          : script tag + await init() before anything else
//  - sdk/game           : gameplayStart / gameplayStop / happytime / settings.muteAudio
//  - sdk/video-ads      : requestAd('midgame' | 'rewarded', {adStarted, adError, adFinished})
//  - requirements/ads   : mute + pause while the ad plays, never punish a failed ad
//
// Outside CrazyGames (localhost, GitHub Pages, itch) every call is a silent no-op,
// so the same build runs everywhere. Force it on with ?sdk=1, force it off with ?nosdk=1.

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const MIDGAME_GAP = 190000; // the portal refuses midgame ads more often than every ~3 min

function onCrazyGames() {
  try {
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '') return false;
    return /(^|\.)crazygames\.(com|co\.uk|de|fr|es|it|pl|pt|br|ru|jp|kr|cn|nl|se|tr|ar|mx|com\.br)$/.test(h)
      || /crazygames/.test(h);
  } catch (e) { return false; }
}

export default class Portal {
  constructor() {
    this.sdk = null;
    this.ready = false;
    this.crazy = false;
    this._gameplay = false;
    this._adBusy = false;
    this._lastAd = 0;
    this._muteHandler = null;
    this._pausedByAd = false;
    const q = new URLSearchParams(location.search);
    this._force = q.has('sdk');
    this._off = q.has('nosdk');
  }

  // -------------------------------------------------------------- lifecycle
  async init() {
    if (this._off) { console.log('[portal] disabled by ?nosdk'); return false; }
    this.crazy = this._force || onCrazyGames();
    if (!this.crazy) { console.log('[portal] not on CrazyGames - running standalone'); return false; }

    try {
      await this._loadScript();
      if (!window.CrazyGames || !window.CrazyGames.SDK) throw new Error('SDK object missing');
      this.sdk = window.CrazyGames.SDK;
      await this._withTimeout(this.sdk.init(), 8000, 'init');
      this.ready = true;
      console.log('[portal] CrazyGames SDK ready');
      this._applySettings();
      try {
        this.sdk.game.addSettingsChangeListener(() => this._applySettings());
      } catch (e) { /* older SDK */ }
      return true;
    } catch (e) {
      console.warn('[portal] SDK not available:', e && e.message ? e.message : e);
      this.ready = false;
      return false;
    }
  }

  _loadScript() {
    return new Promise((resolve, reject) => {
      if (window.CrazyGames && window.CrazyGames.SDK) return resolve();
      const s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('could not load ' + SDK_URL));
      document.head.appendChild(s);
    });
  }

  _withTimeout(promise, ms, what) {
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' timed out')), ms))
    ]);
  }

  _applySettings() {
    try {
      const st = this.sdk.game.settings || {};
      if (st.muteAudio && typeof this._muteHandler === 'function') this._muteHandler(true);
    } catch (e) { /* ignore */ }
  }

  // the game tells us how to mute itself (portal setting has priority over the M key)
  setMuteHandler(fn) { this._muteHandler = fn; }

  // ----------------------------------------------------------- load/gameplay
  loadingStart() { this._call('game', 'loadingStart'); }
  loadingStop() { this._call('game', 'loadingStop'); }

  gameplayStart() {
    if (this._gameplay) return;
    this._gameplay = true;
    this._call('game', 'gameplayStart');
  }

  gameplayStop() {
    if (!this._gameplay) return;
    this._gameplay = false;
    this._call('game', 'gameplayStop');
  }

  happytime() { this._call('game', 'happytime'); }

  _call(mod, fn, a, b) {
    if (!this.ready || !this.sdk) return;
    try {
      const m = this.sdk[mod];
      if (m && typeof m[fn] === 'function') m[fn](a, b);
    } catch (e) { /* never let telemetry break the game */ }
  }

  // ------------------------------------------------------------------- ads
  // Resolves true when an ad finished, false for filled/blocked/skipped/error.
  requestMidgame(hooks) {
    hooks = hooks || {};
    if (!this.ready || !this.sdk) return Promise.resolve(false);
    if (this._adBusy) return Promise.resolve(false);
    const now = Date.now();
    if (this._lastAd && now - this._lastAd < MIDGAME_GAP) return Promise.resolve(false);
    return this._ad('midgame', hooks).then((ok) => { this._lastAd = Date.now(); return ok; });
  }

  requestRewarded(hooks) {
    hooks = hooks || {};
    if (!this.ready || !this.sdk) return Promise.resolve(false);
    if (this._adBusy) return Promise.resolve(false);
    return this._ad('rewarded', hooks);
  }

  _ad(type, hooks) {
    return new Promise((resolve) => {
      let done = false;
      this._adBusy = true;
      const finish = (ok) => {
        if (done) return;
        done = true;
        this._adBusy = false;
        try { if (hooks.onFinish) hooks.onFinish(ok); } catch (e) {}
        resolve(ok);
      };
      const callbacks = {
        adStarted: () => { try { if (hooks.onStart) hooks.onStart(); } catch (e) {} },
        adFinished: () => finish(true),
        adError: (err) => {
          console.log('[portal] ad ' + type + ' error', err && err.code ? err.code : err);
          finish(false);
        }
      };
      try {
        const ad = this.sdk.ad;
        if (!ad || typeof ad.requestAd !== 'function') { finish(false); return; }
        ad.requestAd(type, callbacks);
        // safety net: an ad that never reports back must not freeze the game
        setTimeout(() => finish(false), 90000);
      } catch (e) {
        console.warn('[portal] requestAd failed', e);
        finish(false);
      }
    });
  }

  banner(on) {
    if (!this.ready || !this.sdk) return;
    try {
      if (on && this.sdk.banner && this.sdk.banner.requestBanner) {
        this.sdk.banner.requestBanner({ id: 'terraform-banner', width: 320, height: 50 });
      } else if (!on && this.sdk.banner && this.sdk.banner.requestResponsiveBanner) {
        this.sdk.banner.requestResponsiveBanner('terraform-banner');
      }
    } catch (e) { /* ignore */ }
  }
}
