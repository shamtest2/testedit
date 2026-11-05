// TerraForm 3D - real jobs, levels, economy, ranks, daily bonus (M7a part 1).
// Pure logic plus its own small window system (briefing, result, fail, job picker).
// No THREE needed. main.js connects to it in M7a part 2.
// Coins stay in main.js (saveData.coins). This file only tells main.js how many to add.

const SAVE_KEY = 'terraform_jobs_v1';
const ROAD_POS = [-240, -160, -80, 80, 160, 240];
const ROAD_HALF = 12;
const SITE_R = 11;

export const MAX_LEVEL = 4;
export const START = { x: -35, y: 1.2, z: 10, yaw: Math.PI };
export const STAR_MULT = [1, 1.15, 1.3];
export const TIPS = [10, 16, 24, 34];
export const DAILY = [50, 75, 100, 150, 200, 300, 500];

export const RANKS = [
  { name: 'Rookie', xp: 0 },
  { name: 'Operator', xp: 150 },
  { name: 'Foreman', xp: 400 },
  { name: 'Site Boss', xp: 800 },
  { name: 'Master Builder', xp: 1400 },
  { name: 'Legend', xp: 2200 }
];

export const UPGRADES = {
  engine: {
    name: 'Engine Power',
    prices: [100, 250, 500],
    lines: ['Top speed 32 km/h', 'Top speed 37 km/h', 'Top speed 42 km/h', 'Top speed 47 km/h']
  },
  hydraulic: {
    name: 'Hydraulics',
    prices: [100, 250, 500],
    lines: ['Arm speed 100%', 'Arm speed 160%', 'Arm speed 220%', 'Arm speed 280%']
  },
  bucket: {
    name: 'Big Bucket',
    prices: [150, 300, 600],
    lines: ['Tip 10 coins per load', 'Tip 16 coins per load', 'Tip 24 coins per load', 'Tip 34 coins per load']
  }
};

// bearing: 0 = north (-z), 90 = east. dist = metres from the garage. gap = pile to truck distance.
export const JOBS = [
  {
    id: 1, name: 'Clear the Highway', theme: 'Storm clean-up',
    story: 'A storm dumped dirt across the highway. Clear it before rush hour!',
    loads: 3, time: 180, reward: 150, tutorial: true, needs: {},
    scoopText: 'Scoop dirt from the pile', dumpText: 'Dump it in the blue truck',
    hints: { scoop: 'Drive to the dirt pile, then press F to scoop.', dump: 'Now drive to the blue truck and press F to dump.' },
    env: { id: 'day', sun: 1, hemi: 1, fog: 0.0011, fogColor: 0xcfe2f3 },
    site: { keep: true }
  },
  {
    id: 2, name: 'Park Clean-up', theme: 'Landslide',
    story: 'A landslide buried the paths of the city park. Move the dirt to the truck.',
    loads: 4, time: 210, reward: 220, needs: { job: 1 },
    scoopText: 'Scoop the landslide dirt', dumpText: 'Dump it in the park truck',
    hints: { scoop: 'New place, longer drive. Follow the arrow on the map.', dump: 'Truck is close. Line up and press F.' },
    env: { id: 'day', sun: 1, hemi: 1, fog: 0.0011, fogColor: 0xcfe2f3 },
    site: { bearing: 90, dist: 170, spread: 55, gap: 18 }
  },
  {
    id: 3, name: 'Bridge Repair', theme: 'Busy streets',
    story: 'The bridge approach is covered in dirt. Work fast, the streets are busy.',
    loads: 5, time: 270, reward: 300, needs: { job: 2 },
    scoopText: 'Scoop dirt at the bridge', dumpText: 'Dump it in the truck',
    hints: { scoop: 'Watch the cars when you cross a road.', dump: 'Do not rush into traffic. A crash costs time.' },
    env: { id: 'dusk', sun: 0.7, hemi: 0.8, fog: 0.0014, fogColor: 0xe8c9a8 },
    site: { bearing: 270, dist: 190, spread: 55, gap: 24 }
  },
  {
    id: 4, name: 'Night Shift', theme: 'Dark city',
    story: 'The city sleeps but the road crew works. Lights on, eyes open.',
    loads: 5, time: 250, reward: 380, needs: { job: 3 },
    scoopText: 'Scoop dirt in the dark', dumpText: 'Dump it in the truck',
    hints: { scoop: 'It is dark. Use the map arrow to find the pile.', dump: 'Find the truck. Its lights are on.' },
    env: { id: 'night', sun: 0.16, hemi: 0.32, fog: 0.0024, fogColor: 0x0a1020, lights: true },
    site: { bearing: 180, dist: 150, spread: 55, gap: 20 }
  },
  {
    id: 5, name: 'Storm Rescue', theme: 'Heavy fog',
    story: 'Fog and rain cut the city off. Dig a way through for the rescue trucks.',
    loads: 6, time: 320, reward: 480, needs: { job: 4 },
    scoopText: 'Scoop dirt in the fog', dumpText: 'Dump it in the rescue truck',
    hints: { scoop: 'You cannot see far. Slow down and use the map.', dump: 'The truck is near. Go slow in the fog.' },
    env: { id: 'storm', sun: 0.45, hemi: 0.7, fog: 0.0055, fogColor: 0x8e9aa6 },
    site: { bearing: 315, dist: 220, spread: 55, gap: 26 }
  },
  {
    id: 6, name: 'Skyline Foundation', theme: 'Big build',
    story: 'The new tower needs a flat base. Move a mountain of dirt, load by load.',
    loads: 8, time: 450, reward: 600, needs: { job: 5, engine: 2 },
    scoopText: 'Scoop dirt for the foundation', dumpText: 'Dump it in the big truck',
    hints: { scoop: 'The farthest site. A stronger engine helps a lot.', dump: 'Keep a steady rhythm: scoop, drive, dump.' },
    env: { id: 'dawn', sun: 0.85, hemi: 0.9, fog: 0.0016, fogColor: 0xf0d9bd },
    site: { bearing: 45, dist: 250, spread: 55, gap: 30 }
  }
];

// ---------- helpers ----------
function fmtTime(s) {
  s = Math.max(0, Math.round(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function pad2(n) { return String(n).padStart(2, '0'); }
function dayStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function today() { return dayStr(new Date()); }
function yesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return dayStr(d); }

function defaultSave() {
  return { v: 1, jobs: {}, xp: 0, last: 1, daily: { last: '', streak: 0 }, stats: { loads: 0, jobs: 0 } };
}
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const d = JSON.parse(raw);
    const b = defaultSave();
    return {
      ...b, ...d,
      jobs: { ...(d.jobs || {}) },
      daily: { ...b.daily, ...(d.daily || {}) },
      stats: { ...b.stats, ...(d.stats || {}) }
    };
  } catch (e) { return defaultSave(); }
}
function freshState(job) {
  return { loads: 0, elapsed: 0, extra: 0, timeLeft: job.time, running: false, done: false, failed: false, phase: 'scoop', tips: 0, result: null };
}

export function rankInfo(xp) {
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) if (xp >= RANKS[k].xp) i = k;
  const cur = RANKS[i];
  const nxt = RANKS[i + 1] || null;
  const into = xp - cur.xp;
  const need = nxt ? nxt.xp - cur.xp : 0;
  return { index: i, name: cur.name, xp, next: nxt ? nxt.name : null, into, need, pct: nxt ? Math.min(1, into / need) : 1, bonus: i * 0.03 };
}
export function tipFor(level) {
  const l = Math.min(Math.max(level || 1, 1), MAX_LEVEL);
  return TIPS[l - 1];
}
export function upgradeCost(kind, level, discount) {
  const u = UPGRADES[kind];
  if (!u || level >= MAX_LEVEL) return null;
  return Math.round(u.prices[level - 1] * (1 - (discount || 0)));
}

// ---------- site finder (finds free ground for each job, uses the real buildings) ----------
const CELL = 32;
const PAD = 14;

function buildIndex(buildings, props) {
  const rects = [];
  const add = (cx, cz, hw, hd, kind) => {
    if (!Number.isFinite(cx) || !Number.isFinite(cz) || !Number.isFinite(hw) || !Number.isFinite(hd)) return;
    if (Math.abs(cx) > 420 || Math.abs(cz) > 420) return;
    rects.push([cx, cz, hw, hd, kind]);
  };
  for (const b of buildings || []) {
    if (!b) continue;
    const hw = (b.w || 0) / 2, hd = (b.d || 0) / 2;
    add(b.x, b.z, hw, hd, 0);              // box centred on x,z
    add(b.x + hw, b.z + hd, hw, hd, 0);    // same box if x,z is a corner (safe both ways)
  }
  for (const c of props || []) {
    if (!c) continue;
    const x = c.x !== undefined ? c.x : (c.position ? c.position.x : undefined);
    const z = c.z !== undefined ? c.z : (c.position ? c.position.z : undefined);
    let hw = c.hx !== undefined ? c.hx : c.hw !== undefined ? c.hw : c.w !== undefined ? c.w / 2 : c.r !== undefined ? c.r : 1.2;
    let hd = c.hz !== undefined ? c.hz : c.hd !== undefined ? c.hd : c.d !== undefined ? c.d / 2 : c.r !== undefined ? c.r : hw;
    add(x, z, hw, hd, 1);
  }
  const grid = new Map();
  const key = (i, j) => i * 10007 + j;
  for (let k = 0; k < rects.length; k++) {
    const r = rects[k];
    const i0 = Math.floor((r[0] - r[2] - PAD) / CELL), i1 = Math.floor((r[0] + r[2] + PAD) / CELL);
    const j0 = Math.floor((r[1] - r[3] - PAD) / CELL), j1 = Math.floor((r[1] + r[3] + PAD) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const kk = key(i, j);
      let a = grid.get(kk);
      if (!a) { a = []; grid.set(kk, a); }
      a.push(k);
    }
  }
  return { rects, grid, key, used: [{ x: 0, z: -120, r: 34 }] };
}

function isClear(idx, x, z, r) {
  for (const R of ROAD_POS) {
    if (Math.abs(x - R) < ROAD_HALF + r || Math.abs(z - R) < ROAD_HALF + r) return false;
  }
  if (Math.abs(x) < 64 && Math.abs(z) < 64) return false; // garage yard
  for (const u of idx.used) {
    if (Math.hypot(x - u.x, z - u.z) < u.r + r) return false;
  }
  const list = idx.grid.get(idx.key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (list) {
    for (let n = 0; n < list.length; n++) {
      const q = idx.rects[list[n]];
      const rr = q[4] === 1 ? Math.min(r, 7) : r;
      if (Math.abs(x - q[0]) < q[2] + rr && Math.abs(z - q[1]) < q[3] + rr) return false;
    }
  }
  return true;
}

const OFFSETS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function resolveAll(idx) {
  const out = new Map();
  for (const job of JOBS) {
    const s = job.site;
    if (!s || s.keep) { out.set(job.id, { ok: true, keep: true }); continue; }
    let best = null;
    for (let x = -270; x <= 270; x += 4) {
      for (let z = -270; z <= 270; z += 4) {
        const d = Math.hypot(x, z);
        if (Math.abs(d - s.dist) > 70) continue;
        let a = Math.atan2(x, -z) * 180 / Math.PI;
        if (a < 0) a += 360;
        const diff = Math.abs(((a - s.bearing + 540) % 360) - 180);
        if (diff > s.spread) continue;
        const score = Math.abs(d - s.dist) + diff * 0.6;
        if (best && score >= best.score) continue;
        if (!isClear(idx, x, z, SITE_R)) continue;
        for (const o of OFFSETS) {
          const tx = x + o[0] * s.gap, tz = z + o[1] * s.gap;
          if (Math.hypot(tx, tz) < 290 && isClear(idx, tx, tz, SITE_R)) {
            best = { score, x, z, tx, tz };
            break;
          }
        }
      }
    }
    if (best) {
      out.set(job.id, { ok: true, keep: false, pile: { x: best.x, z: best.z }, truck: { x: best.tx, z: best.tz } });
      idx.used.push({ x: best.x, z: best.z, r: 30 }, { x: best.tx, z: best.tz, r: 30 });
    } else {
      out.set(job.id, { ok: false });
    }
  }
  return out;
}

// ---------- the job system ----------
export class JobSystem {
  constructor() {
    this.save = readSave();
    this.current = JOBS[0];
    this.state = freshState(this.current);
    this.onTick = null;   // (secondsLeft:int) => void
    this.onFail = null;   // (job, state) => void
    this._sec = -1;
    this._layout = null;
  }

  list() { return JOBS; }
  get(id) { return JOBS.find(j => j.id === id) || null; }
  record(id) { return this.save.jobs[id] || { done: false, stars: 0, best: 0, plays: 0 }; }
  isDone(id) { return !!(this.save.jobs[id] && this.save.jobs[id].done); }
  rankInfo() { return rankInfo(this.save.xp); }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* ignore */ } }

  lockReason(id, ctx) {
    ctx = ctx || {};
    const j = this.get(id);
    if (!j) return 'Unknown job';
    const n = j.needs || {};
    if (n.job && !this.isDone(n.job)) return 'Finish job ' + n.job + ' first';
    if (n.engine && (ctx.engineLevel || 1) < n.engine) return 'Needs Engine level ' + n.engine;
    return '';
  }
  isUnlocked(id, ctx) { return this.lockReason(id, ctx) === ''; }
  nextId(ctx) {
    const n = this.current.id + 1;
    return this.get(n) && this.isUnlocked(n, ctx) ? n : null;
  }
  lastPlayed() { return this.get(this.save.last) ? this.save.last : 1; }

  start(id) {
    const j = this.get(id) || JOBS[0];
    this.current = j;
    this.state = freshState(j);
    this.state.running = true;
    this.save.last = j.id;
    this.persist();
    this._sec = -1;
    if (this.onTick) this.onTick(j.time);
    return j;
  }

  update(dt) {
    const s = this.state;
    if (!s.running) return;
    s.elapsed += dt;
    s.timeLeft = Math.max(0, this.current.time + s.extra - s.elapsed);
    const sec = Math.ceil(s.timeLeft);
    if (sec !== this._sec) { this._sec = sec; if (this.onTick) this.onTick(sec); }
    if (s.timeLeft <= 0) {
      s.running = false;
      s.failed = true;
      if (this.onFail) this.onFail(this.current, s);
    }
  }

  addTime(sec) {
    const s = this.state;
    s.extra += sec;
    if (s.failed && !s.done) { s.failed = false; s.running = true; this._sec = -1; }
    // the player must really get `sec` seconds, even if elapsed passed the limit
    const limit = this.current.time + s.extra;
    if (s.elapsed > limit - sec) s.elapsed = Math.max(0, limit - sec);
    s.timeLeft = Math.max(0, limit - s.elapsed);
    if (this.onTick) this.onTick(Math.ceil(s.timeLeft));
  }

  setPhase(p) { this.state.phase = p === 'dump' ? 'dump' : 'scoop'; }
  objective() { return this.state.phase === 'dump' ? this.current.dumpText : this.current.scoopText; }
  hint() { return this.state.phase === 'dump' ? this.current.hints.dump : this.current.hints.scoop; }
  stepText() {
    const s = this.state;
    return (s.phase === 'dump' ? 'Dump in truck ' : 'Scoop dirt ') + s.loads + '/' + this.current.loads;
  }

  addLoad(ctx) {
    const s = this.state;
    if (!s.running || s.done) return null;
    s.loads++;
    s.phase = 'scoop';
    const tip = tipFor((ctx || {}).bucketLevel);
    s.tips += tip;
    this.save.stats.loads++;
    return { loads: s.loads, total: this.current.loads, tip, complete: s.loads >= this.current.loads };
  }

  complete(ctx) {
    ctx = ctx || {};
    const s = this.state, job = this.current;
    if (s.done && s.result) return s.result;
    s.running = false;
    s.done = true;
    const unlockedBefore = JOBS.filter(j => this.isUnlocked(j.id, ctx)).map(j => j.id);
    const left = Math.max(0, s.timeLeft);
    const ratio = left / job.time;
    const stars = ratio > 0.5 ? 3 : ratio > 0.2 ? 2 : 1;
    const rec = this.record(job.id);
    const first = !rec.done;
    const rankBefore = this.rankInfo();
    const base = Math.round(job.reward * (first ? 1 : 0.4));
    const starBonus = Math.round(base * (STAR_MULT[stars - 1] - 1));
    const rankBonus = Math.round((base + starBonus) * rankBefore.bonus);
    const coins = base + starBonus + rankBonus;
    const xpGain = first ? 100 + 40 * stars : 30 + 15 * stars;
    const used = Math.round(s.elapsed);
    const newBest = !rec.best || used < rec.best;
    rec.done = true;
    rec.stars = Math.max(rec.stars || 0, stars);
    rec.best = newBest ? used : rec.best;
    rec.plays = (rec.plays || 0) + 1;
    this.save.jobs[job.id] = rec;
    this.save.xp += xpGain;
    this.save.stats.jobs++;
    this.persist();
    const rankAfter = this.rankInfo();
    const newlyUnlocked = JOBS.filter(j => this.isUnlocked(j.id, ctx) && unlockedBefore.indexOf(j.id) < 0);
    s.result = {
      job, stars, timeLeft: left, timeUsed: used, firstClear: first, newBest,
      base, starBonus, rankBonus, coins, tips: s.tips, xpGain,
      rankBefore, rankAfter, rankUp: rankAfter.index > rankBefore.index,
      newlyUnlocked, nextId: this.nextId(ctx)
    };
    return s.result;
  }

  // daily bonus
  dailyStatus() {
    const d = this.save.daily, t = today();
    if (d.last === t) {
      return { canClaim: false, streak: d.streak, day: ((d.streak - 1) % 7) + 1, amount: 0, nextDay: (d.streak % 7) + 1, nextAmount: DAILY[d.streak % 7] };
    }
    const streak = d.last === yesterday() ? d.streak + 1 : 1;
    const day = ((streak - 1) % 7) + 1;
    return { canClaim: true, streak, day, amount: DAILY[day - 1], nextDay: 0, nextAmount: 0 };
  }
  claimDaily(mult) {
    const st = this.dailyStatus();
    if (!st.canClaim) return 0;
    this.save.daily = { last: today(), streak: st.streak };
    this.persist();
    return Math.round(st.amount * (mult || 1));
  }

  // where the pile and truck go for each job (null-safe, cached)
  layout(buildingData, propColliders) {
    if (!this._layout) {
      try { this._layout = resolveAll(buildIndex(buildingData, propColliders)); }
      catch (e) { console.warn('[Jobs] site finder failed', e); this._layout = new Map(); }
    }
    return this._layout;
  }
  siteFor(id) { return (this._layout && this._layout.get(id)) || { ok: false }; }
}

// ---------- windows ----------
const STAR_PTS = '12,2 15.1,8.6 22.3,9.5 17,14.5 18.4,21.7 12,18.2 5.6,21.7 7,14.5 1.7,9.5 8.9,8.6';
function starSvg(on, size, delay) {
  const anim = delay >= 0 ? ' tf-jb-star' : '';
  const st = delay >= 0 ? ' style="animation-delay:' + delay + 's"' : '';
  return '<svg class="' + anim.trim() + '"' + st + ' width="' + size + '" height="' + size + '" viewBox="0 0 24 24"><polygon points="' + STAR_PTS + '" fill="' + (on ? '#fbbf24' : '#1b2535') + '" stroke="' + (on ? '#92400e' : '#0a0f18') + '" stroke-width="1.6" stroke-linejoin="round"/></svg>';
}
const LOCK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" style="vertical-align:-3px"><rect x="5" y="11" width="14" height="10" rx="2" fill="#fbbf24"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="#fbbf24" stroke-width="2.4"/></svg>';

const CSS = `
#tf-jb-root{position:fixed;inset:0;z-index:90;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#eef3fb;user-select:none}
.tf-jb-veil{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;background:rgba(4,8,15,.66);pointer-events:auto;overflow:auto;animation:tf-jb-fade .18s ease-out}
.tf-jb-card{position:relative;width:min(540px,100%);max-height:100%;overflow:auto;box-sizing:border-box;padding:18px 20px 20px;border-radius:16px;background:linear-gradient(180deg,#2b384e,#18212f);border:2px solid #0a0f18;box-shadow:0 5px 0 #0a0f18,0 22px 44px rgba(0,0,0,.55),inset 0 2px 0 rgba(255,255,255,.12);animation:tf-jb-rise .22s ease-out}
.tf-jb-card.wide{width:min(900px,100%)}
.tf-jb-tag{display:inline-block;font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0a0f18;background:#fbbf24;border-radius:6px;padding:3px 9px}
.tf-jb-h{margin:8px 0 2px;font-size:28px;line-height:1.1;font-weight:900;color:#fff;text-shadow:0 2px 0 #0a0f18}
.tf-jb-sub{margin:0 0 12px;font-size:16px;line-height:1.35;color:#c4cfdf}
.tf-jb-stars{display:flex;gap:8px;justify-content:center;margin:6px 0 12px}
.tf-jb-stars.sm{justify-content:flex-start;gap:3px;margin:8px 0 0}
.tf-jb-star{animation:tf-jb-pop .45s cubic-bezier(.2,1.6,.4,1) both}
.tf-jb-rows{border-radius:12px;background:#0f1622;border:2px solid #0a0f18;padding:6px 12px;margin:0 0 12px;box-shadow:inset 0 2px 6px rgba(0,0,0,.5)}
.tf-jb-row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;font-size:16px;border-bottom:1px solid rgba(255,255,255,.07)}
.tf-jb-row:last-child{border-bottom:0}
.tf-jb-row b{font-variant-numeric:tabular-nums}
.tf-jb-row.total{font-size:21px;font-weight:900;color:#fbbf24}
.tf-jb-row.dim{color:#8fa0b8}
.tf-jb-row.good{color:#6ee7a7;font-weight:800}
.tf-jb-xp{height:12px;border-radius:7px;background:#0a0f18;overflow:hidden;border:1px solid #05080e;margin:4px 0}
.tf-jb-xp i{display:block;height:100%;width:0;background:linear-gradient(90deg,#34d399,#fbbf24);border-radius:7px;transition:width .9s ease-out}
.tf-jb-note{font-size:15px;color:#9fb0c8;margin:0 0 10px}
.tf-jb-up{color:#6ee7a7;font-weight:800;font-size:16px;margin:0 0 8px}
.tf-jb-btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
.tf-jb-btn{flex:1 1 130px;min-height:46px;padding:10px 14px;border-radius:12px;border:2px solid #0a0f18;font:800 17px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;cursor:pointer;color:#0a0f18;background:linear-gradient(180deg,#fcd34d,#f59e0b);box-shadow:0 4px 0 #0a0f18,inset 0 2px 0 rgba(255,255,255,.45)}
.tf-jb-btn:active{transform:translateY(3px);box-shadow:0 1px 0 #0a0f18}
.tf-jb-btn.alt{color:#eef3fb;background:linear-gradient(180deg,#42536e,#2a384d);box-shadow:0 4px 0 #0a0f18,inset 0 2px 0 rgba(255,255,255,.18)}
.tf-jb-btn[disabled]{opacity:.45;cursor:not-allowed}
.tf-jb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;margin:10px 0 12px}
.tf-jb-job{position:relative;text-align:left;padding:12px;border-radius:12px;border:2px solid #0a0f18;background:linear-gradient(180deg,#34445f,#212d40);color:#eef3fb;font:inherit;cursor:pointer;box-shadow:0 4px 0 #0a0f18,inset 0 2px 0 rgba(255,255,255,.12)}
.tf-jb-job:hover{filter:brightness(1.12)}
.tf-jb-job.cur{outline:3px solid #fbbf24}
.tf-jb-job.lock{cursor:not-allowed;filter:grayscale(.6) brightness(.72)}
.tf-jb-job h3{margin:7px 0 3px;font-size:19px;line-height:1.15;color:#fff}
.tf-jb-job p{margin:0 0 8px;font-size:15px;line-height:1.3;color:#c4cfdf}
.tf-jb-meta{display:flex;gap:6px;flex-wrap:wrap}
.tf-jb-chip{font-size:14px;font-weight:700;padding:2px 8px;border-radius:7px;background:#0f1622;border:1px solid #05080e;color:#fcd34d}
.tf-jb-bar{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:10px 12px;border-radius:12px;background:#0f1622;border:2px solid #0a0f18;margin:8px 0;font-size:16px;box-shadow:inset 0 2px 6px rgba(0,0,0,.5)}
.tf-jb-bar b{color:#fbbf24}
.tf-jb-bar .tf-jb-btn{flex:0 0 auto;min-height:40px;padding:6px 16px;font-size:16px}
.tf-jb-brief{position:absolute;left:50%;top:14%;transform:translateX(-50%) translateY(-10px);width:min(520px,calc(100% - 24px));box-sizing:border-box;padding:10px 16px 12px;border-radius:14px;background:linear-gradient(180deg,rgba(43,56,78,.96),rgba(24,33,47,.96));border:2px solid #0a0f18;box-shadow:0 4px 0 #0a0f18,0 14px 30px rgba(0,0,0,.45);text-align:center;opacity:0;transition:opacity .35s,transform .35s;pointer-events:none}
.tf-jb-brief.on{opacity:1;transform:translateX(-50%) translateY(0)}
.tf-jb-brief .tf-jb-h{font-size:24px;margin:6px 0 2px}
.tf-jb-brief .tf-jb-sub{margin:0;font-size:16px}
@keyframes tf-jb-fade{from{opacity:0}to{opacity:1}}
@keyframes tf-jb-rise{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
@keyframes tf-jb-pop{from{opacity:0;transform:scale(.2) rotate(-25deg)}to{opacity:1;transform:none}}
@media (max-height:520px),(max-width:560px){
  .tf-jb-card{padding:12px 14px 14px}
  .tf-jb-h{font-size:22px}
  .tf-jb-brief .tf-jb-h{font-size:20px}
  .tf-jb-sub{font-size:15px;margin-bottom:8px}
  .tf-jb-row{padding:4px 0;font-size:15px}
  .tf-jb-row.total{font-size:18px}
  .tf-jb-grid{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
  .tf-jb-btn{min-height:42px;font-size:16px}
  .tf-jb-brief{top:10%}
}
`;

export class JobPanels {
  constructor() {
    this.root = null;
    this.veil = null;
    this.brief = null;
    this._briefTimer = 0;
  }

  _ensure() {
    if (this.root) return;
    if (!document.getElementById('tf-jb-css')) {
      const st = document.createElement('style');
      st.id = 'tf-jb-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = document.createElement('div');
    this.root.id = 'tf-jb-root';
    document.body.appendChild(this.root);
  }

  isOpen() { return !!this.veil; }

  hide() {
    if (this.veil) { this.veil.remove(); this.veil = null; }
  }

  _open(html, wide, onClick) {
    this._ensure();
    this.hide();
    const veil = document.createElement('div');
    veil.className = 'tf-jb-veil';
    veil.innerHTML = '<div class="tf-jb-card' + (wide ? ' wide' : '') + '">' + html + '</div>';
    veil.addEventListener('click', (e) => {
      const t = e.target.closest ? e.target.closest('[data-act],[data-id]') : null;
      if (!t) return;
      if (t.blur) t.blur();
      onClick(t);
    });
    this.root.appendChild(veil);
    this.veil = veil;
    return veil;
  }

  // short banner at the start of a job
  briefing(job, ms) {
    this._ensure();
    if (this.brief) this.brief.remove();
    clearTimeout(this._briefTimer);
    const el = document.createElement('div');
    el.className = 'tf-jb-brief';
    el.innerHTML = '<span class="tf-jb-tag">Job ' + job.id + ' - ' + job.theme + '</span><div class="tf-jb-h">' + job.name + '</div><p class="tf-jb-sub">' + job.story + '</p>';
    this.root.appendChild(el);
    this.brief = el;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
    this._briefTimer = setTimeout(() => {
      el.classList.remove('on');
      setTimeout(() => { if (el.parentNode) el.remove(); }, 400);
    }, ms || 5000);
  }

  showResult(r, h) {
    h = h || {};
    const rows = [];
    rows.push(['Job reward' + (r.firstClear ? '' : ' (repeat 40%)'), '+' + r.base, '']);
    if (r.starBonus) rows.push([r.stars + '-star bonus', '+' + r.starBonus, '']);
    if (r.rankBonus) rows.push(['Rank bonus (' + r.rankBefore.name + ')', '+' + r.rankBonus, '']);
    rows.push(['Load tips (already paid)', '+' + r.tips, 'dim']);
    rows.push(['Time used', fmtTime(r.timeUsed) + (r.newBest ? '  NEW BEST' : ''), r.newBest ? 'good' : 'dim']);
    rows.push(['Total reward', '+' + r.coins + ' coins', 'total']);
    const rowHtml = rows.map(x => '<div class="tf-jb-row ' + x[2] + '"><span>' + x[0] + '</span><b>' + x[1] + '</b></div>').join('');
    const stars = [1, 2, 3].map(n => starSvg(r.stars >= n, 46, 0.15 + n * 0.22)).join('');
    const after = r.rankAfter;
    const startPct = r.rankUp ? 0 : Math.round(r.rankBefore.pct * 100);
    const endPct = Math.round(after.pct * 100);
    const unlock = r.newlyUnlocked.length ? '<p class="tf-jb-up">New job unlocked: ' + r.newlyUnlocked.map(j => j.name).join(', ') + '</p>' : '';
    const rankTxt = (r.rankUp ? '<span class="tf-jb-up">RANK UP! </span>' : '') + after.name + (after.next ? ' - ' + after.into + '/' + after.need + ' XP to ' + after.next : ' - top rank') + ' (+' + r.xpGain + ' XP)';
    const html =
      '<span class="tf-jb-tag">Job ' + r.job.id + ' complete</span>' +
      '<div class="tf-jb-h">' + r.job.name + '</div>' +
      '<div class="tf-jb-stars">' + stars + '</div>' +
      '<div class="tf-jb-rows">' + rowHtml + '</div>' +
      unlock +
      '<p class="tf-jb-note">' + rankTxt + '</p>' +
      '<div class="tf-jb-xp"><i style="width:' + startPct + '%"></i></div>' +
      '<div class="tf-jb-btns">' +
      (r.nextId ? '<button class="tf-jb-btn" data-act="next">Next job</button>' : '') +
      '<button class="tf-jb-btn alt" data-act="replay">Replay</button>' +
      '<button class="tf-jb-btn alt" data-act="jobs">All jobs</button>' +
      '</div>';
    const veil = this._open(html, false, (t) => {
      const a = t.getAttribute('data-act');
      if (a === 'next' && h.onNext) h.onNext(r.nextId);
      else if (a === 'replay' && h.onReplay) h.onReplay();
      else if (a === 'jobs' && h.onJobs) h.onJobs();
    });
    const bar = veil.querySelector('.tf-jb-xp i');
    requestAnimationFrame(() => requestAnimationFrame(() => { if (bar) bar.style.width = endPct + '%'; }));
  }

  showFail(job, loads, h) {
    h = h || {};
    const html =
      '<span class="tf-jb-tag">Job ' + job.id + '</span>' +
      '<div class="tf-jb-h">Time is up</div>' +
      '<p class="tf-jb-sub">You delivered ' + loads + ' of ' + job.loads + ' loads. Try again, you can do it.</p>' +
      '<div class="tf-jb-btns">' +
      '<button class="tf-jb-btn" data-act="retry">Try again</button>' +
      (h.onAd ? '<button class="tf-jb-btn alt" data-act="ad">+60 seconds (watch ad)</button>' : '') +
      '<button class="tf-jb-btn alt" data-act="jobs">All jobs</button>' +
      '</div>';
    this._open(html, false, (t) => {
      const a = t.getAttribute('data-act');
      if (a === 'retry' && h.onRetry) h.onRetry();
      else if (a === 'ad' && h.onAd) h.onAd();
      else if (a === 'jobs' && h.onJobs) h.onJobs();
    });
  }

  showPicker(sys, ctx, h) {
    h = h || {};
    const rank = sys.rankInfo();
    const d = sys.dailyStatus();
    let cards = '';
    for (const j of sys.list()) {
      const why = sys.lockReason(j.id, ctx);
      const rec = sys.record(j.id);
      const stars = [1, 2, 3].map(n => starSvg(rec.stars >= n, 18, -1)).join('');
      const cur = sys.current.id === j.id;
      cards +=
        '<button type="button" class="tf-jb-job' + (why ? ' lock' : '') + (cur ? ' cur' : '') + '" data-id="' + j.id + '">' +
        '<span class="tf-jb-tag">Job ' + j.id + '</span>' +
        '<h3>' + j.name + '</h3>' +
        '<p>' + (why ? LOCK_SVG + ' ' + why : j.theme + ' - ' + j.story) + '</p>' +
        '<span class="tf-jb-meta"><span class="tf-jb-chip">' + j.loads + ' loads</span><span class="tf-jb-chip">' + fmtTime(j.time) + '</span><span class="tf-jb-chip">+' + j.reward + '</span></span>' +
        '<span class="tf-jb-stars sm">' + stars + '</span>' +
        '</button>';
    }
    const daily = d.canClaim
      ? '<div class="tf-jb-bar"><span>Daily bonus - day <b>' + d.day + '</b> of 7: <b>+' + d.amount + ' coins</b></span><button class="tf-jb-btn" data-act="daily">Claim</button></div>'
      : '<div class="tf-jb-bar"><span>Daily bonus taken. Tomorrow, day <b>' + d.nextDay + '</b>: <b>+' + d.nextAmount + ' coins</b></span></div>';
    const rankBar = '<div class="tf-jb-bar"><span>Rank: <b>' + rank.name + '</b>' + (rank.next ? ' - ' + rank.into + '/' + rank.need + ' XP to ' + rank.next : ' - top rank') + '</span><span>Coin bonus <b>+' + Math.round(rank.bonus * 100) + '%</b></span></div>';
    const html =
      '<span class="tf-jb-tag">City Rescue</span>' +
      '<div class="tf-jb-h">Choose a job</div>' +
      '<p class="tf-jb-sub">Finish jobs to unlock the next one. More stars, more coins.</p>' +
      rankBar + daily +
      '<div class="tf-jb-grid">' + cards + '</div>' +
      '<div class="tf-jb-btns"><button class="tf-jb-btn alt" data-act="close">Back to game</button></div>';
    this._open(html, true, (t) => {
      const id = t.getAttribute('data-id');
      const a = t.getAttribute('data-act');
      if (id) {
        const n = parseInt(id, 10);
        if (sys.lockReason(n, ctx)) return;
        if (h.onPick) h.onPick(n);
      } else if (a === 'daily') {
        const amt = sys.claimDaily(1);
        if (amt && h.onCoins) h.onCoins(amt, 'daily');
        this.showPicker(sys, ctx, h);
      } else if (a === 'close') {
        this.hide();
        if (h.onClose) h.onClose();
      }
    });
  }
}

export default JobSystem;
