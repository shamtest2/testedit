// GameUI.js - mission card, round speedometer (bottom right), toasts, hint, coin counter.
// All styles are injected here (class prefix "tf-"). No outside fonts, images or scripts.
// Public API (used by main.js): setJob, setTimer, setCoins, setSpeed, toast, showLocked, setHint, reset.
// The dial mounts into <div id="dial-slot"> from index.html (falls back to a fixed corner if missing).
// Dial v3: big number in the exact centre, a glowing dot on the ring, ring and ticks go green -> yellow -> red.

const SVGNS = 'http://www.w3.org/2000/svg';
const MAX_KMH = 45;                    // dial scale end (top speed with all upgrades is 42)
const R_TRACK = 76;
const ARC = 2 * Math.PI * R_TRACK;     // full circle length
const SWEEP = ARC * 0.75;              // 270 degrees

const CSS = `
:root{--tf-dial:clamp(112px,min(26vh,30vw),184px);}
@media (max-width:560px){:root{--tf-dial:112px;}}
@media (max-height:420px){:root{--tf-dial:100px;}}
.tf-card,.tf-dial,.tf-toasts,.tf-hint,.tf-locked{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;user-select:none;-webkit-user-select:none;}

.tf-card{position:fixed;top:calc(var(--edge,10px) + env(safe-area-inset-top));left:50%;transform:translateX(-50%);width:min(440px,calc(100vw - 380px));min-width:240px;z-index:4;pointer-events:none;border-radius:12px;overflow:hidden;color:#fff;
 background:linear-gradient(180deg,#2b384e,#18212f);border:2px solid #0a0f18;
 box-shadow:0 4px 0 #070b12,0 12px 24px rgba(0,0,0,.42),inset 0 2px 0 rgba(255,255,255,.13);}
.tf-stripe{height:7px;background:repeating-linear-gradient(-45deg,#fbbf24 0 10px,#151b27 10px 20px);}
.tf-body{padding:10px 14px 12px;}
.tf-row{display:flex;align-items:center;gap:10px;}
.tf-ico{width:22px;height:22px;flex:none;}
.tf-title{flex:1;min-width:0;font-size:18px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#fbbf24;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 0 rgba(0,0,0,.5);}
.tf-timer{flex:none;display:flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:#0a1019;border:1px solid rgba(255,255,255,.16);font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;color:#e2e8f0;}
.tf-timer svg{width:16px;height:16px;}
.tf-timer.warn{color:#fbbf24;border-color:rgba(251,191,36,.7);}
.tf-timer.danger{color:#fca5a5;border-color:rgba(239,68,68,.9);animation:tf-pulse .8s ease-in-out infinite;}
.tf-timer.off{display:none;}
.tf-obj{margin:6px 0 8px;font-size:16px;color:#cbd5e1;line-height:1.3;}
.tf-stepline{display:flex;justify-content:space-between;align-items:baseline;font-size:16px;font-weight:700;}
.tf-count{color:#fbbf24;font-variant-numeric:tabular-nums;}
.tf-bar{margin-top:6px;height:12px;border-radius:7px;background:#0a1019;box-shadow:inset 0 2px 3px rgba(0,0,0,.7);overflow:hidden;border:1px solid rgba(255,255,255,.08);}
.tf-fill{height:100%;width:0;border-radius:6px;background:linear-gradient(180deg,#fde68a,#f59e0b 55%,#d97706);box-shadow:0 0 10px rgba(251,191,36,.6);transition:width .45s cubic-bezier(.2,.8,.2,1);}

.tf-toasts{position:fixed;left:50%;top:calc(var(--tf-card-h,130px) + 28px);transform:translateX(-50%);z-index:6;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;}
.tf-toast{display:flex;align-items:center;gap:10px;padding:8px 16px 8px 12px;border-radius:12px;font-size:18px;font-weight:700;color:#fff;max-width:90vw;text-align:center;
 background:linear-gradient(180deg,#2b384e,#18212f);border:2px solid #0a0f18;border-left:6px solid #fbbf24;
 box-shadow:0 4px 0 #070b12,0 10px 22px rgba(0,0,0,.45);animation:tf-in .28s cubic-bezier(.2,.9,.3,1.2) both;}
.tf-toast::before{content:"";width:12px;height:12px;border-radius:50%;background:#fbbf24;flex:none;box-shadow:0 0 10px #fbbf24;}
.tf-toast.tf-success{border-left-color:#22c55e;}
.tf-toast.tf-success::before{background:#22c55e;box-shadow:0 0 10px #22c55e;}
.tf-toast.tf-warn{border-left-color:#f97316;}
.tf-toast.tf-warn::before{background:#f97316;box-shadow:0 0 10px #f97316;}
.tf-toast.out{animation:tf-out .3s ease-in both;}

.tf-hint{position:fixed;left:50%;bottom:calc(var(--edge,10px) + 112px);transform:translateX(-50%);z-index:4;padding:6px 16px;border-radius:999px;font-size:18px;font-weight:700;
 background:#0a1019;border:2px solid rgba(251,191,36,.6);color:#fde68a;pointer-events:none;max-width:90vw;text-align:center;box-shadow:0 4px 0 #070b12;}
.tf-hint.off{display:none;}

.tf-locked{position:fixed;left:50%;top:42%;z-index:7;display:flex;align-items:center;gap:10px;padding:12px 22px;border-radius:14px;font-size:20px;font-weight:800;color:#fff;pointer-events:none;
 background:linear-gradient(180deg,#4a2730,#241217);border:2px solid #0a0f18;box-shadow:0 4px 0 #070b12,0 12px 30px rgba(0,0,0,.55);animation:tf-lock 2.2s ease both;}
.tf-locked svg{width:24px;height:24px;flex:none;}

.tf-dial{position:relative;width:var(--tf-dial);height:var(--tf-dial);flex:none;pointer-events:none;z-index:4;filter:drop-shadow(0 7px 9px rgba(0,0,0,.65));}
.tf-dial.tf-float{position:fixed;right:10px;bottom:10px;}
.tf-dial svg{width:100%;height:100%;display:block;overflow:visible;}
.tf-prog{filter:drop-shadow(0 0 6px rgba(255,255,255,.35));}
.tf-dot{filter:drop-shadow(0 0 5px rgba(255,255,255,.95));}
.tf-num{font-size:56px;font-weight:800;fill:#fff;font-variant-numeric:tabular-nums;stroke:#000;stroke-opacity:.55;stroke-width:3px;paint-order:stroke;}
.tf-unit{font-size:17px;font-weight:700;fill:#9fb0c6;letter-spacing:.08em;}

@media (max-height:520px),(max-width:560px){ .tf-unit{display:none;} }
@media (max-height:520px){
 .tf-obj{display:none;}
 .tf-body{padding:7px 12px 9px;}
 .tf-stripe{height:6px;}
 .tf-title{font-size:17px;}
 .tf-bar{height:10px;margin-top:5px;}
}
@media (max-width:560px),(max-height:420px){
 .tf-card{top:var(--edge,8px);left:calc(var(--lc,92px) + var(--edge,8px) + 4px);right:calc(var(--mm,84px) + var(--edge,8px) + 8px);transform:none;width:auto;min-width:0;max-width:440px;margin:0 auto;}
 .tf-title{font-size:16px;white-space:normal;line-height:1.1;overflow:visible;}
 .tf-timer{font-size:16px;padding:2px 8px;}
 .tf-obj{display:none;}
 .tf-body{padding:8px 10px 10px;}
 .tf-ico{display:none;}
}
@keyframes tf-in{from{opacity:0;transform:translateY(-12px) scale(.94);}to{opacity:1;transform:none;}}
@keyframes tf-out{to{opacity:0;transform:translateY(-8px) scale(.96);}}
@keyframes tf-pulse{50%{opacity:.55;}}
@keyframes tf-lock{0%{opacity:0;transform:translate(-50%,-50%) scale(.9);}12%,80%{opacity:1;transform:translate(-50%,-50%) scale(1);}100%{opacity:0;transform:translate(-50%,-60%) scale(1);}}
`;

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function sv(tag, attrs) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

export class GameUI {
  constructor() {
    // remove leftovers (hot reload safety)
    document.querySelectorAll('.tf-card,.tf-dial,.tf-toasts,.tf-hint,.tf-locked').forEach((n) => n.remove());
    const oldCss = document.getElementById('tf-ui-css');
    if (oldCss) oldCss.remove();
    const st = document.createElement('style');
    st.id = 'tf-ui-css';
    st.textContent = CSS;
    document.head.appendChild(st);

    this._speedIn = 0;
    this._shown = 0;
    this._lastNum = -1;
    this._lastKey = '';
    this._timerTxt = '';
    this._coinRaf = 0;
    this._speedEl = null;
    this._lastT = 0;
    this._ticks = [];

    this._buildCard();
    this._buildDial();

    this.toasts = mk('div', 'tf-toasts');
    this.hint = mk('div', 'tf-hint off');
    document.body.appendChild(this.toasts);
    document.body.appendChild(this.hint);

    if (window.ResizeObserver) {
      new ResizeObserver(() => {
        document.documentElement.style.setProperty('--tf-card-h', this.card.offsetHeight + 'px');
      }).observe(this.card);
    }
    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
  }

  /* ---------- mission card ---------- */
  _buildCard() {
    const card = mk('div', 'tf-card');
    card.appendChild(mk('div', 'tf-stripe'));
    const body = mk('div', 'tf-body');

    const row = mk('div', 'tf-row');
    const flag = sv('svg', { viewBox: '0 0 24 24', class: 'tf-ico', fill: 'none', stroke: '#fbbf24', 'stroke-width': '2.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    flag.appendChild(sv('path', { d: 'M5 3v18M5 4h13l-3 4.5 3 4.5H5' }));
    this._title = mk('div', 'tf-title', '');
    const timer = mk('div', 'tf-timer off');
    const clock = sv('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.6', 'stroke-linecap': 'round' });
    clock.appendChild(sv('circle', { cx: '12', cy: '13', r: '8' }));
    clock.appendChild(sv('path', { d: 'M12 9v4.5l3 2M9 2.5h6' }));
    this._timerTxtEl = mk('span', null, '0:00');
    timer.appendChild(clock);
    timer.appendChild(this._timerTxtEl);
    this._timer = timer;
    row.appendChild(flag);
    row.appendChild(this._title);
    row.appendChild(timer);

    this._obj = mk('div', 'tf-obj', '');
    const sl = mk('div', 'tf-stepline');
    this._step = mk('span', null, '');
    this._count = mk('span', 'tf-count', '');
    sl.appendChild(this._step);
    sl.appendChild(this._count);
    const bar = mk('div', 'tf-bar');
    this._fill = mk('div', 'tf-fill');
    bar.appendChild(this._fill);

    body.appendChild(row);
    body.appendChild(this._obj);
    body.appendChild(sl);
    body.appendChild(bar);
    card.appendChild(body);
    document.body.appendChild(card);
    this.card = card;
  }

  /* ---------- round speedometer v3 ---------- */
  _buildDial() {
    const wrap = mk('div', 'tf-dial');
    const s = sv('svg', { viewBox: '0 0 200 200' });
    const defs = sv('defs', {});
    const g1 = sv('linearGradient', { id: 'tfBez', x1: '0', y1: '0', x2: '0', y2: '1' });
    g1.appendChild(sv('stop', { offset: '0', 'stop-color': '#f1f5fb' }));
    g1.appendChild(sv('stop', { offset: '.4', 'stop-color': '#94a0b6' }));
    g1.appendChild(sv('stop', { offset: '1', 'stop-color': '#2a3447' }));
    const g2 = sv('radialGradient', { id: 'tfFace', cx: '.5', cy: '.35', r: '.75' });
    g2.appendChild(sv('stop', { offset: '0', 'stop-color': '#35507a' }));
    g2.appendChild(sv('stop', { offset: '.6', 'stop-color': '#16233a' }));
    g2.appendChild(sv('stop', { offset: '1', 'stop-color': '#090f1a' }));
    const g3 = sv('linearGradient', { id: 'tfGlass', x1: '0', y1: '0', x2: '0', y2: '1' });
    g3.appendChild(sv('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '.26' }));
    g3.appendChild(sv('stop', { offset: '1', 'stop-color': '#ffffff', 'stop-opacity': '0' }));
    const g4 = sv('radialGradient', { id: 'tfWell', cx: '.5', cy: '.6', r: '.6' });
    g4.appendChild(sv('stop', { offset: '0', 'stop-color': '#0b1322', 'stop-opacity': '.95' }));
    g4.appendChild(sv('stop', { offset: '1', 'stop-color': '#050912', 'stop-opacity': '.95' }));
    defs.appendChild(g1);
    defs.appendChild(g2);
    defs.appendChild(g3);
    defs.appendChild(g4);
    s.appendChild(defs);

    // rim and face
    s.appendChild(sv('circle', { cx: 100, cy: 100, r: 99, fill: '#04070c' }));
    s.appendChild(sv('circle', { cx: 100, cy: 100, r: 96, fill: 'url(#tfBez)' }));
    s.appendChild(sv('circle', { cx: 100, cy: 100, r: 89, fill: '#070b12' }));
    s.appendChild(sv('circle', { cx: 100, cy: 100, r: 86, fill: 'url(#tfFace)' }));
    s.appendChild(sv('circle', { cx: 100, cy: 100, r: 86, fill: 'none', stroke: 'rgba(0,0,0,.55)', 'stroke-width': 4 }));

    // ring track and live arc
    const rot = 'rotate(135 100 100)';
    s.appendChild(sv('circle', { cx: 100, cy: 100, r: R_TRACK, fill: 'none', stroke: 'rgba(0,0,0,.5)', 'stroke-width': 13, 'stroke-linecap': 'round', 'stroke-dasharray': SWEEP + ' ' + ARC, transform: rot }));
    s.appendChild(sv('circle', { cx: 100, cy: 100, r: R_TRACK, fill: 'none', stroke: 'rgba(255,255,255,.12)', 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-dasharray': SWEEP + ' ' + ARC, transform: rot }));
    this._prog = sv('circle', { cx: 100, cy: 100, r: R_TRACK, fill: 'none', stroke: '#22c55e', 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-dasharray': '0.01 ' + ARC, transform: rot, class: 'tf-prog' });
    s.appendChild(this._prog);

    // ticks (no numbers): they light up with the speed
    this._ticks = [];
    for (let v = 0; v <= MAX_KMH; v += 5) {
      const a = ((135 + 270 * v / MAX_KMH) * Math.PI) / 180;
      const major = v % 10 === 0;
      const r1 = 66, r2 = major ? 56 : 60;
      const base = major ? '#cbd5e1' : '#64748b';
      const ln = sv('line', {
        x1: 100 + r1 * Math.cos(a), y1: 100 + r1 * Math.sin(a),
        x2: 100 + r2 * Math.cos(a), y2: 100 + r2 * Math.sin(a),
        stroke: base, 'stroke-width': major ? 3.2 : 2.4, 'stroke-linecap': 'round',
      });
      s.appendChild(ln);
      this._ticks.push({ el: ln, v: v, base: base });
    }

    // sunken well for the number
    s.appendChild(sv('circle', { cx: 100, cy: 100, r: 49, fill: 'url(#tfWell)', stroke: 'rgba(255,255,255,.14)', 'stroke-width': 2 }));
    s.appendChild(sv('circle', { cx: 100, cy: 100, r: 46, fill: 'none', stroke: 'rgba(0,0,0,.6)', 'stroke-width': 3 }));

    // the number: exact centre
    this._num = sv('text', { x: 100, y: 116, 'text-anchor': 'middle', class: 'tf-num' });
    this._num.textContent = '0';
    const unit = sv('text', { x: 100, y: 141, 'text-anchor': 'middle', class: 'tf-unit' });
    unit.textContent = 'km/h';
    s.appendChild(this._num);
    s.appendChild(unit);

    // glowing dot that runs on the ring
    this._dot = sv('g', { transform: 'rotate(135 100 100)' });
    this._dotC = sv('circle', { cx: 100 + R_TRACK, cy: 100, r: 7.5, fill: '#ffffff', stroke: '#22c55e', 'stroke-width': 3, class: 'tf-dot' });
    this._dot.appendChild(this._dotC);
    s.appendChild(this._dot);

    // glass shine over the top half
    s.appendChild(sv('ellipse', { cx: 100, cy: 56, rx: 62, ry: 34, fill: 'url(#tfGlass)' }));

    wrap.appendChild(s);
    const slot = document.getElementById('dial-slot');
    if (slot) {
      slot.innerHTML = '';
      slot.appendChild(wrap);
    } else {
      wrap.classList.add('tf-float');
      document.body.appendChild(wrap);
    }
    this.dial = wrap;
  }

  _tick(t) {
    this._raf = requestAnimationFrame(this._tick);
    const dt = Math.min(0.1, this._lastT ? (t - this._lastT) / 1000 : 0.016);
    this._lastT = t;
    if (!this._speedEl) this._speedEl = document.getElementById('speed-val');
    let target = this._speedIn;
    if (this._speedEl) {
      const n = parseFloat(this._speedEl.textContent);
      if (isFinite(n)) target = n;
    }
    target = Math.max(0, Math.min(MAX_KMH + 8, target));
    this._shown += (target - this._shown) * Math.min(1, dt * 12);
    const v = Math.min(this._shown, MAX_KMH);
    const rounded = Math.round(this._shown);
    if (rounded !== this._lastNum) {
      this._lastNum = rounded;
      this._num.textContent = String(rounded);
    }
    const ang = 135 + 270 * v / MAX_KMH;
    this._dot.setAttribute('transform', 'rotate(' + ang.toFixed(2) + ' 100 100)');
    this._prog.setAttribute('stroke-dasharray', Math.max(0.01, SWEEP * v / MAX_KMH).toFixed(2) + ' ' + ARC.toFixed(2));

    // colour: green (low) -> yellow -> orange -> red (top speed)
    const hue = Math.round(120 * (1 - Math.min(1, v / MAX_KMH)));
    let lit = 0;
    if (v > 0.3) {
      for (let i = 0; i < this._ticks.length; i++) if (this._ticks[i].v <= v) lit = i + 1;
    }
    const key = hue + ':' + lit;
    if (key !== this._lastKey) {
      this._lastKey = key;
      const col = 'hsl(' + hue + ',92%,54%)';
      this._prog.setAttribute('stroke', col);
      this._dotC.setAttribute('stroke', col);
      for (let i = 0; i < this._ticks.length; i++) {
        this._ticks[i].el.setAttribute('stroke', i < lit ? col : this._ticks[i].base);
      }
    }
  }

  /* ---------- public API ---------- */
  setJob(title, objective, stepText) {
    this._title.textContent = title || '';
    this._obj.textContent = objective || '';
    const txt = String(stepText == null ? '' : stepText);
    const m = /^(.*?)\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(txt);
    let pct = 0;
    if (m) {
      this._step.textContent = m[1] || 'Progress';
      this._count.textContent = m[2] + '/' + m[3];
      const total = parseInt(m[3], 10);
      pct = total > 0 ? (parseInt(m[2], 10) / total) * 100 : 0;
    } else {
      this._step.textContent = txt;
      this._count.textContent = '';
    }
    this._fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }

  setTimer(sec) {
    if (sec == null || !isFinite(sec)) {
      this._timer.classList.add('off');
      return;
    }
    sec = Math.max(0, Math.ceil(sec));
    const txt = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    this._timer.classList.remove('off');
    if (txt !== this._timerTxt) {
      this._timerTxt = txt;
      this._timerTxtEl.textContent = txt;
    }
    this._timer.classList.toggle('danger', sec <= 10);
    this._timer.classList.toggle('warn', sec > 10 && sec <= 30);
  }

  setCoins(n) {
    n = Math.max(0, Math.round(Number(n) || 0));
    const el = document.getElementById('coin-count');
    if (!el) return;
    cancelAnimationFrame(this._coinRaf);
    const from = parseInt(String(el.textContent).replace(/\D/g, ''), 10) || 0;
    if (from === n) {
      el.textContent = String(n);
      return;
    }
    const t0 = performance.now();
    const dur = 600;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = String(Math.round(from + (n - from) * e));
      if (k < 1) this._coinRaf = requestAnimationFrame(step);
    };
    this._coinRaf = requestAnimationFrame(step);
  }

  setSpeed(v) {
    const n = Number(v);
    if (isFinite(n)) this._speedIn = n;
  }

  toast(message, type) {
    const kind = type === 'success' || type === 'warn' ? type : 'info';
    const t = mk('div', 'tf-toast tf-' + kind, String(message == null ? '' : message));
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.removeChild(this.toasts.firstChild);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 320);
    }, 2500);
  }

  showLocked(text) {
    document.querySelectorAll('.tf-locked').forEach((n) => n.remove());
    const box = mk('div', 'tf-locked');
    const lock = sv('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: '#fca5a5', 'stroke-width': '2.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    lock.appendChild(sv('rect', { x: '5', y: '11', width: '14', height: '10', rx: '2' }));
    lock.appendChild(sv('path', { d: 'M8 11V8a4 4 0 0 1 8 0v3' }));
    box.appendChild(lock);
    box.appendChild(mk('span', null, String(text || 'Locked')));
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 2300);
  }

  setHint(text) {
    if (!text) {
      this.hint.classList.add('off');
      return;
    }
    this.hint.textContent = String(text);
    this.hint.classList.remove('off');
  }

  reset() {
    this.toasts.innerHTML = '';
    this.hint.classList.add('off');
    document.querySelectorAll('.tf-locked').forEach((n) => n.remove());
  }
}

export default GameUI;
