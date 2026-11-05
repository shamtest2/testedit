import * as THREE from 'three';

const LEVELS = [
  {
    id: 1, title: 'Clear the Highway', objective: 'Scoop and haul debris off the highway',
    loads: 3, timeLimit: 180, reward: 150, env: 'day',
    pile: { x: 0, z: -120 }, cones: [], barriers: [],
    hint: 'Drive to the dirt pile'
  },
  {
    id: 2, title: 'Sunset Rubble', objective: 'Clear the rubble before sundown',
    loads: 4, timeLimit: 200, reward: 250, env: 'sunset',
    pile: { x: -25, z: -135 }, cones: [], barriers: [],
    hint: 'The pile is to the left'
  },
  {
    id: 3, title: 'Night Shift', objective: 'Work the site through the night',
    loads: 5, timeLimit: 210, reward: 400, env: 'night',
    pile: { x: 30, z: -110 },
    cones: [
      { x: 12, z: -60 }, { x: 18, z: -72 }, { x: 24, z: -84 }, { x: 30, z: -96 },
      { x: 36, z: -84 }, { x: 42, z: -72 }, { x: 48, z: -60 }, { x: 54, z: -48 }
    ],
    barriers: [], hint: 'Slalom through the cones'
  },
  {
    id: 4, title: 'Foggy Morning', objective: 'Navigate the fog and clear the site',
    loads: 6, timeLimit: 230, reward: 600, env: 'fog',
    pile: { x: -30, z: -105 },
    cones: [],
    barriers: [
      { x: -22, z: -55, rot: 0 }, { x: -28, z: -55, rot: 0 },
      { x: -40, z: -55, rot: 0 }, { x: -46, z: -55, rot: 0 },
      { x: -22, z: -85, rot: 0 }, { x: -46, z: -85, rot: 0 }
    ],
    hint: 'Pass through the narrow gate'
  },
  {
    id: 5, title: 'Mega Site', objective: 'Complete the mega construction contract',
    loads: 8, timeLimit: 260, reward: 1000, env: 'dawn',
    pile: { x: 0, z: -140 },
    cones: [
      { x: -10, z: -70 }, { x: -4, z: -82 }, { x: 4, z: -82 }, { x: 10, z: -70 }
    ],
    barriers: [
      { x: -18, z: -100, rot: 0 }, { x: 18, z: -100, rot: 0 },
      { x: -18, z: -120, rot: 0 }, { x: 18, z: -120, rot: 0 }
    ],
    hint: 'Cones and barriers — thread the needle'
  }
];

const ENV = {
  day:    { sunColor: 0xfff2d6, sunIntensity: 1.5, sunPos: [60, 90, 40],  hemi: 0.85, fogColor: 0xd9e6f2, fogDensity: 0.0016 },
  sunset: { sunColor: 0xff8844, sunIntensity: 1.35, sunPos: [-100, 18, -60], hemi: 0.5,  fogColor: 0xffb070, fogDensity: 0.0022 },
  night:  { sunColor: 0x8899cc, sunIntensity: 0.25, sunPos: [-30, 70, -40], hemi: 0.18, fogColor: 0x0a1020, fogDensity: 0.0032 },
  fog:    { sunColor: 0xcfd6dd, sunIntensity: 0.7,  sunPos: [20, 55, 30],   hemi: 0.6,  fogColor: 0xb8c2cc, fogDensity: 0.012 },
  dawn:   { sunColor: 0xffc9a0, sunIntensity: 1.25, sunPos: [80, 25, -80],  hemi: 0.6,  fogColor: 0xffd4c0, fogDensity: 0.0026 }
};

export default class LevelSystem {
  constructor() {
    this._injectCSS();
    this._props = [];
    this._propMats = [];
    this._propGeos = [];
    this._envTarget = null;
    this._envTween = 0;
    this._envActive = false;
    this._envFrom = null;
    this._menu = null;
    this._completeEl = null;
    this._starSvgs = [];
  }

  getLevel(id) {
    return LEVELS.find(l => l.id === id) || null;
  }

  getAll() {
    return LEVELS;
  }

  _injectCSS() {
    if (document.getElementById('levelsys-css')) return;
    const s = document.createElement('style');
    s.id = 'levelsys-css';
    s.textContent = `
      .ls-menu {
        position: fixed; inset: 0;
        background: rgba(6,10,20,0.82);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        z-index: 10001;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        color: #fff;
        overflow-y: auto;
        padding: 28px 16px 60px;
        box-sizing: border-box;
      }
      .ls-menu-inner { max-width: 860px; margin: 0 auto; }
      .ls-menu-head {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 20px;
      }
      .ls-menu-title { font-size: 26px; font-weight: 800; color: #fbbf24; letter-spacing: 0.5px; }
      .ls-close {
        min-width: 56px; min-height: 56px;
        border-radius: 14px; border: 1px solid rgba(148,163,184,0.3);
        background: rgba(15,23,42,0.75); color: #fff;
        font-size: 22px; font-weight: 700; cursor: pointer;
        font-family: inherit;
      }
      .ls-close:hover { background: rgba(30,41,59,0.9); }
      .ls-grid {
        display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;
      }
      @media (max-width: 560px) { .ls-grid { grid-template-columns: 1fr; } }
      .ls-card {
        background: rgba(15,23,42,0.75);
        border: 1px solid rgba(148,163,184,0.22);
        border-radius: 14px; padding: 16px 18px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
        cursor: pointer; min-height: 56px;
        transition: transform 0.14s, border-color 0.14s;
        position: relative;
      }
      .ls-card:hover { transform: translateY(-2px); border-color: rgba(251,191,36,0.55); }
      .ls-card.locked { cursor: not-allowed; opacity: 0.6; }
      .ls-card.locked:hover { transform: none; border-color: rgba(148,163,184,0.22); }
      .ls-card-num { font-size: 13px; font-weight: 800; color: #fbbf24; letter-spacing: 1px; }
      .ls-card-title { font-size: 17px; font-weight: 700; margin: 4px 0 6px; }
      .ls-card-obj { font-size: 12px; color: #cbd5e1; margin-bottom: 10px; }
      .ls-card-meta { display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8; font-weight: 600; margin-bottom: 8px; }
      .ls-card-stars { display: flex; gap: 4px; }
      .ls-card-stars svg { width: 20px; height: 20px; }
      .ls-lock-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #f87171; font-weight: 600; margin-top: 8px; }
      .ls-lock-row svg { width: 16px; height: 16px; }
      .ls-done {
        position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
        background: rgba(6,10,20,0.7); z-index: 10002;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      .ls-done-card {
        background: rgba(15,23,42,0.92);
        border: 1px solid rgba(251,191,36,0.4);
        border-radius: 18px; padding: 26px 34px;
        text-align: center; color: #fff; min-width: 300px;
        box-shadow: 0 16px 48px rgba(0,0,0,0.55);
      }
      .ls-done-title { font-size: 24px; font-weight: 800; color: #fbbf24; letter-spacing: 1px; margin-bottom: 14px; }
      .ls-done-stars { display: flex; justify-content: center; gap: 10px; margin-bottom: 16px; }
      .ls-done-stars svg { width: 40px; height: 40px; opacity: 0; transform: scale(0.4); transition: opacity 0.3s, transform 0.3s; }
      .ls-done-stars svg.on { opacity: 1; transform: scale(1); }
      .ls-done-coins { font-size: 22px; font-weight: 800; color: #fbbf24; margin-bottom: 20px; }
      .ls-done-btns { display: flex; gap: 10px; justify-content: center; }
      .ls-btn {
        font-family: inherit; font-size: 15px; font-weight: 700;
        padding: 14px 22px; min-height: 56px; min-width: 90px;
        border-radius: 12px; border: none; cursor: pointer;
      }
      .ls-btn.primary { background: #fbbf24; color: #3a2c0a; }
      .ls-btn.primary:hover { background: #ffe17a; }
      .ls-btn.ghost { background: rgba(148,163,184,0.2); color: #fff; border: 1px solid rgba(148,163,184,0.3); }
      .ls-btn.ghost:hover { background: rgba(148,163,184,0.32); }
    `;
    document.head.appendChild(s);
  }

  _starSVG(filled) {
    const fill = filled ? '#fbbf24' : 'rgba(148,163,184,0.25)';
    const stroke = filled ? '#b45309' : 'rgba(148,163,184,0.4)';
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.9 6.3 6.9.9-5 4.7 1.3 6.8L12 17.6 5.9 20.7 7.2 13.9l-5-4.7 6.9-.9L12 2z" fill="${fill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
  }

  _lockSVG() {
    return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="10" width="16" height="11" rx="2" stroke="#f87171" stroke-width="1.8"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#f87171" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  }

  isUnlocked(id, progress) {
    if (!progress) return id === 1;
    const unlocked = progress.unlocked || 1;
    return id <= unlocked;
  }

  getStars(timeLeft, timeLimit) {
    if (!timeLimit || timeLimit <= 0) return 1;
    const ratio = timeLeft / timeLimit;
    if (ratio > 0.5) return 3;
    if (ratio > 0.2) return 2;
    return 1;
  }

  load(obj) {
    if (!obj || typeof obj !== 'object') return { unlocked: 1, stars: {} };
    return {
      unlocked: Math.max(1, Math.floor(obj.unlocked || 1)),
      stars: obj.stars && typeof obj.stars === 'object' ? Object.assign({}, obj.stars) : {}
    };
  }

  toJSON() {
    return { unlocked: 1, stars: {} };
  }

  applyEnvironment(id, scene, world) {
    const level = this.getLevel(id) || LEVELS[0];
    const preset = ENV[level.env] || ENV.day;
    const target = {
      sunColor: new THREE.Color(preset.sunColor),
      sunIntensity: preset.sunIntensity,
      sunPos: new THREE.Vector3(preset.sunPos[0], preset.sunPos[1], preset.sunPos[2]),
      hemi: preset.hemi,
      fogColor: new THREE.Color(preset.fogColor),
      fogDensity: preset.fogDensity
    };

    const from = {
      sunColor: world.sunLight ? world.sunLight.color.clone() : new THREE.Color(0xffffff),
      sunIntensity: world.sunLight ? world.sunLight.intensity : 1,
      sunPos: world.sunLight ? world.sunLight.position.clone() : new THREE.Vector3(0, 50, 0),
      hemi: world.hemiLight ? world.hemiLight.intensity : 0.5,
      fogColor: scene.fog && scene.fog.color ? scene.fog.color.clone() : new THREE.Color(0xffffff),
      fogDensity: scene.fog && typeof scene.fog.density === 'number' ? scene.fog.density : 0.002
    };

    this._envFrom = from;
    this._envTarget = target;
    this._envTween = 0;
    this._envActive = true;
    this._envScene = scene;
    this._envWorld = world;

    if (!scene.fog) scene.fog = new THREE.FogExp2(preset.fogColor, preset.fogDensity);
  }

  _stepEnvironment(dt) {
    if (!this._envActive || !this._envTarget) return;
    const dur = 1.5;
    this._envTween += dt;
    let t = this._envTween / dur;
    if (t > 1) t = 1;
    const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const from = this._envFrom;
    const to = this._envTarget;
    const scene = this._envScene;
    const world = this._envWorld;

    if (world && world.sunLight) {
      world.sunLight.color.copy(from.sunColor).lerp(to.sunColor, k);
      world.sunLight.intensity = from.sunIntensity + (to.sunIntensity - from.sunIntensity) * k;
      world.sunLight.position.copy(from.sunPos).lerp(to.sunPos, k);
    }
    if (world && world.hemiLight) {
      world.hemiLight.intensity = from.hemi + (to.hemi - from.hemi) * k;
    }
    if (scene && scene.fog) {
      if (scene.fog.color) scene.fog.color.copy(from.fogColor).lerp(to.fogColor, k);
      if (typeof scene.fog.density === 'number') {
        scene.fog.density = from.fogDensity + (to.fogDensity - from.fogDensity) * k;
      }
    }
    if (t >= 1) this._envActive = false;
  }

  buildProps(id, scene) {
    this.clearProps();
    const level = this.getLevel(id);
    if (!level || !scene) return;

    const coneGeo = new THREE.ConeGeometry(0.22, 0.7, 12);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.8 });
    const stripeGeo = new THREE.CylinderGeometry(0.13, 0.17, 0.12, 12);
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const baseGeo = new THREE.BoxGeometry(0.5, 0.06, 0.5);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });

    const barGeo = new THREE.BoxGeometry(3.2, 0.9, 0.45);
    const barMat = new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.85 });

    this._propGeos.push(coneGeo, stripeGeo, baseGeo, barGeo);
    this._propMats.push(coneMat, stripeMat, baseMat, barMat);

    const cones = level.cones || [];
    for (let i = 0; i < cones.length; i++) {
      const c = cones[i];
      const g = new THREE.Group();
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 0.03;
      base.castShadow = true;
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.y = 0.38;
      cone.castShadow = true;
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.y = 0.42;
      g.add(base, cone, stripe);
      g.position.set(c.x, 0, c.z);
      scene.add(g);
      this._props.push(g);
    }

    const barriers = level.barriers || [];
    for (let i = 0; i < barriers.length; i++) {
      const b = barriers[i];
      const m = new THREE.Mesh(barGeo, barMat);
      m.position.set(b.x, 0.45, b.z);
      m.rotation.y = b.rot || 0;
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      this._props.push(m);
    }
  }

  clearProps() {
    for (let i = 0; i < this._props.length; i++) {
      const p = this._props[i];
      if (p.parent) p.parent.remove(p);
    }
    this._props.length = 0;
    for (let i = 0; i < this._propGeos.length; i++) {
      try { this._propGeos[i].dispose(); } catch (e) {}
    }
    for (let i = 0; i < this._propMats.length; i++) {
      try { this._propMats[i].dispose(); } catch (e) {}
    }
    this._propGeos.length = 0;
    this._propMats.length = 0;
  }

  update(dt) {
    this._stepEnvironment(dt);
  }

  showMenu(progress, onPick) {
    this.hideMenu();
    const prog = progress || { unlocked: 1, stars: {} };
    const menu = document.createElement('div');
    menu.className = 'ls-menu';

    const inner = document.createElement('div');
    inner.className = 'ls-menu-inner';

    const head = document.createElement('div');
    head.className = 'ls-menu-head';
    const title = document.createElement('div');
    title.className = 'ls-menu-title';
    title.textContent = 'Select Job';
    const close = document.createElement('button');
    close.className = 'ls-close';
    close.textContent = '✕';
    close.addEventListener('click', () => this.hideMenu());
    head.appendChild(title);
    head.appendChild(close);
    inner.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'ls-grid';

    for (let i = 0; i < LEVELS.length; i++) {
      const lvl = LEVELS[i];
      const unlocked = this.isUnlocked(lvl.id, prog);
      const stars = (prog.stars && prog.stars[lvl.id]) || 0;

      const card = document.createElement('div');
      card.className = 'ls-card' + (unlocked ? '' : ' locked');

      const num = document.createElement('div');
      num.className = 'ls-card-num';
      num.textContent = 'JOB ' + lvl.id;
      card.appendChild(num);

      const t = document.createElement('div');
      t.className = 'ls-card-title';
      t.textContent = lvl.title;
      card.appendChild(t);

      const o = document.createElement('div');
      o.className = 'ls-card-obj';
      o.textContent = lvl.objective;
      card.appendChild(o);

      const meta = document.createElement('div');
      meta.className = 'ls-card-meta';
      const rw = document.createElement('span');
      rw.textContent = '🪙 ' + lvl.reward;
      const tm = document.createElement('span');
      tm.textContent = lvl.timeLimit + 's';
      meta.appendChild(rw);
      meta.appendChild(tm);
      card.appendChild(meta);

      if (unlocked) {
        const starRow = document.createElement('div');
        starRow.className = 'ls-card-stars';
        for (let s = 0; s < 3; s++) {
          const wrap = document.createElement('span');
          wrap.innerHTML = this._starSVG(s < stars);
          starRow.appendChild(wrap.firstChild);
        }
        card.appendChild(starRow);
        card.addEventListener('click', () => {
          this.hideMenu();
          if (typeof onPick === 'function') onPick(lvl.id);
        });
      } else {
        const lockRow = document.createElement('div');
        lockRow.className = 'ls-lock-row';
        lockRow.innerHTML = this._lockSVG() + '<span>Finish level ' + (lvl.id - 1) + ' first</span>';
        card.appendChild(lockRow);
      }

      grid.appendChild(card);
    }

    inner.appendChild(grid);
    menu.appendChild(inner);
    document.body.appendChild(menu);
    this._menu = menu;
  }

  hideMenu() {
    if (this._menu) {
      if (this._menu.parentNode) this._menu.parentNode.removeChild(this._menu);
      this._menu = null;
    }
  }

  showComplete(result, onNext, onRetry, onMenu) {
    this.hideComplete();
    const res = result || { coins: 0, stars: 0, timeLeft: 0 };
    const el = document.createElement('div');
    el.className = 'ls-done';

    const card = document.createElement('div');
    card.className = 'ls-done-card';

    const title = document.createElement('div');
    title.className = 'ls-done-title';
    title.textContent = 'JOB COMPLETE';
    card.appendChild(title);

    const starRow = document.createElement('div');
    starRow.className = 'ls-done-stars';
    const starEls = [];
    for (let s = 0; s < 3; s++) {
      const wrap = document.createElement('span');
      wrap.innerHTML = this._starSVG(s < res.stars);
      const svg = wrap.firstChild;
      starRow.appendChild(svg);
      starEls.push(svg);
    }
    card.appendChild(starRow);
    this._starSvgs = starEls;

    const coins = document.createElement('div');
    coins.className = 'ls-done-coins';
    coins.textContent = '🪙 0';
    card.appendChild(coins);

    const btns = document.createElement('div');
    btns.className = 'ls-done-btns';

    const btnNext = document.createElement('button');
    btnNext.className = 'ls-btn primary';
    btnNext.textContent = 'Next';
    btnNext.addEventListener('click', () => {
      this.hideComplete();
      if (typeof onNext === 'function') onNext();
    });

    const btnRetry = document.createElement('button');
    btnRetry.className = 'ls-btn ghost';
    btnRetry.textContent = 'Retry';
    btnRetry.addEventListener('click', () => {
      this.hideComplete();
      if (typeof onRetry === 'function') onRetry();
    });

    const btnMenu = document.createElement('button');
    btnMenu.className = 'ls-btn ghost';
    btnMenu.textContent = 'Menu';
    btnMenu.addEventListener('click', () => {
      this.hideComplete();
      if (typeof onMenu === 'function') onMenu();
    });

    btns.appendChild(btnNext);
    btns.appendChild(btnRetry);
    btns.appendChild(btnMenu);
    card.appendChild(btns);

    el.appendChild(card);
    document.body.appendChild(el);
    this._completeEl = el;

    for (let i = 0; i < starEls.length; i++) {
      if (i < res.stars) {
        (function (el2, delay) {
          setTimeout(() => el2.classList.add('on'), delay);
        })(starEls[i], 250 + i * 280);
      }
    }

    const target = res.coins || 0;
    let val = 0;
    const startAt = performance.now() + 250;
    const anim = (now) => {
      if (!coins.parentNode) return;
      if (now < startAt) { requestAnimationFrame(anim); return; }
      const diff = target - val;
      if (Math.abs(diff) < 0.5) {
        coins.textContent = '🪙 ' + target;
        return;
      }
      val += diff * 0.15;
      coins.textContent = '🪙 ' + Math.round(val);
      requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  }

  hideComplete() {
    if (this._completeEl) {
      if (this._completeEl.parentNode) this._completeEl.parentNode.removeChild(this._completeEl);
      this._completeEl = null;
    }
    this._starSvgs = [];
  }
}
