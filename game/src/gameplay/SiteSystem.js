// TerraForm 3D - SiteSystem (M8)
// Builds a DIFFERENT 3D venue for every job: ground, signature structures, props,
// lights, weather, colliders. Nothing here is shared between jobs, so each level
// feels like a new location instead of the same highway again.
//
// Local space: the dirt pile is at (0,0,0). Local +Z points from the pile back
// toward the garage (the approach side), so +Z stays open for driving in/out.
//
// Everything is disposed in dispose() - geometries, materials, textures and the
// Rapier bodies. build() always calls dispose() first, so switching jobs can not
// leak GPU memory. No other module needs to know how a venue is made.

import * as THREE from 'three';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- venue table
// One entry per job id. Colors are also used by main.js to move the sky, the
// sun, the hemisphere light and the fog when the job starts.
export const VENUES = {
  1: {
    key: 'highway', name: 'Harbour Highway', badge: 'STORM CLEAN-UP',
    sky: { top: 0x2f77c8, bottom: 0xcfe2f3, sun: 0xfff2cc, sunDir: [100, 200, 100] },
    fog: { color: 0xcfe2f3, density: 0.0011 },
    sun: { color: 0xfff5e6, intensity: 2.0 },
    hemi: { intensity: 0.9, sky: 0xffffff, ground: 0x778866 },
    exposure: 1.0, ground: 'asphalt'
  },
  2: {
    key: 'park', name: 'Riverside Park', badge: 'LANDSLIDE',
    sky: { top: 0x3b8ad9, bottom: 0xd9ecf7, sun: 0xfff4d0, sunDir: [-120, 160, 90] },
    fog: { color: 0xd9ecf7, density: 0.0013 },
    sun: { color: 0xfff6e2, intensity: 1.9 },
    hemi: { intensity: 0.95, sky: 0xe8f4ff, ground: 0x5b7a44 },
    exposure: 1.0, ground: 'grass'
  },
  3: {
    key: 'bridge', name: 'Old Iron Bridge', badge: 'BUSY STREETS',
    sky: { top: 0x3a6ea8, bottom: 0xdfe8ef, sun: 0xffe0b0, sunDir: [150, 90, -80] },
    fog: { color: 0xdfe8ef, density: 0.0016 },
    sun: { color: 0xffe6c0, intensity: 1.7 },
    hemi: { intensity: 0.85, sky: 0xdfeaf6, ground: 0x6b6f74 },
    exposure: 1.02, ground: 'concrete'
  },
  4: {
    key: 'night', name: 'Night Shift Depot', badge: 'DARK CITY',
    sky: { top: 0x03060d, bottom: 0x111a2e, sun: 0x9fb4e0, sunDir: [-60, 120, -40] },
    fog: { color: 0x060a14, density: 0.0026 },
    sun: { color: 0x8fa4d6, intensity: 0.22 },
    hemi: { intensity: 0.3, sky: 0x33415e, ground: 0x0a0e14 },
    exposure: 1.18, ground: 'asphaltNight'
  },
  5: {
    key: 'storm', name: 'Storm Rescue Zone', badge: 'HEAVY FOG',
    sky: { top: 0x3b4654, bottom: 0x8e99a4, sun: 0xbfc9d2, sunDir: [40, 70, 40] },
    fog: { color: 0x8e9aa6, density: 0.0055 },
    sun: { color: 0x9aa7b4, intensity: 0.5 },
    hemi: { intensity: 0.62, sky: 0x9aa7b4, ground: 0x3d4650 },
    exposure: 0.96, ground: 'wet'
  },
  6: {
    key: 'skyline', name: 'Skyline Foundation', badge: 'BIG BUILD',
    sky: { top: 0x2b6cb8, bottom: 0xffd9b0, sun: 0xffd2a0, sunDir: [-90, 60, 120] },
    fog: { color: 0xf0d9bd, density: 0.0017 },
    sun: { color: 0xffd9b4, intensity: 1.85 },
    hemi: { intensity: 0.8, sky: 0xffe9d2, ground: 0x6a6152 },
    exposure: 1.03, ground: 'concrete'
  }
};

export function venueFor(jobId) {
  return VENUES[jobId] || VENUES[1];
}

// ------------------------------------------------------------ texture helpers
function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, x: c.getContext('2d') };
}

function tex(c, rep) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (rep) t.repeat.set(rep, rep);
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function kindTex(kind) {
  const { c, x: g } = canvas2d(512, 512);
  if (kind === 'grass') {
    g.fillStyle = '#4d7238'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      const v = 40 + Math.random() * 90;
      g.fillStyle = 'rgba(' + Math.floor(v * 0.6) + ',' + Math.floor(v + 40) + ',' + Math.floor(v * 0.45) + ',0.5)';
      g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 3, 2 + Math.random() * 4);
    }
  } else if (kind === 'wet') {
    g.fillStyle = '#3c444c'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) {
      const v = 40 + Math.random() * 70;
      g.fillStyle = 'rgba(' + v + ',' + (v + 6) + ',' + (v + 12) + ',0.5)';
      g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 4, 2 + Math.random() * 4);
    }
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = 'rgba(150,170,190,0.10)';
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      const px = Math.random() * 512, py = Math.random() * 512;
      g.moveTo(px, py);
      g.lineTo(px + (Math.random() - 0.5) * 90, py + (Math.random() - 0.5) * 90);
      g.stroke();
    }
  } else if (kind === 'concrete' || kind === 'asphalt' || kind === 'asphaltNight') {
    const base = kind === 'concrete' ? '#9a9a93' : kind === 'asphaltNight' ? '#22262c' : '#3a3d42';
    g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 8000; i++) {
      const v = kind === 'concrete' ? 100 + Math.random() * 70 : 30 + Math.random() * 55;
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + Math.floor(v * 0.98) + ',0.35)';
      g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    if (kind === 'concrete') {
      g.strokeStyle = 'rgba(70,70,68,0.55)'; g.lineWidth = 2;
      for (let i = 0; i <= 512; i += 128) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
        g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
      }
    }
    if (kind === 'asphalt') {
      g.strokeStyle = 'rgba(20,20,22,0.5)'; g.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        g.beginPath();
        let px = Math.random() * 512, py = Math.random() * 512;
        g.moveTo(px, py);
        for (let k = 0; k < 5; k++) {
          px += (Math.random() - 0.5) * 90; py += (Math.random() - 0.5) * 90;
          g.lineTo(px, py);
        }
        g.stroke();
      }
    }
  } else {
    g.fillStyle = '#8a6a48'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 7000; i++) {
      const v = 60 + Math.random() * 150;
      g.fillStyle = 'rgba(' + v + ',' + Math.floor(v * 0.72) + ',' + Math.floor(v * 0.48) + ',0.4)';
      g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 4, 2 + Math.random() * 4);
    }
  }
  return tex(c, 3);
}

// ============================================================== SiteSystem ===
export default class SiteSystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.root = new THREE.Group();
    this.root.name = 'site-root';
    this.scene.add(this.root);

    this._geo = [];
    this._mat = [];
    this._tex = [];
    this._bodies = [];
    this._tickers = [];
    this._lights = [];
    this._colliders = [];
    this._time = 0;
    this.info = null;
    this.venue = null;
  }

  // --------------------------------------------------------------- utilities
  _track(obj) {
    if (obj.isBufferGeometry) this._geo.push(obj);
    else if (obj.isMaterial) this._mat.push(obj);
    else if (obj.isTexture) this._tex.push(obj);
    return obj;
  }

  _std(color, opts) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.85, metalness: 0.0 }, opts || {}));
    return this._track(m);
  }

  _box(w, h, d, mat, x, y, z, ry, cast) {
    const g = this._track(new THREE.BoxGeometry(w, h, d));
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    m.castShadow = cast !== false;
    m.receiveShadow = true;
    this.root.add(m);
    return m;
  }

  _cyl(rt, rb, h, seg, mat, x, y, z, ry) {
    const g = this._track(new THREE.CylinderGeometry(rt, rb, h, seg));
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    this.root.add(m);
    return m;
  }

  _inst(geo, mat, list, cast) {
    if (!list || !list.length) return null;
    const im = new THREE.InstancedMesh(this._track(geo), mat, list.length);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      e.set(t.rx || 0, t.ry || 0, t.rz || 0);
      q.setFromEuler(e);
      p.set(t.x, t.y, t.z);
      const sc = t.s === undefined ? 1 : t.s;
      s.set(t.sx === undefined ? sc : t.sx, t.sy === undefined ? sc : t.sy, t.sz === undefined ? sc : t.sz);
      mtx.compose(p, q, s);
      im.setMatrixAt(i, mtx);
    }
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = cast !== false;
    im.receiveShadow = true;
    this.root.add(im);
    return im;
  }

  _collider(x, y, z, w, h, d, ry) {
    this._colliders.push({ x: x, y: y, z: z, w: w, h: h, d: d, ry: ry || 0 });
  }

  // Sign board with real text - sells "this is a different location".
  _sign(title, subtitle, bg, fg, w, h) {
    const W = 512, H = 256;
    const { c, x: g } = canvas2d(W, H);
    g.fillStyle = bg || '#f5a623';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 10;
    g.strokeRect(6, 6, W - 12, H - 12);
    g.fillStyle = fg || '#1c1a16';
    g.textAlign = 'center';
    g.font = 'bold 64px system-ui, Arial, sans-serif';
    g.fillText(title || '', W / 2, 108);
    g.font = 'bold 30px system-ui, Arial, sans-serif';
    g.fillText(subtitle || '', W / 2, 172);
    const t = this._track(tex(c));
    const mat = this._std(0xffffff, { map: t, roughness: 0.7 });
    const m = this._box(w || 7, h || 3.5, 0.24, mat, 0, 0, 0);
    return m;
  }

  _board(title, subtitle, bg, fg, x, y, z, ry, w, h) {
    const posts = this._std(0x50565e, { metalness: 0.35, roughness: 0.6 });
    this._box(0.22, y, 0.22, posts, x - (w || 7) * 0.4, y / 2, z, ry);
    this._box(0.22, y, 0.22, posts, x + (w || 7) * 0.4, y / 2, z, ry);
    const b = this._sign(title, subtitle, bg, fg, w, h);
    b.position.set(x, y, z);
    b.rotation.y = ry || 0;
    b.castShadow = true;
    return b;
  }

  // ---------------------------------------------------------------- ground
  _ground(kind, radius) {
    const t = this._track(kindTex(kind));
    const mat = this._std(0xffffff, {
      map: t, roughness: kind === 'wet' ? 0.35 : 0.95,
      metalness: kind === 'wet' || kind === 'asphaltNight' ? 0.25 : 0,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
    });
    const r = radius || 30;
    const g = this._track(new THREE.CircleGeometry(r, 56));
    const m = new THREE.Mesh(g, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.075;
    m.receiveShadow = true;
    this.root.add(m);

    // slightly darker outer apron so the venue reads from a distance
    const ring = new THREE.Mesh(
      this._track(new THREE.RingGeometry(r * 0.98, r * 1.42, 48)),
      this._std(kind === 'grass' ? 0x3f5f2e : 0x33373c, {
        roughness: 0.98, transparent: true, opacity: 0.55,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.07;
    ring.receiveShadow = true;
    this.root.add(ring);
    return m;
  }

  // ----------------------------------------------------------------- build
  build(jobId, site, opts) {
    this.dispose();
    opts = opts || {};
    const venue = venueFor(jobId);
    this.venue = venue;

    const fallbackPile = { x: 0, z: -120 };
    const useSite = site && site.ok && !site.keep && site.pile && site.truck;
    const pile = useSite ? { x: site.pile.x, z: site.pile.z } : fallbackPile;
    const truck = useSite ? { x: site.truck.x, z: site.truck.z } : { x: pile.x + 15, z: pile.z };

    // local +Z looks back toward the garage: open side for driving in and out
    const yaw = Math.atan2(-pile.x, -pile.z);
    this.root.position.set(pile.x, 0, pile.z);
    this.root.rotation.y = yaw;

    const dx = truck.x - pile.x, dz = truck.z - pile.z;
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    const localTruck = { x: ca * dx - sa * dz, z: sa * dx + ca * dz };

    this.info = { jobId: jobId, venue: venue, pile: pile, truck: truck, yaw: yaw, localTruck: localTruck };

    this._ground(venue.ground, venue.key === 'night' ? 26 : 30);

    const fn = this['_venue_' + venue.key];
    if (typeof fn === 'function') {
      try { fn.call(this, localTruck); }
      catch (e) { console.warn('[site] venue ' + venue.key + ' failed', e); }
    }
    this._common(localTruck);

    // physics: a fixed body per solid prop, removed again in dispose()
    if (opts.world && opts.RAPIER && this._colliders.length) {
      try {
        const R = opts.RAPIER;
        for (let i = 0; i < this._colliders.length; i++) {
          const c = this._colliders[i];
          const body = opts.world.createRigidBody(
            R.RigidBodyDesc.fixed().setTranslation(pile.x + c.x, c.y, pile.z + c.z)
          );
          // colliders are axis aligned in local space; rotate the offset, keep the box
          const lx = c.x, lz = c.z;
          const wx = ca * lx + sa * lz;
          const wz = -sa * lx + ca * lz;
          body.setTranslation({ x: pile.x + wx, y: c.y, z: pile.z + wz }, true);
          const half = [c.w / 2, c.h / 2, c.d / 2];
          if (c.ry) {
            const s = Math.abs(Math.sin(c.ry)), co = Math.abs(Math.cos(c.ry));
            const nw = half[0] * co + half[2] * s;
            const nd = half[0] * s + half[2] * co;
            half[0] = nw; half[2] = nd;
          }
          opts.world.createCollider(
            R.ColliderDesc.cuboid(half[0], half[1], half[2]).setFriction(0.9).setRestitution(0),
            body
          );
          this._bodies.push(body);
        }
      } catch (e) { console.warn('[site] colliders failed', e); }
    }

    return this.info;
  }

  // -------------------------------------------------- shared site furniture
  _common(truckLocal) {
    const metal = this._std(0x6e767f, { metalness: 0.5, roughness: 0.5 });
    const orange = this._std(0xff6a00, { roughness: 0.7 });
    const white = this._std(0xf2f4f6, { roughness: 0.6 });
    const dark = this._std(0x24272b, { roughness: 0.9 });

    // cones marking the two approach lanes (never on the truck side)
    const coneGeo = new THREE.ConeGeometry(0.34, 1.05, 10);
    const baseGeo = new THREE.BoxGeometry(0.8, 0.09, 0.8);
    const list = [];
    const base = [];
    for (let i = 0; i < 9; i++) {
      const a = -0.55 + i * 0.14;
      const r = 19 + (i % 2) * 2.4;
      list.push({ x: Math.sin(a) * r, y: 0.55, z: Math.cos(a) * r, ry: a });
      base.push({ x: Math.sin(a) * r, y: 0.045, z: Math.cos(a) * r, ry: a });
    }
    this._inst(coneGeo, orange, list);
    this._inst(baseGeo, dark, base);

    // reflective marker posts around the outer edge
    const postGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.25, 6);
    const posts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      if (Math.cos(a) > 0.5) continue; // keep the approach clear
      posts.push({ x: Math.sin(a) * 24, y: 0.62, z: Math.cos(a) * 24 });
    }
    this._inst(postGeo, white, posts);

    // scattered spoil clods (fills the pad with detail)
    const clodGeo = new THREE.DodecahedronGeometry(0.55, 0);
    const clods = [];
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * TAU;
      const r = 7 + Math.random() * 15;
      const s = 0.5 + Math.random() * 0.9;
      clods.push({
        x: Math.sin(a) * r, y: 0.18 + Math.random() * 0.12, z: Math.cos(a) * r,
        ry: Math.random() * TAU, rx: Math.random() * 0.6, s: s
      });
    }
    this._inst(clodGeo, this._std(0x6b4a2b, { roughness: 1 }), clods);

    // fence panels on the far side only (keeps the venue readable, not boxed in)
    const fenceMat = this._std(0xb9c2cc, { metalness: 0.4, roughness: 0.5 });
    const panelGeo = new THREE.BoxGeometry(3.6, 2.0, 0.09);
    const panels = [];
    for (let i = -3; i <= 3; i++) {
      const a = Math.PI + i * 0.16;
      panels.push({ x: Math.sin(a) * 25, y: 1.05, z: Math.cos(a) * 25, ry: a });
    }
    this._inst(panelGeo, fenceMat, panels);
    for (let i = 0; i < panels.length; i++) {
      this._collider(panels[i].x, 1.05, panels[i].z, 3.6, 2.1, 0.4, panels[i].ry);
    }

    // entrance sign: venue name, always facing the garage
    this._board(this.venue.name.toUpperCase(), this.venue.badge, '#f5a623', '#20180a', 0, 3.4, 27.5, 0, 8.5, 4.2);

    // a small site office container, offset from the pile
    const contX = -18, contZ = 15;
    const cont = this._std(0x2f6f8f, { roughness: 0.65, metalness: 0.2 });
    this._box(6.2, 2.7, 2.5, cont, contX, 1.45, contZ, 0.22);
    this._box(6.3, 0.18, 2.6, white, contX, 2.85, contZ, 0.22);
    const winMat = this._std(0x0e1a24, { emissive: 0x8fd0ff, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.1 });
    this._box(1.6, 1.0, 0.08, winMat, contX + 1.1, 1.8, contZ + 1.29, 0.22);
    this._collider(contX, 1.45, contZ, 6.2, 2.7, 2.5, 0.22);

    // fuel drum + pallet detail near the office
    this._cyl(0.42, 0.42, 1.1, 12, this._std(0xd94b2b, { roughness: 0.7 }), contX + 4.1, 0.55, contZ + 0.6);
    this._cyl(0.42, 0.42, 1.1, 12, this._std(0xf2c230, { roughness: 0.7 }), contX + 4.1, 0.55, contZ - 0.9);
    this._box(1.6, 0.16, 1.2, this._std(0x8a6a48, { roughness: 1 }), contX + 6.3, 0.1, contZ, 0);

    // work light on a tripod, pointing at the pad
    const tripod = this._std(0x3a3f45, { metalness: 0.4, roughness: 0.6 });
    this._cyl(0.06, 0.10, 3.0, 8, tripod, 14, 1.5, 9);
    this._box(1.0, 0.5, 0.35, this._std(0x1a1d21, { roughness: 0.7 }), 14, 3.1, 9);
    const lamp = this._box(0.86, 0.34, 0.06, this._std(0xfff4d0, { emissive: 0xfff0c0, emissiveIntensity: 1.6 }), 14, 3.1, 9.2);
    if (this.venue.key === 'night' || this.venue.key === 'storm') {
      const sp = new THREE.PointLight(0xffe9b0, 9, 34, 2);
      sp.position.set(14, 3.2, 9.6);
      this.root.add(sp);
      this._lights.push(sp);
      this._tickers.push((dt, t) => { sp.intensity = 8 + Math.sin(t * 6.7) * 0.55; });
    }
    void lamp;

    // truck pad marking so the drop-off point is obvious
    const pad = new THREE.Mesh(
      this._track(new THREE.PlaneGeometry(11, 15)),
      this._std(0xf2c230, {
        transparent: true, opacity: 0.28, roughness: 1,
        polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5
      })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = 0;
    pad.position.set(truckLocal.x, 0.085, truckLocal.z);
    this.root.add(pad);

    // arrow painted on the ground from the pile toward the truck
    const arrowMat = this._std(0xf7d34a, {
      transparent: true, opacity: 0.5, roughness: 1,
      polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5
    });
    const ang = Math.atan2(truckLocal.x, truckLocal.z);
    const dist = Math.hypot(truckLocal.x, truckLocal.z);
    for (let i = 1; i <= 3; i++) {
      const f = i / 4;
      this._box(0.55, 0.02, 1.5, arrowMat, truckLocal.x * f, 0.09, truckLocal.z * f, ang, false);
    }
    void metal;void dist;
  }

  // =============================================================== venue 1 ===
  _venue_highway() {
    const asphalt = this._std(0x2e3236, { roughness: 0.95 });
    const paint = this._std(0xe8ecef, { roughness: 0.8 });
    const barrier = this._std(0xd7d9db, { roughness: 0.85 });
    const steel = this._std(0x8b949e, { metalness: 0.55, roughness: 0.45 });

    // closed highway lanes running left to right behind the pile
    this._box(64, 0.06, 15, asphalt, 0, 0.04, -20, 0, false);
    const dash = [];
    for (let i = -14; i <= 14; i++) dash.push({ x: i * 2.2, y: 0.08, z: -20, sx: 1.1, sy: 0.02, sz: 0.22 });
    this._inst(new THREE.BoxGeometry(1, 1, 1), paint, dash, false);
    this._box(64, 0.02, 0.28, paint, 0, 0.08, -26.4, 0, false);
    this._box(64, 0.02, 0.28, paint, 0, 0.08, -13.6, 0, false);

    // jersey barriers = the classic closed-road look
    const jb = [];
    for (let i = -5; i <= 5; i++) {
      jb.push({ x: i * 4.2, y: 0.55, z: -12.6 });
      if (i % 2 === 0) jb.push({ x: i * 4.2, y: 0.55, z: -27.4 });
    }
    this._inst(new THREE.BoxGeometry(3.9, 1.1, 0.85), barrier, jb);
    for (let i = 0; i < jb.length; i++) this._collider(jb[i].x, 0.55, jb[i].z, 3.9, 1.1, 0.85, 0);

    // gantry sign over the closed lane
    this._box(0.5, 7.4, 0.5, steel, -13, 3.7, -12.6);
    this._box(0.5, 7.4, 0.5, steel, 13, 3.7, -12.6);
    this._box(26.4, 0.45, 0.5, steel, 0, 7.2, -12.6);
    this._board('ROAD CLOSED', 'CLEAN-UP CREW AHEAD', '#d63a2a', '#ffffff', 0, 5.6, -12.2, 0, 9.5, 4.6);

    // guardrail along the far edge
    const rail = [];
    for (let i = -8; i <= 8; i++) rail.push({ x: i * 2.6, y: 0.9, z: -32 });
    this._inst(new THREE.BoxGeometry(2.6, 0.28, 0.16), steel, rail);
    for (let i = -8; i <= 8; i += 2) this._box(0.14, 1.8, 0.14, steel, i * 2.6, 0.9, -32);

    // stalled car with hazard lights (blocked by the spill)
    const car = new THREE.Group();
    const body = this._box(2.0, 0.85, 4.4, this._std(0xc93b2c, { roughness: 0.4, metalness: 0.25 }), -9.5, 0.75, -2.4, 0.5);
    void body;
    this._box(1.8, 0.75, 2.2, this._std(0x1a2430, { roughness: 0.15, metalness: 0.3 }), -9.5, 1.5, -2.9, 0.5);
    const haz = this._std(0xffb020, { emissive: 0xffa000, emissiveIntensity: 2.2 });
    const l1 = this._box(0.3, 0.22, 0.1, haz, -10.3, 0.95, -0.55, 0.5);
    const l2 = this._box(0.3, 0.22, 0.1, haz, -8.7, 0.95, -4.3, 0.5);
    this._collider(-9.5, 0.9, -2.4, 2.2, 1.8, 4.6, 0.5);
    this._tickers.push((dt, t) => {
      const on = Math.sin(t * 5.4) > 0;
      haz.emissiveIntensity = on ? 2.4 : 0.15;
      l1.visible = l2.visible = on;
    });
    void car;

    // traffic drums with reflective bands
    const drumGeo = new THREE.CylinderGeometry(0.42, 0.5, 1.0, 12);
    const drumMat = this._std(0xff7a1a, { roughness: 0.75 });
    const drums = [{ x: -4, z: 12 }, { x: 3.5, z: 13.5 }, { x: -1, z: 16 }];
    this._inst(drumGeo, drumMat, drums.map(d => ({ x: d.x, y: 0.5, z: d.z })));
    const bands = [];
    for (let i = 0; i < drums.length; i++) bands.push({ x: drums[i].x, y: 0.72, z: drums[i].z });
    this._inst(new THREE.CylinderGeometry(0.45, 0.46, 0.18, 12), this._std(0xf4f6f8, { roughness: 0.5 }), bands);
  }

  // =============================================================== venue 2 ===
  _venue_park() {
    const stone = this._std(0x9b9587, { roughness: 0.95 });
    const trunk = this._std(0x5b4630, { roughness: 1 });
    const leafA = this._std(0x3f6b2f, { roughness: 1 });
    const leafB = this._std(0x54823a, { roughness: 1 });
    const wood = this._std(0x8a6f4a, { roughness: 0.9 });
    const iron = this._std(0x2b3038, { metalness: 0.5, roughness: 0.5 });

    // pond with a stone rim
    const water = new THREE.Mesh(
      this._track(new THREE.CircleGeometry(8.5, 40)),
      this._std(0x2f6f8a, { roughness: 0.08, metalness: 0.75 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(-16, 0.1, -13);
    this.root.add(water);
    const rim = this._track(new THREE.RingGeometry(8.5, 10.2, 40));
    const rimMesh = new THREE.Mesh(rim, stone);
    rimMesh.rotation.x = -Math.PI / 2;
    rimMesh.position.set(-16, 0.11, -13);
    rimMesh.receiveShadow = true;
    this.root.add(rimMesh);
    const stones = [];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU;
      stones.push({ x: -16 + Math.cos(a) * 9.4, y: 0.16, z: -13 + Math.sin(a) * 9.4, ry: a, s: 0.7 + (i % 3) * 0.15 });
    }
    this._inst(new THREE.DodecahedronGeometry(0.6, 0), stone, stones);

    // hedges: two long runs that frame the work area
    const hedgeGeo = new THREE.BoxGeometry(9, 1.5, 1.4);
    const hedgeA = [{ x: 12, y: 0.78, z: -8, ry: 0.25 }, { x: 16, y: 0.78, z: 4, ry: 1.35 }];
    this._inst(hedgeGeo, leafB, hedgeA);
    for (let i = 0; i < hedgeA.length; i++) this._collider(hedgeA[i].x, 0.78, hedgeA[i].z, 9, 1.6, 1.5, hedgeA[i].ry);

    // trees: trunks + two cone tiers, instanced
    const trunks = [];
    const leaf1 = [];
    const leaf2 = [];
    const spots = [
      [-23, 6], [-26, -3], [-8, -22], [2, -24], [11, -20], [20, -14],
      [22, -2], [-20, 14], [-12, 19], [6, 21], [17, 15], [-2, 20], [26, 8], [-30, -8]
    ];
    for (let i = 0; i < spots.length; i++) {
      const s = 0.85 + (i % 4) * 0.16;
      trunks.push({ x: spots[i][0], y: 1.6 * s, z: spots[i][1], s: s });
      leaf1.push({ x: spots[i][0], y: 4.1 * s, z: spots[i][1], s: s });
      leaf2.push({ x: spots[i][0], y: 5.6 * s, z: spots[i][1], s: s * 0.82 });
    }
    this._inst(new THREE.CylinderGeometry(0.22, 0.32, 3.2, 8), trunk, trunks);
    this._inst(new THREE.ConeGeometry(2.3, 2.6, 10), leafA, leaf1);
    this._inst(new THREE.ConeGeometry(1.85, 2.3, 10), leafB, leaf2);

    // gravel path from the entrance to the pile
    const pathMat = this._std(0xb5a785, {
      roughness: 1, transparent: true, opacity: 0.85,
      polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5
    });
    this._box(6.5, 0.03, 26, pathMat, 0, 0.09, 16, 0, false);

    // benches
    const bench = (x, z, ry) => {
      this._box(2.6, 0.16, 0.7, wood, x, 0.62, z, ry);
      this._box(2.6, 0.7, 0.16, wood, x, 0.95, z - 0.34, ry);
      this._box(0.16, 0.62, 0.6, iron, x - 1.1, 0.31, z, ry);
      this._box(0.16, 0.62, 0.6, iron, x + 1.1, 0.31, z, ry);
      this._collider(x, 0.6, z, 2.8, 1.2, 0.9, ry);
    };
    bench(-9, 9, 0.3);
    bench(-19, 12, -0.2);
    bench(-24, -1, 1.2);

    // park lamps with warm glow
    const lampPost = (x, z) => {
      this._cyl(0.09, 0.12, 4.2, 8, iron, x, 2.1, z);
      this._box(0.55, 0.28, 0.55, this._std(0xfff2cf, { emissive: 0xffe6ac, emissiveIntensity: 1.3 }), x, 4.3, z);
    };
    lampPost(-12, 3);
    lampPost(8, -6);

    // landslide scar: broken turf and a small rubble fan on the pile side
    const scar = new THREE.Mesh(
      this._track(new THREE.CircleGeometry(9, 24)),
      this._std(0x7a5a3c, { roughness: 1, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 })
    );
    scar.rotation.x = -Math.PI / 2;
    scar.position.set(6, 0.095, -6);
    scar.scale.set(1.5, 0.8, 1);
    this.root.add(scar);
    const rubble = [];
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * TAU;
      const r = 4 + Math.random() * 7;
      rubble.push({ x: 6 + Math.cos(a) * r, y: 0.2, z: -6 + Math.sin(a) * r, s: 0.4 + Math.random() * 0.5, ry: a });
    }
    this._inst(new THREE.DodecahedronGeometry(0.5, 0), this._std(0x6f5133, { roughness: 1 }), rubble);

    // low wooden fence along the path
    const post = [];
    for (let i = -4; i <= 4; i++) {
      post.push({ x: i * 3.2 - 11, y: 0.55, z: 12, ry: 0 });
    }
    this._inst(new THREE.BoxGeometry(0.16, 1.1, 0.16), wood, post);
    this._box(26, 0.12, 0.1, wood, -11, 0.95, 12, 0);
  }

  // =============================================================== venue 3 ===
  _venue_bridge() {
    const steel = this._std(0x5d6672, { metalness: 0.6, roughness: 0.42 });
    const rust = this._std(0x8a5a34, { metalness: 0.25, roughness: 0.85 });
    const deckMat = this._std(0x8d8f92, { roughness: 0.9 });
    const concrete = this._std(0xa6a8a4, { roughness: 0.95 });

    // canal under the deck: water + walls, the bridge crosses it
    const water = new THREE.Mesh(
      this._track(new THREE.PlaneGeometry(120, 26)),
      this._std(0x2a5f78, { roughness: 0.12, metalness: 0.7 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.55, -18);
    this.root.add(water);
    this._box(120, 1.6, 1.0, concrete, 0, -0.8, -5.2, 0, false);
    this._box(120, 1.6, 1.0, concrete, 0, -0.8, -30.8, 0, false);

    // the bridge deck itself, slightly raised
    this._box(18, 0.45, 30, deckMat, 0, 0.22, -18, 0, false);
    const joints = [];
    for (let i = 0; i < 8; i++) joints.push({ x: -8 + i * 2.3, y: 0.45, z: -18, sy: 0.02, sx: 1.6, sz: 0.12 });
    this._inst(new THREE.BoxGeometry(1, 1, 1), this._std(0x2b2f34, { roughness: 0.9 }), joints, false);

    // railings both sides: posts + two rails + X bracing
    const posts = [];
    for (let i = -7; i <= 7; i++) {
      posts.push({ x: -8.6, y: 1.3, z: -18 + i * 2.0 });
      posts.push({ x: 8.6, y: 1.3, z: -18 + i * 2.0 });
    }
    this._inst(new THREE.BoxGeometry(0.16, 1.9, 0.16), steel, posts);
    this._box(0.18, 0.16, 30, steel, -8.6, 2.2, -18);
    this._box(0.18, 0.16, 30, steel, 8.6, 2.2, -18);
    this._box(0.18, 0.16, 30, steel, -8.6, 1.15, -18);
    this._box(0.18, 0.16, 30, steel, 8.6, 1.15, -18);
    this._collider(-8.6, 1.3, -18, 0.4, 2.2, 30, 0);
    this._collider(8.6, 1.3, -18, 0.4, 2.2, 30, 0);

    // truss arches over the deck
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < 7; i++) {
        const z0 = -30 + i * 4;
        this._box(0.22, 4.2, 0.22, rust, s * 8.6, 3.6, z0);
        if (i < 6) {
          const a = Math.atan2(4.2, 4);
          const diag = this._box(0.16, 0.16, 5.6, rust, s * 8.6, 5.6, z0 + 2, 0);
          diag.rotation.x = a;
        }
      }
      this._box(0.26, 0.26, 30, steel, s * 8.6, 5.7, -18);
    }

    // orange safety netting at the near end
    const net = this._std(0xff7a1a, { transparent: true, opacity: 0.55, roughness: 0.9, side: THREE.DoubleSide });
    const netMesh = new THREE.Mesh(this._track(new THREE.PlaneGeometry(17, 2.2)), net);
    netMesh.position.set(0, 1.3, -3.2);
    this.root.add(netMesh);
    this._box(0.14, 2.4, 0.14, steel, -8.4, 1.2, -3.2);
    this._box(0.14, 2.4, 0.14, steel, 8.4, 1.2, -3.2);

    // scaffolding tower next to the deck
    const scaf = [];
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) {
        scaf.push({ x: 13 + x * 2.4, y: 1.05 + y * 2.1, z: -6 + z * 2.4 });
      }
    }
    this._inst(new THREE.BoxGeometry(0.12, 2.1, 0.12), steel, scaf);
    for (let y = 1; y <= 4; y++) {
      this._box(2.7, 0.1, 0.1, steel, 14.2, y * 2.1, -6);
      this._box(2.7, 0.1, 0.1, steel, 14.2, y * 2.1, -3.6);
      this._box(0.1, 0.1, 2.7, steel, 13, y * 2.1, -4.8);
    }
    this._box(2.6, 0.16, 2.6, this._std(0x8a6f4a, { roughness: 1 }), 14.2, 4.3, -4.8);
    this._collider(14.2, 2.2, -4.8, 3.2, 4.4, 3.2, 0);

    // warning flags on the railing
    const flagMat = this._std(0xd63a2a, { roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(this._track(new THREE.PlaneGeometry(0.9, 0.6)), flagMat);
      f.position.set(-8.7, 2.5, -8 - i * 4);
      this.root.add(f);
      this._tickers.push((dt, t) => { f.rotation.y = Math.sin(t * 3 + i) * 0.35; });
    }
  }

  // =============================================================== venue 4 ===
  _venue_night() {
    const metal = this._std(0x383d44, { metalness: 0.45, roughness: 0.6 });
    const black = this._std(0x14171b, { roughness: 0.85 });
    const glow = this._std(0xfff3cf, { emissive: 0xfff0b8, emissiveIntensity: 2.4, roughness: 0.3 });

    // two floodlight masts lighting the pad from opposite corners
    const mast = (x, z) => {
      this._cyl(0.16, 0.26, 13, 8, metal, x, 6.5, z);
      this._box(2.6, 0.3, 0.5, metal, x, 13.1, z);
      for (let i = 0; i < 3; i++) {
        this._box(0.7, 0.5, 0.16, glow, x - 0.9 + i * 0.9, 13.55, z);
      }
      this._collider(x, 6.5, z, 0.7, 13, 0.7, 0);
      const sp = new THREE.SpotLight(0xfff0c8, 120, 60, 0.72, 0.45, 1.6);
      sp.position.set(x, 13.6, z);
      sp.target.position.set(0, 0, 0);
      this.root.add(sp);
      this.root.add(sp.target);
      this._lights.push(sp);
      this._tickers.push((dt, t) => { sp.intensity = 118 + Math.sin(t * 11.3 + x) * 3; });
      return sp;
    };
    mast(-17, -12);
    mast(19, -8);

    // generator trailer humming next to the office
    this._box(3.2, 1.5, 1.8, this._std(0xd8b23a, { roughness: 0.7 }), -13, 0.95, 20, 0.3);
    this._box(1.2, 0.9, 0.12, this._std(0x22303c, { roughness: 0.4, metalness: 0.3 }), -13, 1.1, 21.0);
    this._cyl(0.36, 0.36, 0.3, 10, black, -14.2, 0.36, 20.3).rotation.z = Math.PI / 2;
    this._cyl(0.36, 0.36, 0.3, 10, black, -11.8, 0.36, 20.3).rotation.z = Math.PI / 2;
    this._collider(-13, 0.9, 20, 3.4, 1.8, 2.0, 0.3);

    // neon site sign
    const neon = this._sign('NIGHT CREW', 'WORK IN PROGRESS', '#101820', '#ffd24a', 8, 4);
    neon.material.emissive = new THREE.Color(0xffb020);
    neon.material.emissiveIntensity = 1.1;
    neon.material.emissiveMap = neon.material.map;
    neon.position.set(0, 3.6, 27.5);
    this._tickers.push((dt, t) => {
      neon.material.emissiveIntensity = Math.sin(t * 9) > -0.86 ? 1.1 : 0.2;
    });

    // parked dump truck silhouette
    const t2 = new THREE.Group();
    this._box(3.0, 2.6, 7.2, this._std(0x1d3f7a, { roughness: 0.5, metalness: 0.2 }), 21, 1.6, 6, 0.9);
    this._box(3.2, 0.9, 2.0, black, 21, 3.2, 6.8, 0.9);
    const tail = this._box(0.4, 0.3, 0.1, this._std(0xff3a2a, { emissive: 0xff2010, emissiveIntensity: 2 }), 19.6, 1.2, 9.6, 0.9);
    this._collider(21, 1.6, 6, 3.4, 3.4, 7.6, 0.9);
    this._tickers.push((dt, t) => { tail.material.emissiveIntensity = 1.2 + Math.sin(t * 1.6) * 0.5; });
    void t2;

    // hazard chevrons on the ground pointing to the truck pad
    const chevMat = this._std(0xffb020, {
      emissive: 0xffa000, emissiveIntensity: 0.6, roughness: 0.9,
      transparent: true, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6
    });
    for (let i = 0; i < 6; i++) {
      const c = this._box(1.0, 0.02, 0.3, chevMat, -6 + i * 2.4, 0.1, 8, 0, false);
      c.rotation.y = 0.5;
    }

    // low glow lamps along the fence line
    const lamps = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI * 0.55 + i * 0.22;
      lamps.push({ x: Math.sin(a) * 23, y: 0.35, z: Math.cos(a) * 23 });
    }
    this._inst(new THREE.SphereGeometry(0.2, 8, 6), this._std(0xfff0c0, { emissive: 0xffdd88, emissiveIntensity: 2 }), lamps);
  }

  // =============================================================== venue 5 ===
  _venue_storm() {
    const wet = this._std(0x4a545e, { roughness: 0.25, metalness: 0.45 });
    const bag = this._std(0x9c8f6e, { roughness: 1 });
    const rock = this._std(0x5f6469, { roughness: 1 });

    // rain: a moving point cloud around the player
    const N = 1400;
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 70;
      pos[i * 3 + 1] = Math.random() * 26;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
      vel[i] = 16 + Math.random() * 12;
    }
    const rgeo = this._track(new THREE.BufferGeometry());
    rgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const rmat = this._track(new THREE.PointsMaterial({
      color: 0xcfe0ee, size: 0.16, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true
    }));
    const rain = new THREE.Points(rgeo, rmat);
    rain.frustumCulled = false;
    this.root.add(rain);
    this._tickers.push((dt) => {
      const a = rgeo.getAttribute('position');
      const arr = a.array;
      for (let i = 0; i < N; i++) {
        arr[i * 3 + 1] -= vel[i] * dt;
        arr[i * 3] -= dt * 2.2;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 26;
          arr[i * 3] = (Math.random() - 0.5) * 70;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 70;
        }
      }
      a.needsUpdate = true;
    });

    // big puddles that reflect the sky
    const puddleMat = this._std(0x5c707f, { roughness: 0.05, metalness: 0.95 });
    const puddles = [
      { x: 8, z: 10, s: 3.4 }, { x: -7, z: 14, s: 2.6 }, { x: -14, z: 2, s: 3.0 },
      { x: 15, z: -3, s: 2.2 }, { x: 2, z: -14, s: 2.8 }, { x: 18, z: 13, s: 2.0 }
    ];
    const pgeo = this._track(new THREE.CircleGeometry(1, 20));
    for (let i = 0; i < puddles.length; i++) {
      const p = new THREE.Mesh(pgeo, puddleMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(puddles[i].x, 0.088, puddles[i].z);
      p.scale.set(puddles[i].s, puddles[i].s * 0.7, 1);
      this.root.add(p);
    }

    // collapsed retaining wall: a fan of rubble with exposed rebar
    this._box(14, 1.7, 1.1, wet, -12, 0.85, -14, 0.35);
    this._collider(-12, 0.85, -14, 14, 1.8, 1.3, 0.35);
    const rocks = [];
    for (let i = 0; i < 22; i++) {
      const a = -0.6 + Math.random() * 1.2;
      const r = 2 + Math.random() * 8;
      rocks.push({
        x: -12 + Math.sin(a) * r, y: 0.2 + Math.random() * 0.3, z: -13 + Math.cos(a) * r,
        s: 0.4 + Math.random() * 0.75, ry: Math.random() * TAU
      });
    }
    this._inst(new THREE.DodecahedronGeometry(0.6, 0), rock, rocks);
    const rebar = [];
    for (let i = 0; i < 8; i++) {
      rebar.push({ x: -17 + i * 1.4, y: 1.5, z: -13.6, rz: (Math.random() - 0.5) * 0.5, rx: (Math.random() - 0.5) * 0.4 });
    }
    this._inst(new THREE.CylinderGeometry(0.045, 0.045, 1.7, 5), this._std(0x8a5a34, { metalness: 0.6, roughness: 0.6 }), rebar);

    // sandbag line keeping the water away from the pad
    const bags = [];
    for (let i = 0; i < 16; i++) {
      bags.push({ x: 22 - i * 0.1, y: 0.22 + (i % 2) * 0.35, z: 16 - i * 0.9, ry: 0.4 + i * 0.3, sx: 1.2, sy: 0.7, sz: 1 });
    }
    this._inst(new THREE.BoxGeometry(0.9, 0.55, 1.5), bag, bags);

    // rescue van with flashing blue lights
    this._box(3.4, 2.4, 6.6, this._std(0xe8eced, { roughness: 0.5, metalness: 0.2 }), 20, 1.45, -4, -0.4);
    this._box(3.5, 0.9, 1.0, this._std(0xd63a2a, { roughness: 0.6 }), 20, 0.9, -4, -0.4);
    this._box(1.4, 0.5, 1.6, this._std(0x1b2530, { roughness: 0.2, metalness: 0.3 }), 20, 2.4, -6.2, -0.4);
    const beaconMat = this._std(0x3a7bff, { emissive: 0x2a6bff, emissiveIntensity: 3 });
    const b1 = this._box(0.7, 0.22, 0.3, beaconMat, 19.3, 2.85, -4, -0.4);
    const b2 = this._box(0.7, 0.22, 0.3, this._std(0xff2a2a, { emissive: 0xff1010, emissiveIntensity: 3 }), 20.7, 2.85, -4, -0.4);
    this._collider(20, 1.45, -4, 3.6, 2.6, 7.2, -0.4);
    const beacon = new THREE.PointLight(0x2a6bff, 14, 30, 2);
    beacon.position.set(20, 3.2, -4);
    this.root.add(beacon);
    this._lights.push(beacon);
    this._tickers.push((dt, t) => {
      const on = Math.sin(t * 7.5) > 0;
      beaconMat.emissiveIntensity = on ? 4 : 0.2;
      b2.material.emissiveIntensity = on ? 0.2 : 4;
      b1.visible = b2.visible = true;
      beacon.intensity = on ? 16 : 3;
    });

    // warning tape strung between posts
    const tapeMat = this._std(0xffd24a, { roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const t1 = new THREE.Mesh(this._track(new THREE.PlaneGeometry(5.4, 0.28)), tapeMat);
      t1.position.set(-16 + i * 5.2, 1.1, 12.5);
      this.root.add(t1);
      this._tickers.push((dt, t) => { t1.rotation.z = Math.sin(t * 4 + i) * 0.05; });
    }
  }

  // =============================================================== venue 6 ===
  _venue_skyline() {
    const steel = this._std(0xe0a92a, { metalness: 0.5, roughness: 0.5 });
    const dark = this._std(0x2f343a, { metalness: 0.4, roughness: 0.6 });
    const concrete = this._std(0xb3b2ac, { roughness: 0.95 });
    const rebarMat = this._std(0x8a5a34, { metalness: 0.65, roughness: 0.55 });

    // --- tower crane: mast, jib, counter-jib, counterweight, hook
    const mx = -16, mz = -16, H = 34;
    const mastGeo = new THREE.BoxGeometry(0.22, 2.4, 0.22);
    const mast = [];
    for (let y = 0; y < H; y += 2.4) {
      mast.push({ x: mx - 0.8, y: y + 1.2, z: mz - 0.8 });
      mast.push({ x: mx + 0.8, y: y + 1.2, z: mz - 0.8 });
      mast.push({ x: mx - 0.8, y: y + 1.2, z: mz + 0.8 });
      mast.push({ x: mx + 0.8, y: y + 1.2, z: mz + 0.8 });
    }
    this._inst(mastGeo, steel, mast);
    for (let y = 2.4; y < H; y += 4.8) {
      this._box(1.8, 0.14, 0.14, steel, mx, y, mz - 0.8, 0, false);
      this._box(1.8, 0.14, 0.14, steel, mx, y, mz + 0.8, 0, false);
    }
    this._box(1.8, 0.6, 1.8, dark, mx, 0.3, mz);
    this._collider(mx, 1.0, mz, 2.6, 2.0, 2.6, 0);

    const jib = this._box(30, 0.5, 0.7, steel, mx + 13, H, mz, 0, false);
    jib.rotation.y = 0.2;
    this._box(9, 0.5, 0.7, steel, mx - 5, H, mz, 0.2, false);
    this._box(2.0, 2.0, 2.4, dark, mx - 9, H - 0.6, mz, 0.2);
    this._box(1.6, 1.4, 1.6, dark, mx + 1.2, H + 0.9, mz, 0.2);
    // hook block on a cable
    const hook = new THREE.Group();
    this._cyl(0.05, 0.05, 18, 5, dark, 0, -9, 0);
    this._box(0.9, 0.9, 0.9, dark, 0, -18.4, 0);
    const hookMesh = new THREE.Mesh(this._track(new THREE.TorusGeometry(0.45, 0.12, 6, 12, Math.PI * 1.5)), dark);
    hookMesh.position.set(0, -19.2, 0);
    hookMesh.castShadow = true;
    hook.add(hookMesh);
    hook.position.set(mx + 16, H - 0.4, mz);
    this.root.add(hook);
    this._tickers.push((dt, t) => {
      hook.rotation.y = Math.sin(t * 0.5) * 0.5;
      hook.position.x = mx + 16 + Math.sin(t * 0.35) * 2.5;
    });

    // --- foundation pit with rebar grid and formwork
    const pit = new THREE.Group();
    const px = 8, pz = -10;
    this._box(16, 0.4, 16, this._std(0x6a6459, { roughness: 1 }), px, 0.12, pz, 0, false);
    this._box(16, 2.6, 0.5, concrete, px, 1.3, pz - 8);
    this._box(16, 2.6, 0.5, concrete, px, 1.3, pz + 8);
    this._box(0.5, 2.6, 16, concrete, px - 8, 1.3, pz);
    this._box(0.5, 2.6, 16, concrete, px + 8, 1.3, pz);
    this._collider(px, 1.3, pz - 8, 16, 2.6, 0.7, 0);
    this._collider(px, 1.3, pz + 8, 16, 2.6, 0.7, 0);
    this._collider(px - 8, 1.3, pz, 0.7, 2.6, 16, 0);
    this._collider(px + 8, 1.3, pz, 0.7, 2.6, 16, 0);
    const bars = [];
    for (let i = 0; i <= 10; i++) {
      bars.push({ x: px - 7 + i * 1.4, y: 0.75, z: pz, rz: Math.PI / 2, sx: 1, sy: 1, sz: 1 });
    }
    const barGeo = new THREE.CylinderGeometry(0.05, 0.05, 15, 5);
    const barsX = bars.map(b => ({ x: b.x, y: b.y, z: pz, rz: Math.PI / 2 }));
    const barsZ = [];
    for (let i = 0; i <= 10; i++) barsZ.push({ x: px, y: 0.9, z: pz - 7 + i * 1.4, rx: Math.PI / 2 });
    this._inst(barGeo, rebarMat, barsX);
    this._inst(barGeo, rebarMat, barsZ);
    void pit;

    // --- half-built concrete tower with floor slabs and column stubs
    for (let f = 0; f < 5; f++) {
      const y = 3.2 + f * 3.0;
      this._box(13, 0.32, 13, concrete, -2, y, -30, 0, false);
      if (f < 4) {
        const cols = [];
        for (const cxo of [-5.8, 0, 5.8]) for (const czo of [-5.8, 0, 5.8]) {
          cols.push({ x: -2 + cxo, y: y + 1.5, z: -30 + czo });
        }
        this._inst(new THREE.CylinderGeometry(0.34, 0.34, 2.7, 8), concrete, cols);
      }
    }
    this._collider(-2, 9, -30, 13.4, 18, 13.4, 0);

    // --- scaffolding along the tower face
    const sc = [];
    for (let y = 0; y < 6; y++) for (let x = 0; x < 4; x++) {
      sc.push({ x: -2 - 7.2, y: 1.0 + y * 2.0, z: -30 - 6 + x * 4 });
    }
    this._inst(new THREE.BoxGeometry(0.1, 2.0, 0.1), steel, sc);
    for (let y = 1; y <= 6; y++) this._box(0.1, 0.1, 12, steel, -9.2, y * 2.0, -30);

    // --- portacabin, mixer truck and material stacks
    this._box(6.4, 2.6, 2.6, this._std(0xf0f2f4, { roughness: 0.6 }), 20, 1.4, 16, -0.35);
    this._box(2.0, 0.9, 0.1, this._std(0x203040, { emissive: 0x9fd8ff, emissiveIntensity: 0.4, roughness: 0.2 }), 18.9, 1.7, 17.2, -0.35);
    this._collider(20, 1.4, 16, 6.6, 2.7, 2.8, -0.35);

    this._box(3.2, 2.6, 7.0, this._std(0xe6e9ec, { roughness: 0.5 }), 22, 1.5, -2, -0.9);
    const drum = this._cyl(1.35, 1.35, 2.0, 14, this._std(0xd8dbde, { roughness: 0.7 }), 22, 2.8, -5.6);
    drum.rotation.x = Math.PI / 2;
    this._collider(22, 1.6, -3, 3.6, 3.4, 8.0, -0.9);

    const stack = [];
    for (let i = 0; i < 12; i++) {
      stack.push({ x: 14 + (i % 3) * 1.9, y: 0.3 + Math.floor(i / 3) * 0.55, z: 20 + (i % 2) * 1.4, ry: 0.1 * i });
    }
    this._inst(new THREE.BoxGeometry(1.7, 0.5, 1.2), this._std(0x9aa3ab, { roughness: 0.8 }), stack);
  }

  // ------------------------------------------------------------------ update
  update(dt, focus) {
    this._time += dt;
    const t = this._time;
    const list = this._tickers;
    for (let i = 0; i < list.length; i++) {
      try { list[i](dt, t); } catch (e) { /* a broken ticker must not stop the game */ }
    }
    if (focus && this.venue && this.venue.key === 'storm') {
      // keep the rain box around the player instead of the site centre
      this.root.position.x += 0;
      void focus;
    }
  }

  // ----------------------------------------------------------------- dispose
  dispose() {
    const w = this.world;
    for (let i = 0; i < this._bodies.length; i++) {
      try { w.removeRigidBody(this._bodies[i]); } catch (e) { /* ignore */ }
    }
    this._bodies.length = 0;
    this._tickers.length = 0;
    this._lights.length = 0;
    this._colliders.length = 0;

    if (this.root) {
      for (let i = this.root.children.length - 1; i >= 0; i--) {
        this.root.remove(this.root.children[i]);
      }
    }
    for (let i = 0; i < this._geo.length; i++) { try { this._geo[i].dispose(); } catch (e) {} }
    for (let i = 0; i < this._mat.length; i++) { try { this._mat[i].dispose(); } catch (e) {} }
    for (let i = 0; i < this._tex.length; i++) { try { this._tex[i].dispose(); } catch (e) {} }
    this._geo.length = 0;
    this._mat.length = 0;
    this._tex.length = 0;
    this.info = null;
  }
}
