export default class MobileControls {
  constructor(input, callbacks) {
    this.input = input || {};
    this.cb = callbacks || {};
    this._enabled = false;
    this._visible = true;
    this._destroyed = false;
    this._els = {};
    this._pointers = {};
    this._joy = { active: false, pointerId: null, baseX: 0, baseY: 0, dx: 0, dy: 0 };
    this._brakePointer = null;
    this._actionLabel = 'DIG / DUMP';
    this._portraitOverlay = null;
    this._resizeHandler = null;
    this._orientHandler = null;

    const coarse = (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
      (typeof window !== 'undefined' && 'ontouchstart' in window);

    if (!coarse) {
      this._enabled = false;
      return;
    }
    this._enabled = true;
    this._injectCSS();
    this._build();
    this._bindGlobal();
    if (typeof document !== 'undefined') document.body.classList.add('touch-mode');
  }

  get enabled() {
    return this._enabled;
  }

  _injectCSS() {
    if (document.getElementById('mobile-controls-css')) return;
    const s = document.createElement('style');
    s.id = 'mobile-controls-css';
    s.textContent = `
      .mc-layer {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 9500;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
        box-sizing: border-box;
      }
      .mc-layer.hidden { display: none; }
      .mc-joy-zone {
        position: absolute;
        left: 0;
        bottom: 0;
        width: 45%;
        height: 60%;
        pointer-events: auto;
        touch-action: none;
      }
      .mc-joy-base {
        position: absolute;
        width: 110px; height: 110px;
        border-radius: 50%;
        background: rgba(15,23,42,0.45);
        border: 1.5px solid rgba(148,163,184,0.35);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        transform: translate(-50%, -50%);
        display: none;
        box-shadow: 0 6px 22px rgba(0,0,0,0.35);
        pointer-events: none;
      }
      .mc-joy-knob {
        position: absolute;
        width: 48px; height: 48px;
        border-radius: 50%;
        background: rgba(251,191,36,0.85);
        border: 1.5px solid rgba(180,83,9,0.7);
        box-shadow: 0 3px 12px rgba(0,0,0,0.45);
        transform: translate(-50%, -50%);
        left: 50%; top: 50%;
        pointer-events: none;
      }
      .mc-btns {
        position: absolute;
        right: max(16px, env(safe-area-inset-right));
        bottom: max(20px, env(safe-area-inset-bottom));
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 12px;
        pointer-events: none;
      }
      .mc-action {
        pointer-events: auto;
        width: 72px; height: 72px;
        border-radius: 50%;
        background: rgba(251,191,36,0.9);
        border: 2px solid rgba(180,83,9,0.85);
        color: #2a1d05;
        font-weight: 800;
        font-size: 11px;
        line-height: 1.05;
        text-align: center;
        touch-action: none;
        box-shadow: 0 6px 20px rgba(0,0,0,0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      .mc-action:active { transform: scale(0.96); background: rgba(255,214,90,0.95); }
      .mc-brake {
        pointer-events: auto;
        width: 56px; height: 56px;
        border-radius: 50%;
        background: rgba(15,23,42,0.6);
        border: 1.5px solid rgba(239,68,68,0.7);
        color: #fca5a5;
        font-weight: 800;
        font-size: 11px;
        touch-action: none;
        box-shadow: 0 5px 16px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      .mc-brake.on { background: rgba(239,68,68,0.85); color: #fff; }
      .mc-topright {
        position: absolute;
        right: max(16px, env(safe-area-inset-right));
        top: calc(max(16px, env(safe-area-inset-top)) + 74px);
        display: flex;
        gap: 8px;
        pointer-events: auto;
      }
      .mc-small {
        width: 44px; height: 44px;
        border-radius: 12px;
        background: rgba(15,23,42,0.6);
        border: 1px solid rgba(148,163,184,0.3);
        color: #fbbf24;
        font-weight: 700;
        font-size: 10px;
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        touch-action: none;
        box-shadow: 0 4px 14px rgba(0,0,0,0.35);
        -webkit-tap-highlight-color: transparent;
        padding: 0;
      }
      .mc-small:active { background: rgba(30,41,59,0.9); }
      .mc-portrait {
        position: fixed;
        inset: 0;
        z-index: 9700;
        background: rgba(6,10,20,0.92);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 22px;
        color: #fff;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        text-align: center;
        padding: 24px;
        box-sizing: border-box;
      }
      .mc-portrait svg { width: 72px; height: 72px; animation: mc-rotate 2s ease-in-out infinite; }
      @keyframes mc-rotate {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(90deg); }
      }
      .mc-portrait-text { font-size: 17px; font-weight: 700; max-width: 280px; line-height: 1.4; }
      .mc-portrait-btn {
        font-family: inherit;
        font-size: 15px; font-weight: 700;
        padding: 14px 26px; min-height: 56px;
        border-radius: 12px; border: none;
        background: #fbbf24; color: #2a1d05;
        cursor: pointer;
      }
      .mc-portrait-btn:active { transform: scale(0.97); }
      @media (min-width: 900px) and (orientation: landscape) {
        .mc-joy-base, .mc-joy-knob, .mc-action, .mc-brake, .mc-small { transform-origin: center; }
      }
    `;
    document.head.appendChild(s);
  }

  _build() {
    const layer = document.createElement('div');
    layer.className = 'mc-layer';
    this._els.layer = layer;

    const joyZone = document.createElement('div');
    joyZone.className = 'mc-joy-zone';
    this._els.joyZone = joyZone;

    const joyBase = document.createElement('div');
    joyBase.className = 'mc-joy-base';
    const joyKnob = document.createElement('div');
    joyKnob.className = 'mc-joy-knob';
    joyBase.appendChild(joyKnob);
    this._els.joyBase = joyBase;
    this._els.joyKnob = joyKnob;
    layer.appendChild(joyZone);
    layer.appendChild(joyBase);

    const btns = document.createElement('div');
    btns.className = 'mc-btns';

    const action = document.createElement('button');
    action.className = 'mc-action';
    action.type = 'button';
    action.textContent = this._actionLabel;
    this._els.action = action;

    const brake = document.createElement('button');
    brake.className = 'mc-brake';
    brake.type = 'button';
    brake.textContent = 'BRAKE';
    this._els.brake = brake;

    btns.appendChild(action);
    btns.appendChild(brake);
    layer.appendChild(btns);

    const topRight = document.createElement('div');
    topRight.className = 'mc-topright';
    const camBtn = document.createElement('button');
    camBtn.className = 'mc-small';
    camBtn.type = 'button';
    camBtn.textContent = 'CAM';
    const menuBtn = document.createElement('button');
    menuBtn.className = 'mc-small';
    menuBtn.type = 'button';
    menuBtn.textContent = 'MENU';
    topRight.appendChild(camBtn);
    topRight.appendChild(menuBtn);
    this._els.topRight = topRight;
    this._els.camBtn = camBtn;
    this._els.menuBtn = menuBtn;
    layer.appendChild(topRight);

    document.body.appendChild(layer);

    joyZone.addEventListener('pointerdown', this._onJoyDown.bind(this));
    window.addEventListener('pointermove', this._onJoyMove.bind(this), { passive: false });
    window.addEventListener('pointerup', this._onJoyUp.bind(this));
    window.addEventListener('pointercancel', this._onJoyUp.bind(this));

    action.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch (err) {} }
      if (typeof this.cb.onAction === 'function') this.cb.onAction();
    });

    brake.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._brakePointer = e.pointerId;
      this.input.brake = true;
      brake.classList.add('on');
      try { brake.setPointerCapture(e.pointerId); } catch (err) {}
    });
    const brakeUp = (e) => {
      if (this._brakePointer !== null && e.pointerId !== undefined && e.pointerId !== this._brakePointer) return;
      this._brakePointer = null;
      this.input.brake = false;
      brake.classList.remove('on');
    };
    brake.addEventListener('pointerup', brakeUp);
    brake.addEventListener('pointercancel', brakeUp);
    brake.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') brakeUp(e);
    });

    camBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (typeof this.cb.onCamera === 'function') this.cb.onCamera();
    });
    menuBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (typeof this.cb.onMenu === 'function') this.cb.onMenu();
    });

    this._buildPortraitOverlay();
  }

  _buildPortraitOverlay() {
    const ov = document.createElement('div');
    ov.className = 'mc-portrait';
    ov.style.display = 'none';
    ov.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="7" y="2" width="10" height="20" rx="2" stroke="#fbbf24" stroke-width="1.8"/>
        <circle cx="12" cy="18" r="1" fill="#fbbf24"/>
      </svg>
      <div class="mc-portrait-text">Rotate your phone for the best view</div>
    `;
    const btn = document.createElement('button');
    btn.className = 'mc-portrait-btn';
    btn.textContent = 'Play anyway';
    btn.addEventListener('click', () => {
      ov.style.display = 'none';
    });
    ov.appendChild(btn);
    document.body.appendChild(ov);
    this._portraitOverlay = ov;

    this._orientHandler = () => {
      if (!this._enabled || this._destroyed) return;
      const isPortrait = window.innerHeight > window.innerWidth;
      const tooNarrow = window.innerWidth < 560;
      ov.style.display = (isPortrait && tooNarrow) ? 'flex' : 'none';
    };
    window.addEventListener('orientationchange', this._orientHandler);
    this._orientHandler();
  }

  _onJoyDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (this._joy.active) return;
    this._joy.active = true;
    this._joy.pointerId = e.pointerId;
    this._joy.baseX = e.clientX;
    this._joy.baseY = e.clientY;
    const jb = this._els.joyBase;
    jb.style.left = e.clientX + 'px';
    jb.style.top = e.clientY + 'px';
    jb.style.display = 'block';
    this._els.joyKnob.style.left = '50%';
    this._els.joyKnob.style.top = '50%';
    try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
  }

  _onJoyMove(e) {
    if (!this._joy.active || e.pointerId !== this._joy.pointerId) return;
    e.preventDefault();
    let dx = e.clientX - this._joy.baseX;
    let dy = e.clientY - this._joy.baseY;
    const maxR = 55;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > maxR) {
      dx = (dx / len) * maxR;
      dy = (dy / len) * maxR;
    }
    this._joy.dx = dx;
    this._joy.dy = dy;
    const knob = this._els.joyKnob;
    knob.style.left = (50 + (dx / 110) * 100) + '%';
    knob.style.top = (50 + (dy / 110) * 100) + '%';

    const nx = dx / maxR;
    const ny = dy / maxR;
    const dz = 0.25;

    this.input.forward = ny < -dz;
    this.input.backward = ny > dz;
    this.input.left = nx < -dz;
    this.input.right = nx > dz;
  }

  _onJoyUp(e) {
    if (!this._joy.active) return;
    if (e.pointerId !== undefined && e.pointerId !== this._joy.pointerId) return;
    this._joy.active = false;
    this._joy.pointerId = null;
    this._joy.dx = 0;
    this._joy.dy = 0;
    const jb = this._els.joyBase;
    const knob = this._els.joyKnob;
    knob.style.transition = 'left 0.18s ease, top 0.18s ease';
    knob.style.left = '50%';
    knob.style.top = '50%';
    setTimeout(() => {
      if (knob) knob.style.transition = '';
      if (jb) jb.style.display = 'none';
    }, 180);
    this.input.forward = false;
    this.input.backward = false;
    this.input.left = false;
    this.input.right = false;
  }

  _bindGlobal() {
    if (typeof document === 'undefined') return;
    this._preventDefault = (e) => {
      if (e.target && e.target.classList && (e.target.classList.contains('mc-action') ||
        e.target.classList.contains('mc-brake') ||
        e.target.classList.contains('mc-small') ||
        e.target.classList.contains('mc-joy-zone'))) {
        e.preventDefault();
      }
    };
    this._contextMenu = (e) => {
      if (e.target && e.target.closest && e.target.closest('.mc-layer')) {
        e.preventDefault();
      }
    };
    this._gestureStart = (e) => {
      if (e.target && e.target.closest && e.target.closest('.mc-layer')) {
        e.preventDefault();
      }
    };
    this._resizeHandler = () => {
      if (this._orientHandler) this._orientHandler();
    };
    document.addEventListener('contextmenu', this._contextMenu);
    document.addEventListener('gesturestart', this._gestureStart);
    document.addEventListener('dblclick', this._gestureStart);
    window.addEventListener('resize', this._resizeHandler);
  }

  show() {
    if (!this._enabled || !this._els.layer) return;
    this._visible = true;
    this._els.layer.classList.remove('hidden');
  }

  hide() {
    if (!this._enabled || !this._els.layer) return;
    this._visible = false;
    this._els.layer.classList.add('hidden');
  }

  setActionLabel(text) {
    this._actionLabel = String(text || 'DIG / DUMP');
    if (this._els.action) this._els.action.textContent = this._actionLabel;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._els.layer && this._els.layer.parentNode) {
      this._els.layer.parentNode.removeChild(this._els.layer);
    }
    if (this._portraitOverlay && this._portraitOverlay.parentNode) {
      this._portraitOverlay.parentNode.removeChild(this._portraitOverlay);
    }
    this._portraitOverlay = null;
    if (this._orientHandler) window.removeEventListener('orientationchange', this._orientHandler);
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    if (this._contextMenu) document.removeEventListener('contextmenu', this._contextMenu);
    if (this._gestureStart) {
      document.removeEventListener('gesturestart', this._gestureStart);
      document.removeEventListener('dblclick', this._gestureStart);
    }
    window.removeEventListener('pointermove', this._onJoyMove);
    window.removeEventListener('pointerup', this._onJoyUp);
    window.removeEventListener('pointercancel', this._onJoyUp);
    if (typeof document !== 'undefined') document.body.classList.remove('touch-mode');
    const css = document.getElementById('mobile-controls-css');
    if (css && css.parentNode) css.parentNode.removeChild(css);
    this._els = {};
    this._enabled = false;
  }
}
