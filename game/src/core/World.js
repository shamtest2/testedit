import * as THREE from 'three';

// World: city, roads, sky, props, job site.
// Rules used here (anti-flicker): road markings live inside ONE texture,
// layers are 0.02 apart with polygonOffset, windows use mipmaps + anisotropy 8,
// no thin strips of geometry.

const FLOOR_H = 3.5;
const BAY_W = 3;
const Y0 = 0.05;
const ROAD_POS = [-240, -160, -80, 80, 160, 240];
const ROAD_HALF = 12;
const WORLD_EDGE = 1000;
const ANISO = 8;

function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finishTexture(canvas, repeatX, repeatY) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  if (repeatX) t.repeat.set(repeatX, repeatY || repeatX);
  t.anisotropy = ANISO;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

class GeoBuf {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
    this.n = 0;
  }
  // p: 4 vertices [x,y,z], counter-clockwise as seen from outside
  quad(p, nx, ny, nz, uvs, color) {
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.nor.push(nx, ny, nz);
      this.uv.push(uvs[i][0], uvs[i][1]);
      this.col.push(color.r, color.g, color.b);
    }
    const o = this.n;
    this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    this.n += 4;
  }
  get empty() { return this.n === 0; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// flat quad that faces up
function upQuad(g, x0, z0, x1, z1, y, uv00, uv10, uv11, uv01, color) {
  g.quad([[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], 0, 1, 0, [uv00, uv01, uv11, uv10], color);
}

// wall quad, start -> end is left -> right as seen from outside
function wallQuad(g, sx, sz, ex, ez, ya, yb, nx, nz, color, uBase, vOff, tileW, tileH) {
  const len = Math.hypot(ex - sx, ez - sz);
  const u0 = uBase;
  const u1 = uBase + len / tileW;
  const v0 = (ya - Y0) / tileH + vOff;
  const v1 = (yb - Y0) / tileH + vOff;
  g.quad(
    [[sx, ya, sz], [ex, ya, ez], [ex, yb, ez], [sx, yb, sz]],
    nx, 0, nz,
    [[u0, v0], [u1, v0], [u1, v1], [u0, v1]],
    color
  );
}

function boxWalls(g, cx, cz, w, d, ya, yb, color, uBase, vOff, tileW, tileH) {
  const hx = w / 2, hz = d / 2;
  wallQuad(g, cx - hx, cz + hz, cx + hx, cz + hz, ya, yb, 0, 1, color, uBase, vOff, tileW, tileH);
  wallQuad(g, cx + hx, cz - hz, cx - hx, cz - hz, ya, yb, 0, -1, color, uBase, vOff, tileW, tileH);
  wallQuad(g, cx + hx, cz + hz, cx + hx, cz - hz, ya, yb, 1, 0, color, uBase, vOff, tileW, tileH);
  wallQuad(g, cx - hx, cz - hz, cx - hx, cz + hz, ya, yb, -1, 0, color, uBase, vOff, tileW, tileH);
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.buildingData = [];
    this.buildingMeshes = [];
    this.treeMeshes = [];
    this.propColliders = [];
    this.dirtPileGroup = null;
    this.allDirtClods = [];
    this._masterClods = [];
    this.trafficCars = [];
    this.truckDirtLevel = 0;
    this.truckDirtMeshes = [];
    this.sky = null;
    this.blocks = [];
    this.rand = makeRng(20241102);

    this.createLighting();
    this.createTerrain();
    this.generateCityGrid();
    this.createCentralGarageHub();
    this.createJobSite();
    this.createOptimizedTraffic();
    this.createProps();
    this.startTrafficAI();
  }

  // ------------------------------------------------------------ lighting + sky

  createLighting() {
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x778866, 0.9);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff5e6, 2.0);
    this.sunLight.position.set(100, 200, 100);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 500;
    this.sunLight.shadow.camera.left = -150;
    this.sunLight.shadow.camera.right = 150;
    this.sunLight.shadow.camera.top = 150;
    this.sunLight.shadow.camera.bottom = -150;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.04;
    this.scene.add(this.sunLight);

    const skyGeo = new THREE.SphereGeometry(1000, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x2f77c8) },
        bottomColor: { value: new THREE.Color(0xcfe2f3) },
        sunColor: { value: new THREE.Color(0xfff2cc) },
        sunDirection: { value: new THREE.Vector3(100, 200, 100).normalize() },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vObj;
        void main() {
          vObj = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform vec3 sunColor;
        uniform vec3 sunDirection;
        uniform float exponent;
        varying vec3 vObj;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p *= 2.03;
            a *= 0.5;
          }
          return v;
        }
        void main() {
          vec3 dir = normalize(vObj);
          float h = max(dir.y, 0.0);
          vec3 sky = mix(bottomColor, topColor, pow(h, exponent));
          vec2 cp = dir.xz / (dir.y + 0.18) * 1.1;
          float cl = smoothstep(0.56, 0.90, fbm(cp));
          cl *= smoothstep(0.02, 0.22, dir.y);
          sky = mix(sky, vec3(1.0), cl * 0.6);
          float sunDot = max(dot(dir, normalize(sunDirection)), 0.0);
          float disc = smoothstep(0.9992, 0.9997, sunDot);
          float glow = pow(sunDot, 120.0) * 0.5;
          sky += sunColor * (disc * 3.0 + glow);
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    // Our own fog (clear blue day, you can see about 1 km). Fog colour = sky horizon colour.
    // main.js may try to set another fog later: we keep this one. (To be tidied in M4.)
    const worldFog = new THREE.FogExp2(0xcfe2f3, 0.0011);
    this.scene.fog = worldFog;
    Object.defineProperty(this.scene, 'fog', { get: () => worldFog, set: () => {}, configurable: true });
  }

  // ------------------------------------------------------------------ ground

  createTerrain() {
    const R = this.rand;
    const cv = makeCanvas(512, 512);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#dcdcd6';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 160; i++) {
      const x = R() * 512, y = R() * 512, r = 10 + R() * 30;
      const g = R() < 0.5 ? 0 : 255;
      ctx.fillStyle = 'rgba(' + g + ',' + g + ',' + g + ',0.07)';
      for (let dx = -512; dx <= 512; dx += 512) {
        for (let dy = -512; dy <= 512; dy += 512) {
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    for (let i = 0; i < 7000; i++) {
      const g = 150 + Math.floor(R() * 105);
      ctx.fillStyle = 'rgba(' + g + ',' + g + ',' + g + ',0.35)';
      ctx.fillRect(R() * 512, R() * 512, 1 + R() * 1.5, 2 + R() * 4);
    }
    const tex = finishTexture(cv, 160, 160);

    const groundGeo = new THREE.PlaneGeometry(2000, 2000, 128, 128);
    const pos = groundGeo.attributes.position;
    const colors = [];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const n = Math.sin(x * 0.03) * Math.cos(y * 0.04)
        + Math.sin(x * 0.11 + y * 0.07) * 0.5
        + Math.sin(x * 0.21) * 0.25;
      const t = THREE.MathUtils.clamp((n + 1.75) / 3.5, 0, 1);
      c.setHSL(0.24 + t * 0.07, 0.38 + t * 0.12, 0.30 + t * 0.10);
      colors.push(c.r, c.g, c.b);
    }
    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const groundMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1.0, map: tex,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  // ------------------------------------------------------------------- roads

  _asphalt(ctx, w, h) {
    const R = this.rand;
    ctx.fillStyle = '#3b3d42';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h / 40; i++) {
      const g = 45 + Math.floor(R() * 55);
      ctx.fillStyle = 'rgba(' + g + ',' + g + ',' + (g + 4) + ',0.5)';
      ctx.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2);
    }
  }

  makeRoadStraightTexture() {
    // 24 m wide x 48 m long. 512 x 1024 pixels
    const W = 512, H = 1024;
    const cv = makeCanvas(W, H);
    const ctx = cv.getContext('2d');
    this._asphalt(ctx, W, H);
    // worn tire tracks in the middle of each lane
    [0.25, 0.75].forEach((f) => {
      const grd = ctx.createLinearGradient(W * f - 50, 0, W * f + 50, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.5, 'rgba(0,0,0,0.20)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(W * f - 50, 0, 100, H);
    });
    // white edge lines, 1 m from the edge, 0.3 m wide
    ctx.fillStyle = '#e8e8e4';
    ctx.fillRect(21 - 3, 0, 6, H);
    ctx.fillRect(W - 21 - 3, 0, 6, H);
    // yellow dashed centre line: 5 m dash, 7 m gap
    ctx.fillStyle = '#f2c230';
    for (let k = 0; k < 4; k++) {
      ctx.fillRect(W / 2 - 3, k * 256 + 70, 6, 107);
    }
    // scuffs over the paint
    const R = this.rand;
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = 'rgba(59,61,66,0.5)';
      ctx.fillRect(R() < 0.33 ? 18 + R() * 6 : (R() < 0.5 ? W - 24 + R() * 6 : W / 2 - 3 + R() * 6), R() * H, 2 + R() * 3, 2 + R() * 6);
    }
    return finishTexture(cv);
  }

  makeRoadCrossTexture() {
    // 24 m x 24 m junction with crosswalks on all four sides. 512 x 512
    const W = 512;
    const cv = makeCanvas(W, W);
    const ctx = cv.getContext('2d');
    this._asphalt(ctx, W, W);
    const per = W / 24;
    ctx.fillStyle = '#ecece8';
    for (let m = -10; m <= 10; m += 1) {
      const c = W / 2 + m * per;
      const sw = 0.5 * per;
      ctx.fillRect(c - sw / 2, 0, sw, 3 * per);
      ctx.fillRect(c - sw / 2, W - 3 * per, sw, 3 * per);
      ctx.fillRect(0, c - sw / 2, 3 * per, sw);
      ctx.fillRect(W - 3 * per, c - sw / 2, 3 * per, sw);
    }
    return finishTexture(cv);
  }

  createRoads() {
    const straightTex = this.makeRoadStraightTexture();
    const crossTex = this.makeRoadCrossTexture();
    const mk = (map) => new THREE.MeshStandardMaterial({
      map, roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    const sg = new GeoBuf();
    const ig = new GeoBuf();
    const white = new THREE.Color(1, 1, 1);
    const Y = 0.02;
    const TILE_LEN = 48;

    const segs = [];
    let start = -WORLD_EDGE;
    ROAD_POS.forEach((p) => {
      segs.push([start, p - ROAD_HALF]);
      start = p + ROAD_HALF;
    });
    segs.push([start, WORLD_EDGE]);

    ROAD_POS.forEach((r) => {
      segs.forEach((s) => {
        const a = s[0], b = s[1];
        const vr = (b - a) / TILE_LEN;
        // road running along z, at x = r
        upQuad(sg, r - ROAD_HALF, a, r + ROAD_HALF, b, Y, [0, 0], [1, 0], [1, vr], [0, vr], white);
        // road running along x, at z = r
        upQuad(sg, a, r - ROAD_HALF, b, r + ROAD_HALF, Y, [0, 0], [0, vr], [1, vr], [1, 0], white);
      });
    });
    ROAD_POS.forEach((px) => {
      ROAD_POS.forEach((pz) => {
        upQuad(ig, px - ROAD_HALF, pz - ROAD_HALF, px + ROAD_HALF, pz + ROAD_HALF, Y,
          [0, 0], [1, 0], [1, 1], [0, 1], white);
      });
    });

    const m1 = new THREE.Mesh(sg.build(), mk(straightTex));
    m1.receiveShadow = true;
    this.scene.add(m1);
    const m2 = new THREE.Mesh(ig.build(), mk(crossTex));
    m2.receiveShadow = true;
    this.scene.add(m2);

    // world edge barriers (visual only)
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0xb8b8b4, roughness: 0.85 });
    [
      { x: 0, z: -998, w: 2000, d: 2 },
      { x: 0, z: 998, w: 2000, d: 2 },
      { x: -998, z: 0, w: 2, d: 2000 },
      { x: 998, z: 0, w: 2, d: 2000 }
    ].forEach((s) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(s.w, 1.4, s.d), barrierMat);
      b.position.set(s.x, 0.7, s.z);
      this.scene.add(b);
    });
  }

  // --------------------------------------------------------------- facades

  makeFacadeTexture(variant) {
    if (variant === 2 || variant >= 4) return this._facadeTexB(variant);
    const R = this.rand;
    const W = 512, H = 512, cw = 128, ch = 128;
    const cv = makeCanvas(W, H);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = variant === 3 ? '#c4c2bc' : '#e6e3dc';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 3000; i++) {
      const g = R() < 0.5 ? 0 : 255;
      ctx.fillStyle = 'rgba(' + g + ',' + g + ',' + g + ',0.05)';
      ctx.fillRect(R() * W, R() * H, 2 + R() * 6, 2 + R() * 6);
    }
    const litP = [0.35, 0.30, 0.22, 0.10][variant];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const x0 = c * cw, y0 = r * ch;
        let ww, wh, wx, wy;
        if (variant === 0) { ww = cw * 0.46; wh = ch * 0.56; wx = x0 + (cw - ww) / 2; wy = y0 + ch * 0.2; }
        else if (variant === 1) { ww = cw * 0.74; wh = ch * 0.5; wx = x0 + (cw - ww) / 2; wy = y0 + ch * 0.24; }
        else if (variant === 2) { ww = cw * 0.94; wh = ch * 0.88; wx = x0 + (cw - ww) / 2; wy = y0 + (ch - wh) / 2; }
        else { ww = cw * 0.36; wh = ch * 0.5; wx = x0 + (cw - ww) / 2; wy = y0 + ch * 0.25; }
        ctx.fillStyle = variant === 2 ? '#59626c' : '#a8a396';
        ctx.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
        const lit = R() < litP;
        const grd = ctx.createLinearGradient(0, wy, 0, wy + wh);
        if (lit) {
          grd.addColorStop(0, '#ffe6a6');
          grd.addColorStop(1, '#e9a845');
        } else {
          grd.addColorStop(0, '#7f9cb8');
          grd.addColorStop(0.5, '#3d546b');
          grd.addColorStop(1, '#1e2b3a');
        }
        ctx.fillStyle = grd;
        ctx.fillRect(wx, wy, ww, wh);
        if (!lit) {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.beginPath();
          ctx.moveTo(wx, wy + wh * 0.6);
          ctx.lineTo(wx + ww * 0.6, wy);
          ctx.lineTo(wx + ww * 0.9, wy);
          ctx.lineTo(wx, wy + wh * 0.9);
          ctx.closePath();
          ctx.fill();
        }
        if (variant === 2) {
          ctx.fillStyle = 'rgba(70,80,90,0.8)';
          ctx.fillRect(wx, wy + wh / 2 - 1.5, ww, 3);
        } else if (ww > 40) {
          ctx.fillStyle = 'rgba(70,70,70,0.7)';
          ctx.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
        }
        if (variant !== 2) {
          ctx.fillStyle = '#f5f3ee';
          ctx.fillRect(wx - 8, wy + wh + 5, ww + 16, 6);
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(wx - 8, wy + wh + 11, ww + 16, 3);
        }
      }
    }
    return finishTexture(cv);
  }

  makeStoreTexture() {
    const R = this.rand;
    const W = 1024, H = 256;
    const cv = makeCanvas(W, H);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#e1dccf';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#5b5a57';
    ctx.fillRect(0, H - 26, W, 26);
    for (let x = 0; x < W; x += 32) {
      ctx.fillStyle = (x / 32) % 2 ? '#f2f2ee' : '#c3c7ce';
      ctx.fillRect(x, 0, 32, 46);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 46, W, 5);
    ctx.fillStyle = '#343a45';
    ctx.fillRect(0, 51, W, 34);
    for (let u = 0; u < 2; u++) {
      const ox = u * 512;
      ctx.fillStyle = '#e9dca8';
      ctx.fillRect(ox + 60 + R() * 30, 60, 160 + R() * 120, 16);
      // shop window
      ctx.fillStyle = '#3a3f48';
      ctx.fillRect(ox + 20, 94, 314, H - 94 - 30);
      const lit = u === 0 ? R() < 0.7 : R() < 0.4;
      const grd = ctx.createLinearGradient(0, 100, 0, H - 36);
      if (lit) { grd.addColorStop(0, '#ffe2a0'); grd.addColorStop(1, '#c98f3a'); }
      else { grd.addColorStop(0, '#6f8aa5'); grd.addColorStop(1, '#202c3a'); }
      ctx.fillStyle = grd;
      ctx.fillRect(ox + 26, 100, 302, H - 36 - 100);
      ctx.fillStyle = 'rgba(58,63,72,0.9)';
      ctx.fillRect(ox + 100, 100, 5, H - 36 - 100);
      ctx.fillRect(ox + 200, 100, 5, H - 36 - 100);
      // door
      ctx.fillStyle = '#3a3f48';
      ctx.fillRect(ox + 356, 90, 120, H - 90 - 26);
      ctx.fillStyle = lit ? '#f0d494' : '#566b82';
      ctx.fillRect(ox + 364, 98, 104, H - 98 - 30);
    }
    const t = finishTexture(cv);
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  // --------------------------------------------------------------- city grid

  generateCityGrid() {
    this.createRoads();
    const R = this.rand;

    const intervals = [];
    for (let i = 0; i < ROAD_POS.length - 1; i++) {
      const left = ROAD_POS[i] + ROAD_HALF;
      const right = ROAD_POS[i + 1] - ROAD_HALF;
      intervals.push({ center: (left + right) / 2, size: right - left });
    }
    const blocks = [];
    intervals.forEach((xInt) => {
      intervals.forEach((zInt) => {
        if (Math.abs(xInt.center) < 1 && Math.abs(zInt.center) < 1) return;
        if (Math.abs(xInt.center) < 1 && Math.abs(zInt.center + 120) < 1) return;
        blocks.push({ x: xInt.center, z: zInt.center, w: xInt.size, d: zInt.size, park: R() < 0.14 });
      });
    });
    this.blocks = blocks;

    // pavement / park plates (top at 0.12)
    const plates = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
      blocks.length
    );
    const dummy = new THREE.Object3D();
    const cPark = new THREE.Color(0x5f9a48);
    blocks.forEach((b, i) => {
      dummy.position.set(b.x, 0.06, b.z);
      dummy.scale.set(b.w, 0.12, b.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      plates.setMatrixAt(i, dummy.matrix);
      const col = b.park ? cPark : new THREE.Color(0xbdbab0).multiplyScalar(0.92 + R() * 0.12);
      plates.setColorAt(i, col);
    });
    plates.instanceMatrix.needsUpdate = true;
    if (plates.instanceColor) plates.instanceColor.needsUpdate = true;
    plates.receiveShadow = true;
    this.scene.add(plates);

    // geometry groups
    const winG = [new GeoBuf(), new GeoBuf(), new GeoBuf(), new GeoBuf(), new GeoBuf(), new GeoBuf(), new GeoBuf(), new GeoBuf()];
    const storeG = new GeoBuf();
    const roofG = new GeoBuf();

    const tintsWarm = [0xf0e6d2, 0xe8d8c0, 0xd9c7b0, 0xe3b9a0, 0xc9d4de, 0xdbe3d0, 0xe9d3c4, 0xd7d9dd].map((h) => new THREE.Color(h));
    const tintsGlass = [0xb7d4ea, 0x9fc3d8, 0xc4d0d8, 0xa7d0c8, 0xd0d8e0].map((h) => new THREE.Color(h));
    const roofColors = [0x8d8d8a, 0x7e7f7c, 0x9b9a95, 0x6f716f].map((h) => new THREE.Color(h));

    const acMatrices = [];
    const tankMatrices = [];
    const antennaMatrices = [];
    const pushMat = (list, x, y, z, sx, sy, sz) => {
      dummy.position.set(x, y, z);
      dummy.scale.set(sx, sy, sz);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      list.push(dummy.matrix.clone());
    };

    blocks.forEach((block) => {
      if (block.park) return;
      const lots = 2;
      const margin = 4;
      const innerW = block.w - margin * 2;
      const innerD = block.d - margin * 2;
      const lotW = innerW / lots;
      const lotD = innerD / lots;
      for (let ix = 0; ix < lots; ix++) {
        for (let iz = 0; iz < lots; iz++) {
          if (R() < 0.2) continue;
          const lcx = block.x - innerW / 2 + lotW * (ix + 0.5);
          const lcz = block.z - innerD / 2 + lotD * (iz + 0.5);
          const maxFp = Math.min(lotW, lotD) - 4;
          const fw = Math.max(9, Math.floor(maxFp * (0.7 + R() * 0.3) / BAY_W) * BAY_W);
          const fd = Math.max(9, Math.floor(maxFp * (0.7 + R() * 0.3) / BAY_W) * BAY_W);
          const bx = lcx + (R() - 0.5) * Math.max(0, lotW - fw - 2);
          const bz = lcz + (R() - 0.5) * Math.max(0, lotD - fd - 2);

          const roll = R();
          let tiers, variants, tintList;
          if (roll < 0.4) {
            tiers = [{ f: 3 + Math.floor(R() * 3), s: 1 }];
            variants = [0, 1, 4, 4, 5, 6, 7, 6];
            tintList = tintsWarm;
          } else if (roll < 0.85) {
            tiers = [{ f: 5 + Math.floor(R() * 4), s: 1 }, { f: 3 + Math.floor(R() * 3), s: 0.7 }];
            variants = [0, 1, 2, 4, 5, 6, 7];
            tintList = tintsWarm;
          } else {
            tiers = [
              { f: 8 + Math.floor(R() * 5), s: 1 },
              { f: 5 + Math.floor(R() * 4), s: 0.78 },
              { f: 3 + Math.floor(R() * 3), s: 0.55 }
            ];
            variants = [2, 2, 3, 5, 7, 1];
            tintList = tintsGlass;
          }
          const variant = variants[Math.floor(R() * variants.length)];
          const tint = this._pickTint(variant, R, tintList);
          const roofCol = roofColors[Math.floor(R() * roofColors.length)];
          const uBase = Math.floor(R() * 4) * 0.25;
          const vOff = Math.floor(R() * 4) * 0.25;

          let prev = { cx: bx, cz: bz, w: fw, d: fd };
          let yCur = Y0;
          let last = null;
          tiers.forEach((t, ti) => {
            let tw = fw, td = fd, cx = bx, cz = bz;
            if (ti > 0) {
              tw = Math.max(6, Math.round(fw * t.s / BAY_W) * BAY_W);
              td = Math.max(6, Math.round(fd * t.s / BAY_W) * BAY_W);
              const mx = Math.max(0, (prev.w - tw) / 2) * 0.7;
              const mz = Math.max(0, (prev.d - td) / 2) * 0.7;
              cx = prev.cx + (R() * 2 - 1) * mx;
              cz = prev.cz + (R() * 2 - 1) * mz;
            }
            const h = t.f * FLOOR_H;
            const ya = yCur;
            const yb = yCur + h;
            if (ti === 0) {
              boxWalls(storeG, cx, cz, tw, td, ya, ya + FLOOR_H, tint, uBase, 0, 12, FLOOR_H);
              if (t.f > 1) boxWalls(winG[variant], cx, cz, tw, td, ya + FLOOR_H, yb, tint, uBase, vOff, 12, FLOOR_H * 4);
            } else {
              boxWalls(winG[variant], cx, cz, tw, td, ya, yb, tint, uBase, vOff, 12, FLOOR_H * 4);
            }
            upQuad(roofG, cx - tw / 2, cz - td / 2, cx + tw / 2, cz + td / 2, yb,
              [0, 0], [1, 0], [1, 1], [0, 1], roofCol);
            this.buildingData.push({ x: cx, y: (ya + yb) / 2, z: cz, w: tw, h: h, d: td });
            prev = { cx, cz, w: tw, d: td };
            last = { cx, cz, w: tw, d: td, top: yb };
            yCur = yb;
          });

          // rooftop equipment on the highest tier
          const L = last;
          const acN = 1 + Math.floor(R() * 3);
          for (let a = 0; a < acN; a++) {
            const aw = 1.5 + R() * 1.5, ah = 0.8 + R() * 0.8, ad = 1.5 + R() * 1.5;
            pushMat(acMatrices, L.cx + (R() - 0.5) * L.w * 0.6, L.top + ah / 2, L.cz + (R() - 0.5) * L.d * 0.6, aw, ah, ad);
          }
          if (R() < 0.3) {
            const tr = 1.2 + R() * 0.8, th = 1.5 + R();
            pushMat(tankMatrices, L.cx + (R() - 0.5) * L.w * 0.4, L.top + th / 2, L.cz + (R() - 0.5) * L.d * 0.4, tr, th, tr);
          }
          if (R() < 0.25) {
            const ah = 3 + R() * 4;
            pushMat(antennaMatrices, L.cx + (R() - 0.5) * L.w * 0.3, L.top + ah / 2, L.cz + (R() - 0.5) * L.d * 0.3, 0.35, ah, 0.35);
          }
        }
      }
    });

    // build meshes
    winG.forEach((g, v) => {
      if (g.empty) return;
      const mat = new THREE.MeshStandardMaterial({
        map: this._facadeTex(v), vertexColors: true,
        roughness: v === 2 ? 0.45 : 0.8, metalness: 0.0
      });
      const m = new THREE.Mesh(g.build(), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    });
    if (!storeG.empty) {
      const m = new THREE.Mesh(storeG.build(), new THREE.MeshStandardMaterial({
        map: this.makeStoreTexture(), vertexColors: true, roughness: 0.75, metalness: 0.0
      }));
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    }
    if (!roofG.empty) {
      const m = new THREE.Mesh(roofG.build(), new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide
      }));
      m.receiveShadow = true;
      this.scene.add(m);
    }

    const inst = (geo, mat, list) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      list.forEach((mx, i) => mesh.setMatrixAt(i, mx));
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
    };
    inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xa8a8a4, roughness: 0.8 }), acMatrices);
    inst(new THREE.CylinderGeometry(1, 1, 1, 10), new THREE.MeshStandardMaterial({ color: 0xb4b4b0, roughness: 0.6, metalness: 0.3 }), tankMatrices);
    inst(new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.5 }), antennaMatrices);
  }

  // ---------------------------------------------------------------- hub

  createCentralGarageHub() {
    const R = this.rand;
    const hubGroup = new THREE.Group();

    // paved yard (flat, 0.03 above the ground)
    const pv = makeCanvas(512, 512);
    const pctx = pv.getContext('2d');
    pctx.fillStyle = '#9a9a96';
    pctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      const g = 110 + Math.floor(R() * 80);
      pctx.fillStyle = 'rgba(' + g + ',' + g + ',' + g + ',0.4)';
      pctx.fillRect(R() * 512, R() * 512, 2, 2);
    }
    pctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let k = 0; k < 4; k++) {
      pctx.fillRect(k * 128 - 1, 0, 3, 512);
      pctx.fillRect(0, k * 128 - 1, 512, 3);
    }
    const yardTex = finishTexture(pv, 100 / 16, 100 / 16);
    const yardMat = new THREE.MeshStandardMaterial({
      map: yardTex, roughness: 0.95,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), yardMat);
    yard.rotation.x = -Math.PI / 2;
    yard.position.set(0, 0.03, 0);
    yard.receiveShadow = true;
    hubGroup.add(yard);

    const driveTex = finishTexture(pv, 24 / 16, 50 / 16);
    const driveway = new THREE.Mesh(new THREE.PlaneGeometry(24, 50),
      new THREE.MeshStandardMaterial({
        map: driveTex, roughness: 0.95,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
      }));
    driveway.rotation.x = -Math.PI / 2;
    driveway.position.set(0, 0.03, -75);
    driveway.receiveShadow = true;
    hubGroup.add(driveway);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe2e5ea, roughness: 0.85 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.6, metalness: 0.5 });
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5 });

    const garage = new THREE.Group();
    const WH = 5;

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(40, WH, 1), wallMat);
    backWall.position.set(0, WH / 2, 20);
    backWall.castShadow = true; backWall.receiveShadow = true;
    garage.add(backWall);
    this.buildingData.push({ x: 0, y: WH / 2, z: 20, w: 40, h: WH, d: 1 });

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1, WH, 40), wallMat);
    leftWall.position.set(-20, WH / 2, 0);
    leftWall.castShadow = true; leftWall.receiveShadow = true;
    garage.add(leftWall);
    this.buildingData.push({ x: -20, y: WH / 2, z: 0, w: 1, h: WH, d: 40 });

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1, WH, 40), wallMat);
    rightWall.position.set(20, WH / 2, 0);
    rightWall.castShadow = true; rightWall.receiveShadow = true;
    garage.add(rightWall);
    this.buildingData.push({ x: 20, y: WH / 2, z: 0, w: 1, h: WH, d: 40 });

    // sign gantry at the front (no roof)
    const postGeo = new THREE.BoxGeometry(0.8, 6, 0.8);
    [-16, 16].forEach((px) => {
      const p = new THREE.Mesh(postGeo, yellowMat);
      p.position.set(px, 3, -20);
      p.castShadow = true;
      garage.add(p);
      this.buildingData.push({ x: px, y: 3, z: -20, w: 0.8, h: 6, d: 0.8 });
    });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(32.8, 0.8, 0.8), yellowMat);
    beam.position.set(0, 6.1, -20);
    beam.castShadow = true;
    garage.add(beam);

    const signCanvas = makeCanvas(512, 128);
    const sctx = signCanvas.getContext('2d');
    sctx.fillStyle = '#ffcc00';
    sctx.fillRect(0, 0, 512, 128);
    sctx.fillStyle = '#111111';
    sctx.font = 'bold 84px Arial, sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText('GARAGE', 256, 66);
    const signTex = finishTexture(signCanvas);
    signTex.wrapS = THREE.ClampToEdgeWrapping;
    signTex.wrapT = THREE.ClampToEdgeWrapping;
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });
    const signFront = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), signMat);
    signFront.position.set(0, 4.2, -20.5);
    signFront.rotation.y = Math.PI;
    garage.add(signFront);
    const signBack = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), signMat);
    signBack.position.set(0, 4.2, -19.5);
    garage.add(signBack);

    // workshop props
    const rack = new THREE.Mesh(new THREE.BoxGeometry(12, 2.5, 0.5), darkMetal);
    rack.position.set(-8, 1.25, 18.5);
    rack.castShadow = true;
    garage.add(rack);
    const toolMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.7, roughness: 0.4 });
    for (let i = 0; i < 6; i++) {
      const tool = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.2 + R() * 0.6, 0.3), toolMat);
      tool.position.set(-13 + i * 1.8, 2.4, 18.1);
      garage.add(tool);
    }
    const barrelGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.4, 12);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x2a6aa8, roughness: 0.7, metalness: 0.3 });
    [[8, 0.7, 16], [10, 0.7, 15], [9, 0.7, 17.5], [12, 0.7, 17]].forEach((p) => {
      const b = new THREE.Mesh(barrelGeo, barrelMat);
      b.position.set(p[0], p[1], p[2]);
      b.castShadow = true;
      garage.add(b);
    });
    const tireGeo = new THREE.TorusGeometry(0.5, 0.25, 8, 16);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 });
    [[14, 0, 12], [14, 0, 13.2], [15.5, 0, 12.5]].forEach((s) => {
      for (let i = 0; i < 4; i++) {
        const t = new THREE.Mesh(tireGeo, tireMat);
        t.rotation.x = Math.PI / 2;
        t.position.set(s[0], 0.25 + i * 0.4, s[2]);
        t.castShadow = true;
        garage.add(t);
      }
    });
    const pumpBody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.8), yellowMat);
    pumpBody.position.set(-14, 1.1, -12);
    pumpBody.castShadow = true;
    garage.add(pumpBody);
    const pumpScreen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0x2a5a8a, emissiveIntensity: 0.7 }));
    pumpScreen.position.set(-14, 1.6, -11.5);
    garage.add(pumpScreen);

    hubGroup.add(garage);
    this.scene.add(hubGroup);
  }

  // ----------------------------------------------------------------- job site

  createJobSite() {
    const R = this.rand;
    const jobX = 0;
    const jobZ = -120;

    // dirt patch under the pile
    const dv = makeCanvas(256, 256);
    const dctx = dv.getContext('2d');
    dctx.fillStyle = '#8a6a48';
    dctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4000; i++) {
      const g = R() < 0.5 ? 60 : 190;
      dctx.fillStyle = 'rgba(' + g + ',' + Math.floor(g * 0.75) + ',' + Math.floor(g * 0.5) + ',0.35)';
      dctx.fillRect(R() * 256, R() * 256, 2 + R() * 3, 2 + R() * 3);
    }
    const dirtTex = finishTexture(dv, 4, 4);
    const patch = new THREE.Mesh(new THREE.CircleGeometry(15, 40),
      new THREE.MeshStandardMaterial({
        map: dirtTex, roughness: 1,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
      }));
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(jobX, 0.04, jobZ);
    patch.receiveShadow = true;
    this.scene.add(patch);
    this.jobPatch = patch;           // moved per job by moveJobSite()

    // dirt pile: cone shape, highest clods are removed first
    this.dirtPileGroup = new THREE.Group();
    this.dirtPileGroup.position.set(jobX, 0, jobZ);
    const clodGeo = new THREE.DodecahedronGeometry(1.2, 0);
    const clodMats = [0x7a5233, 0x6b4a2b, 0x8a6238].map((h) => new THREE.MeshStandardMaterial({ color: h, roughness: 1.0 }));
    const clods = [];
    for (let i = 0; i < 45; i++) {
      const clod = new THREE.Mesh(clodGeo, clodMats[i % 3]);
      const r = Math.sqrt(R()) * 6.5;
      const theta = R() * Math.PI * 2;
      const y = Math.max(0.5, (1 - r / 7.5) * 3.4 + R() * 0.6);
      const s = 0.8 + R() * 0.7;
      clod.position.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
      clod.rotation.set(R() * Math.PI, R() * Math.PI, 0);
      clod.scale.setScalar(s);
      clod.castShadow = true;
      clod.receiveShadow = true;
      clods.push(clod);
    }
    clods.sort((a, b) => a.position.y - b.position.y);
    this._masterClods = clods.slice();
    this.allDirtClods = clods.slice();
    clods.forEach((c) => this.dirtPileGroup.add(c));
    this.scene.add(this.dirtPileGroup);

    // blue truck
    this.truckGroup = new THREE.Group();
    this.truckGroup.position.set(jobX + 15, 0, jobZ);
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x2159e0, roughness: 0.45 });
    const bedMat = new THREE.MeshStandardMaterial({ color: 0x5b6677, roughness: 0.8 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x23364a, roughness: 0.15, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.8 });
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffcc, emissiveIntensity: 1.2 });

    const cab = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), blueMat);
    cab.position.set(0, 3, 4);
    cab.castShadow = true;
    this.truckGroup.add(cab);
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.truckGroup.add(m);
      return m;
    };
    [[4.2, 0.4, 6, 0, 1.4, -1], [0.3, 1.6, 6, -2.05, 2.2, -1], [0.3, 1.6, 6, 2.05, 2.2, -1],
      [4.2, 1.6, 0.3, 0, 2.2, -4], [4.2, 1.6, 0.3, 0, 2.2, 2]].forEach((b) => {
      add(new THREE.BoxGeometry(b[0], b[1], b[2]), bedMat, b[3], b[4], b[5]);
    });
    add(new THREE.BoxGeometry(3.2, 1.5, 0.4), glassMat, 0, 3.7, 6.0);
    add(new THREE.BoxGeometry(0.4, 1.4, 2.2), glassMat, -2.0, 3.7, 4.2);
    add(new THREE.BoxGeometry(0.4, 1.4, 2.2), glassMat, 2.0, 3.7, 4.2);
    add(new THREE.BoxGeometry(4.2, 0.6, 0.6), darkMat, 0, 1.2, 6.2);
    add(new THREE.BoxGeometry(0.8, 0.5, 0.4), lightMat, -1.4, 1.9, 6.05);
    add(new THREE.BoxGeometry(0.8, 0.5, 0.4), lightMat, 1.4, 1.9, 6.05);
    add(new THREE.CylinderGeometry(0.22, 0.22, 4, 10), darkMat, -1.7, 4.0, 1.6);
    const wheelGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.7, 18).rotateZ(Math.PI / 2);
    [[-2.45, 4.5], [2.45, 4.5], [-2.45, 0], [2.45, 0], [-2.45, -2.7], [2.45, -2.7]].forEach((w) => {
      add(wheelGeo, darkMat, w[0], 0.9, w[1]);
    });
    this.scene.add(this.truckGroup);

    this._truckData = [
      { x: jobX + 15, y: 3, z: jobZ + 4, w: 4, h: 4, d: 4, ox: 0, oz: 4 },
      { x: jobX + 15, y: 2, z: jobZ - 1, w: 4.2, h: 2, d: 6, ox: 0, oz: -1 }
    ];
    this._truckData.forEach((d) => this.buildingData.push(d));

    // cones
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.8 });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const baseGeo = new THREE.BoxGeometry(1, 0.3, 1);
    const coneGeo = new THREE.ConeGeometry(0.45, 1.5, 8);
    this.jobCones = [];
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const g = new THREE.Group();
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 0.15;
      g.add(base);
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.y = 1.0;
      cone.castShadow = true;
      g.add(cone);
      g.position.set(jobX + Math.cos(angle) * 12, 0.04, jobZ + Math.sin(angle) * 12);
      g.userData.ox = Math.cos(angle) * 12;
      g.userData.oz = Math.sin(angle) * 12;
      this.scene.add(g);
      this.jobCones.push(g);
    }
  }

  // ------------------------------------------------------------------ traffic

  createOptimizedTraffic() {
    const R = this.rand;
    const carColors = [0xd62d2d, 0x2bb24c, 0x2f6fdd, 0xf2c230, 0xf4f4f4, 0xb0b4ba, 0x333a44, 0xe07b24];
    const bodyGeo = new THREE.BoxGeometry(2, 0.8, 4.5);
    const cabinGeo = new THREE.BoxGeometry(1.8, 0.8, 2.2);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.15, metalness: 0.3 });
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const bodyMats = {};
    const getBody = (c) => bodyMats[c] || (bodyMats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.4 }));

    for (let i = 0; i < 70; i++) {
      const color = carColors[Math.floor(R() * carColors.length)];
      const carGroup = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, getBody(color));
      body.position.y = 0.6;
      body.castShadow = true;
      carGroup.add(body);
      const cabin = new THREE.Mesh(cabinGeo, cabinMat);
      cabin.position.set(0, 1.4, -0.2);
      cabin.castShadow = true;
      carGroup.add(cabin);
      const wheels = [];
      [{ x: -1.0, y: 0.4, z: 1.4 }, { x: 1.0, y: 0.4, z: 1.4 }, { x: -1.0, y: 0.4, z: -1.4 }, { x: 1.0, y: 0.4, z: -1.4 }].forEach((pos) => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(pos.x, pos.y, pos.z);
        wheel.castShadow = true;
        carGroup.add(wheel);
        wheels.push(wheel);
      });

      const isXAxis = R() > 0.5;
      const isPositiveDir = R() > 0.5;
      const laneOffset = isPositiveDir ? 6 : -6;
      const roadPos = ROAD_POS[Math.floor(R() * ROAD_POS.length)];
      const startPos = -290 + R() * 580;
      if (isXAxis) {
        carGroup.position.set(startPos, 0, roadPos + laneOffset);
        carGroup.rotation.y = isPositiveDir ? Math.PI / 2 : -Math.PI / 2;
      } else {
        carGroup.position.set(roadPos + laneOffset, 0, startPos);
        carGroup.rotation.y = isPositiveDir ? Math.PI : 0;
      }
      this.scene.add(carGroup);
      const baseSpeed = 7 + R() * 6;
      this.trafficCars.push({
        mesh: carGroup,
        wheels: wheels,
        isXAxis: isXAxis,
        dir: isPositiveDir ? 1 : -1,
        speed: baseSpeed,
        baseSpeed: baseSpeed,
        roadPos: roadPos,
        laneOffset: laneOffset
      });
    }
  }

  startTrafficAI() {
    const clock = new THREE.Clock();
    const animateTraffic = () => {
      requestAnimationFrame(animateTraffic);
      const dt = Math.min(clock.getDelta(), 0.1);
      const cars = this.trafficCars;
      const n = cars.length;
      for (let i = 0; i < n; i++) {
        const car = cars[i];
        let minGap = Infinity;
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const other = cars[j];
          if (other.roadPos !== car.roadPos) continue;
          if (other.isXAxis !== car.isXAxis) continue;
          if (other.dir !== car.dir) continue;
          if (other.laneOffset !== car.laneOffset) continue;
          let gap;
          if (car.isXAxis) gap = (other.mesh.position.x - car.mesh.position.x) * car.dir;
          else gap = (other.mesh.position.z - car.mesh.position.z) * car.dir;
          if (gap > 0 && gap < minGap) minGap = gap;
        }
        let targetSpeed = car.baseSpeed;
        const safeGap = 9;
        if (minGap < safeGap) targetSpeed = Math.max(0, car.baseSpeed * (minGap / safeGap));
        else if (minGap < 22) targetSpeed = car.baseSpeed * 0.6;
        car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 4);
        if (car.speed < 0) car.speed = 0;
        const move = car.speed * car.dir * dt;
        if (car.isXAxis) {
          car.mesh.position.x += move;
          if (car.dir === 1 && car.mesh.position.x > 300) car.mesh.position.x = -300;
          if (car.dir === -1 && car.mesh.position.x < -300) car.mesh.position.x = 300;
        } else {
          car.mesh.position.z += move;
          if (car.dir === 1 && car.mesh.position.z > 300) car.mesh.position.z = -300;
          if (car.dir === -1 && car.mesh.position.z < -300) car.mesh.position.z = 300;
        }
        const wr = (car.speed * dt) / 0.4;
        for (let w = 0; w < car.wheels.length; w++) car.wheels[w].rotation.x -= wr;
      }
    };
    animateTraffic();
  }

  // -------------------------------------------------------------------- props

  createProps() {
    const R = this.rand;
    const dummy = new THREE.Object3D();
    const setM = (mesh, i, x, y, z, ry, sx, sy, sz) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, ry || 0, 0);
      dummy.scale.set(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    };
    const nearJunction = (t, d) => ROAD_POS.some((p) => Math.abs(t - p) < d);

    // --- street lights ---
    const poleGeo = new THREE.CylinderGeometry(0.16, 0.22, 8, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.7, metalness: 0.5 });
    const lampGeo = new THREE.BoxGeometry(1.6, 0.4, 0.7);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffee88, emissiveIntensity: 0.6 });
    const poles = [];
    const lamps = [];
    ROAD_POS.forEach((rp) => {
      for (let t = -280; t <= 280; t += 40) {
        if (nearJunction(t, 18)) continue;
        [-13, 13].forEach((off) => {
          poles.push({ x: rp + off, z: t });
          lamps.push({ x: rp + off + (off > 0 ? 0.9 : -0.9), z: t });
          poles.push({ x: t, z: rp + off });
          lamps.push({ x: t, z: rp + off + (off > 0 ? 0.9 : -0.9) });
        });
      }
    });
    const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, poles.length);
    poles.forEach((p, i) => setM(poleMesh, i, p.x, 4, p.z));
    poleMesh.castShadow = true;
    this.scene.add(poleMesh);
    const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, lamps.length);
    lamps.forEach((p, i) => setM(lampMesh, i, p.x, 8, p.z));
    this.scene.add(lampMesh);

    // --- traffic light poles ---
    const tlPoleGeo = new THREE.CylinderGeometry(0.15, 0.18, 5, 8);
    const tlPoleMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.8 });
    const tlHeadGeo = new THREE.BoxGeometry(0.5, 1.2, 0.5);
    const tlHeadMat = new THREE.MeshStandardMaterial({ color: 0x15171a, emissive: 0x330000, emissiveIntensity: 0.3 });
    const tl = [];
    ROAD_POS.forEach((ix) => {
      ROAD_POS.forEach((iz) => {
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((s) => tl.push({ x: ix + s[0] * 13.5, z: iz + s[1] * 13.5 }));
      });
    });
    const tlMesh = new THREE.InstancedMesh(tlPoleGeo, tlPoleMat, tl.length);
    tl.forEach((p, i) => setM(tlMesh, i, p.x, 2.5, p.z));
    tlMesh.castShadow = true;
    this.scene.add(tlMesh);
    const tlHead = new THREE.InstancedMesh(tlHeadGeo, tlHeadMat, tl.length);
    tl.forEach((p, i) => setM(tlHead, i, p.x, 5.2, p.z));
    this.scene.add(tlHead);

    // --- benches / bins / hydrants ---
    const benchSeatGeo = new THREE.BoxGeometry(1.8, 0.2, 0.6);
    const benchLegGeo = new THREE.BoxGeometry(0.3, 0.5, 0.6);
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x7a4f26, roughness: 0.9 });
    const binGeo = new THREE.CylinderGeometry(0.35, 0.3, 0.9, 8);
    const binMat = new THREE.MeshStandardMaterial({ color: 0x3a6a3a, roughness: 0.7 });
    const hydrantGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.9, 8);
    const hydrantMat = new THREE.MeshStandardMaterial({ color: 0xd62d2d, roughness: 0.5 });
    const benches = [], bins = [], hydrants = [];
    for (let i = 0; i < 260; i++) {
      const onX = R() < 0.5;
      const rp = ROAD_POS[Math.floor(R() * ROAD_POS.length)];
      const side = R() < 0.5 ? -1 : 1;
      const along = -260 + R() * 520;
      if (nearJunction(along, 20)) continue;
      const x = onX ? along : rp + side * 14;
      const z = onX ? rp + side * 14 : along;
      const r = R();
      if (r < 0.4) benches.push({ x, z, rot: onX ? 0 : Math.PI / 2 });
      else if (r < 0.7) bins.push({ x, z });
      else hydrants.push({ x, z });
    }
    const benchSeat = new THREE.InstancedMesh(benchSeatGeo, benchMat, benches.length);
    benches.forEach((p, i) => setM(benchSeat, i, p.x, 0.6, p.z, p.rot));
    benchSeat.castShadow = true;
    this.scene.add(benchSeat);
    const benchLeg = new THREE.InstancedMesh(benchLegGeo, benchMat, benches.length * 2);
    let li = 0;
    benches.forEach((p) => {
      [-0.7, 0.7].forEach((off) => {
        setM(benchLeg, li++, p.x + Math.cos(p.rot) * off, 0.3, p.z - Math.sin(p.rot) * off, p.rot);
      });
    });
    this.scene.add(benchLeg);
    const binMesh = new THREE.InstancedMesh(binGeo, binMat, bins.length);
    bins.forEach((p, i) => setM(binMesh, i, p.x, 0.45, p.z));
    binMesh.castShadow = true;
    this.scene.add(binMesh);
    const hydMesh = new THREE.InstancedMesh(hydrantGeo, hydrantMat, hydrants.length);
    hydrants.forEach((p, i) => setM(hydMesh, i, p.x, 0.45, p.z));
    hydMesh.castShadow = true;
    this.scene.add(hydMesh);

    // --- trees: street trees + parks ---
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 3, 7);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 1.0 });
    const canopy1Geo = new THREE.IcosahedronGeometry(2.2, 0);
    const canopy2Geo = new THREE.IcosahedronGeometry(1.5, 0);
    const canopyMat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.0 });
    const greens = [0x3f8a2a, 0x4e9c36, 0x62ad48, 0x2f7a2a].map((h) => new THREE.Color(h));
    const trees = [];
    const addTree = (x, z, s) => {
      trees.push({
        x, z, s,
        c1: greens[Math.floor(R() * greens.length)],
        c2: greens[Math.floor(R() * greens.length)]
      });
    };
    ROAD_POS.forEach((rp) => {
      for (let t = -260; t <= 260; t += 40) {
        if (nearJunction(t, 20)) continue;
        [-14.6, 14.6].forEach((off) => {
          addTree(rp + off, t, 0.9 + R() * 0.5);
          addTree(t, rp + off, 0.9 + R() * 0.5);
        });
      }
    });
    this.blocks.forEach((block) => {
      if (!block.park) return;
      const count = 14 + Math.floor(R() * 10);
      for (let i = 0; i < count; i++) {
        addTree(block.x + (R() - 0.5) * (block.w - 8), block.z + (R() - 0.5) * (block.d - 8), 0.8 + R() * 0.8);
      }
    });
    if (trees.length) {
      const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
      const c1Mesh = new THREE.InstancedMesh(canopy1Geo, canopyMat, trees.length);
      const c2Mesh = new THREE.InstancedMesh(canopy2Geo, canopyMat, trees.length);
      trees.forEach((p, i) => {
        setM(trunkMesh, i, p.x, 1.5 * p.s, p.z, 0, p.s, p.s, p.s);
        setM(c1Mesh, i, p.x, 4 * p.s, p.z, 0, p.s, p.s, p.s);
        setM(c2Mesh, i, p.x, 5.6 * p.s, p.z, 0, p.s * 0.9, p.s * 0.9, p.s * 0.9);
        c1Mesh.setColorAt(i, p.c1);
        c2Mesh.setColorAt(i, p.c2);
      });
      [trunkMesh, c1Mesh, c2Mesh].forEach((m) => {
        m.castShadow = true;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        this.scene.add(m);
      });
    }

    // --- parked cars ---
    const pBodyGeo = new THREE.BoxGeometry(2, 0.8, 4.5);
    const pCabinGeo = new THREE.BoxGeometry(1.8, 0.8, 2.2);
    const palette = [0xd62d2d, 0x2bb24c, 0x2f6fdd, 0xf2c230, 0xf4f4f4, 0xb0b4ba, 0x333a44, 0xe07b24];
    const parked = [];
    for (let i = 0; i < 70; i++) {
      const onX = R() < 0.5;
      const rp = ROAD_POS[Math.floor(R() * ROAD_POS.length)];
      const side = R() < 0.5 ? -1 : 1;
      const along = -260 + R() * 520;
      if (nearJunction(along, 20)) continue;
      parked.push({
        x: onX ? along : rp + side * 9,
        z: onX ? rp + side * 9 : along,
        rot: onX ? Math.PI / 2 : 0,
        color: new THREE.Color(palette[Math.floor(R() * palette.length)])
      });
    }
    if (parked.length) {
      const bodyMesh = new THREE.InstancedMesh(pBodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.4 }), parked.length);
      const cabinMesh = new THREE.InstancedMesh(pCabinGeo, new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.15, metalness: 0.3 }), parked.length);
      parked.forEach((p, i) => {
        setM(bodyMesh, i, p.x, 0.6, p.z, p.rot);
        bodyMesh.setColorAt(i, p.color);
        setM(cabinMesh, i, p.x, 1.4, p.z, p.rot);
      });
      bodyMesh.castShadow = true;
      cabinMesh.castShadow = true;
      bodyMesh.instanceMatrix.needsUpdate = true;
      cabinMesh.instanceMatrix.needsUpdate = true;
      if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
      this.scene.add(bodyMesh);
      this.scene.add(cabinMesh);
    }

    // --- far skyline (windowed buildings, fade into the fog) ---
    // solid props: boxes only for physics (one fixed body is made in createPhysicsColliders)
    const pc = this.propColliders;
    poles.forEach((p) => pc.push({ x: p.x, y: 4, z: p.z, w: 0.5, h: 8, d: 0.5 }));
    tl.forEach((p) => pc.push({ x: p.x, y: 2.5, z: p.z, w: 0.5, h: 5, d: 0.5 }));
    benches.forEach((p) => {
      const sw = Math.abs(Math.sin(p.rot)) > 0.5;
      pc.push({ x: p.x, y: 0.4, z: p.z, w: sw ? 0.8 : 1.8, h: 0.8, d: sw ? 1.8 : 0.8 });
    });
    bins.forEach((p) => pc.push({ x: p.x, y: 0.45, z: p.z, w: 0.7, h: 0.9, d: 0.7 }));
    hydrants.forEach((p) => pc.push({ x: p.x, y: 0.45, z: p.z, w: 0.7, h: 0.9, d: 0.7 }));
    trees.forEach((p) => pc.push({ x: p.x, y: 1.5 * p.s, z: p.z, w: 0.8 * p.s, h: 3 * p.s, d: 0.8 * p.s }));
    parked.forEach((p) => {
      const sw = Math.abs(Math.sin(p.rot)) > 0.5;
      pc.push({ x: p.x, y: 1.0, z: p.z, w: sw ? 4.5 : 2, h: 1.6, d: sw ? 2 : 4.5 });
    });

    this.createFarSkyline();
  }

  // Colour choices per facade style (brick, concrete, sandstone, strips, glass).
  _pickTint(variant, R, list) {
    const sets = {
      2: [0xb7d4ea, 0x9fc3d8, 0xa7d0c8, 0xc8dcea, 0xb8c8e8],
      4: [0xffffff, 0xe9c9b6, 0xd8a58c, 0xf0d6c2, 0xc98d70],
      5: [0xffffff, 0xe0e4e8, 0xd9dcc9, 0xe8e0d4],
      6: [0xffffff, 0xf0e0c0, 0xe6c9a0, 0xe8d0c0],
      7: [0xffffff, 0xf4d9a6, 0xc8e0c8, 0xd8c8e8, 0xf0c8c0]
    };
    const s = sets[variant];
    if (s) return new THREE.Color(s[Math.floor(R() * s.length)]);
    return list[Math.floor(R() * list.length)];
  }

  // Extra facade styles. 2 = glass curtain wall, 4 = brick, 5 = concrete + window strips,
  // 6 = sandstone + arches, 7 = vertical glass fins. 4 x 4 cells: one cell = one floor, 3 m wide.
  _facadeTexB(variant) {
    const R = this.rand;
    const W = 512, H = 512, cw = 128, ch = 128;
    const cv = makeCanvas(W, H);
    const ctx = cv.getContext('2d');
    const bases = { 2: '#dfe8ee', 4: '#d8cdc2', 5: '#d2d2cd', 6: '#dcc9a2', 7: '#eceae4' };
    ctx.fillStyle = bases[variant];
    ctx.fillRect(0, 0, W, H);

    if (variant === 4) {
      // bricks: 16 px courses, 2 px mortar, a different shade per brick
      for (let y = 0; y < H; y += 16) {
        const off = (y / 16) % 2 ? 16 : 0;
        for (let x = -32; x < W; x += 32) {
          const k = 0.86 + R() * 0.26;
          ctx.fillStyle = 'rgb(' + Math.round(192 * k) + ',' + Math.round(116 * k) + ',' + Math.round(88 * k) + ')';
          ctx.fillRect(x + off, y, 30, 14);
        }
      }
    } else if (variant === 6) {
      ctx.fillStyle = 'rgba(100,80,40,0.14)';
      for (let y = 0; y < H; y += 32) ctx.fillRect(0, y, W, 2);
    } else {
      for (let i = 0; i < 2500; i++) {
        const g = R() < 0.5 ? 0 : 255;
        ctx.fillStyle = 'rgba(' + g + ',' + g + ',' + g + ',0.05)';
        ctx.fillRect(R() * W, R() * H, 2 + R() * 5, 2 + R() * 5);
      }
    }

    const litP = { 2: 0.06, 4: 0.3, 5: 0.14, 6: 0.28, 7: 0.14 }[variant];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const x0 = c * cw, y0 = r * ch;
        const lit = R() < litP;
        const fillGlass = (x, y, w, h) => {
          const g = ctx.createLinearGradient(0, y, 0, y + h);
          if (lit) { g.addColorStop(0, '#ffe6a6'); g.addColorStop(1, '#e9a845'); }
          else if (variant === 2) { g.addColorStop(0, '#b4dcf5'); g.addColorStop(0.5, '#5b93bf'); g.addColorStop(1, '#2f6591'); }
          else { g.addColorStop(0, '#86a3bd'); g.addColorStop(0.5, '#41586f'); g.addColorStop(1, '#212e3d'); }
          ctx.fillStyle = g;
          ctx.fillRect(x, y, w, h);
        };

        if (variant === 2) {
          const gx = x0 + 3, gy = y0 + 4, gw = cw - 6, gh = ch - 26;
          fillGlass(gx, gy, gw, gh);
          ctx.fillStyle = '#e7eef3';
          ctx.fillRect(x0 + cw / 2 - 2, gy, 4, gh);
          ctx.fillStyle = '#7f98ab';
          ctx.fillRect(x0, y0 + ch - 20, cw, 20);
          if (!lit) {
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.beginPath();
            ctx.moveTo(gx, gy + gh * 0.7);
            ctx.lineTo(gx + gw * 0.55, gy);
            ctx.lineTo(gx + gw * 0.8, gy);
            ctx.lineTo(gx, gy + gh);
            ctx.closePath();
            ctx.fill();
          }
        } else if (variant === 4) {
          const ww = cw * 0.4, wh = ch * 0.62, wx = x0 + (cw - ww) / 2, wy = y0 + ch * 0.18;
          ctx.fillStyle = '#e9e4da';
          ctx.fillRect(wx - 6, wy - 8, ww + 12, wh + 14);
          fillGlass(wx, wy, ww, wh);
          ctx.fillStyle = '#e9e4da';
          ctx.fillRect(wx + ww / 2 - 2, wy, 4, wh);
          ctx.fillRect(wx, wy + wh * 0.4, ww, 3);
          ctx.fillStyle = '#cfc8ba';
          ctx.fillRect(wx - 9, wy + wh + 6, ww + 18, 6);
        } else if (variant === 5) {
          const wy = y0 + ch * 0.18, wh = ch * 0.5;
          fillGlass(x0, wy, cw, wh);
          ctx.fillStyle = '#d7d8d3';
          ctx.fillRect(x0 + cw / 2 - 2, wy, 4, wh);
          ctx.fillStyle = '#c0c0ba';
          ctx.fillRect(x0, wy + wh, cw, 8);
          ctx.fillStyle = 'rgba(0,0,0,0.14)';
          ctx.fillRect(x0, wy + wh + 8, cw, 4);
          ctx.fillStyle = 'rgba(0,0,0,0.10)';
          ctx.fillRect(x0, y0, 2, ch);
        } else if (variant === 6) {
          const ww = cw * 0.42, wh = ch * 0.6, wx = x0 + (cw - ww) / 2, wy = y0 + ch * 0.26;
          const arch = (pad) => {
            ctx.beginPath();
            ctx.arc(wx + ww / 2, wy, ww / 2 + pad, Math.PI, 0);
            ctx.lineTo(wx + ww + pad, wy + wh + pad);
            ctx.lineTo(wx - pad, wy + wh + pad);
            ctx.closePath();
          };
          arch(5);
          ctx.fillStyle = '#b39a6e';
          ctx.fill();
          ctx.save();
          arch(0);
          ctx.clip();
          fillGlass(wx, wy - ww / 2, ww, wh + ww / 2);
          ctx.restore();
          ctx.fillStyle = '#b39a6e';
          ctx.fillRect(wx + ww / 2 - 1.5, wy - ww / 2, 3, wh + ww / 2);
          ctx.fillStyle = '#efe6d2';
          ctx.fillRect(wx - 8, wy + wh + 5, ww + 16, 6);
        } else {
          for (let k = 0; k < 3; k++) {
            const sx = x0 + 11 + k * 38;
            fillGlass(sx, y0 + 8, 26, ch - 44);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(sx, y0 + 8, 3, ch - 44);
          }
          ctx.fillStyle = '#c9c7c0';
          ctx.fillRect(x0, y0 + ch - 24, cw, 24);
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(x0, y0 + ch - 24, cw, 3);
        }
      }
    }
    return finishTexture(cv);
  }

  // One cached window texture per facade variant (shared by city + skyline).
  _facadeTex(v) {
    if (!this._facadeCache) this._facadeCache = [];
    if (!this._facadeCache[v]) this._facadeCache[v] = this.makeFacadeTexture(v);
    return this._facadeCache[v];
  }

  // Far ring of buildings: never on a road, never inside the city square.
  // Merged into 4 window meshes + 1 roof mesh + 1 instanced antenna mesh.
  createFarSkyline() {
    const R = this.rand;
    const G = [new GeoBuf(), new GeoBuf(), new GeoBuf(), new GeoBuf(), new GeoBuf(), new GeoBuf(), new GeoBuf(), new GeoBuf()];
    const roofG = new GeoBuf();
    const warm = [0xf0e6d2, 0xe8d8c0, 0xd9c7b0, 0xe3b9a0, 0xc9d4de, 0xdbe3d0, 0xe9d3c4, 0xd7d9dd].map((h) => new THREE.Color(h));
    const glass = [0xb7d4ea, 0x9fc3d8, 0xc4d0d8, 0xa7d0c8, 0xd0d8e0].map((h) => new THREE.Color(h));
    const roofColors = [0x8d8d8a, 0x7e7f7c, 0x9b9a95, 0x6f716f].map((h) => new THREE.Color(h));
    const dummy = new THREE.Object3D();
    const antennas = [];
    const placed = [];
    const target = 260;
    let tries = 0;

    while (placed.length < target && tries < 14000) {
      tries++;
      const ang = R() * Math.PI * 2;
      const r = 280 + R() * 620;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const w = Math.round((18 + R() * 36) / BAY_W) * BAY_W;
      const d = Math.round((18 + R() * 36) / BAY_W) * BAY_W;
      const hw = w / 2, hd = d / 2;
      // outside the city square
      if (Math.max(Math.abs(x) - hw, Math.abs(z) - hd) < 266) continue;
      // inside the world edge
      if (Math.abs(x) + hw > 975 || Math.abs(z) + hd > 975) continue;
      // not on any road
      let ok = true;
      for (let k = 0; k < ROAD_POS.length; k++) {
        const p = ROAD_POS[k];
        if (Math.abs(x - p) < ROAD_HALF + hw + 3 || Math.abs(z - p) < ROAD_HALF + hd + 3) { ok = false; break; }
      }
      if (!ok) continue;
      // not on another far building
      for (let k = 0; k < placed.length; k++) {
        const o = placed[k];
        if (Math.abs(x - o.x) < hw + o.hw + 6 && Math.abs(z - o.z) < hd + o.hd + 6) { ok = false; break; }
      }
      if (!ok) continue;
      placed.push({ x, z, hw, hd });

      const far = (r - 280) / 620;
      let floors = 4 + Math.floor(R() * 8);
      if (R() < 0.28 + far * 0.25) floors = 14 + Math.floor(R() * (16 + far * 26));
      floors = Math.min(floors, 52);

      const tiers = [];
      if (floors >= 14) {
        const f1 = Math.max(4, Math.round(floors * 0.62));
        const w2 = Math.max(9, Math.round(w * 0.7 / BAY_W) * BAY_W);
        const d2 = Math.max(9, Math.round(d * 0.7 / BAY_W) * BAY_W);
        tiers.push({ w: w, d: d, f: f1 });
        tiers.push({ w: w2, d: d2, f: floors - f1 });
      } else {
        tiers.push({ w: w, d: d, f: floors });
      }

      const pool = floors >= 14 ? [2, 2, 3, 1, 5, 7, 2] : [0, 0, 1, 4, 4, 5, 6, 7, 3];
      const variant = pool[Math.floor(R() * pool.length)];
      const tints = variant === 2 ? glass : warm;
      const tint = this._pickTint(variant, R, tints);
      const roofCol = roofColors[Math.floor(R() * roofColors.length)];
      const uBase = Math.floor(R() * 4) * 0.25;
      const vOff = Math.floor(R() * 4) * 0.25;

      let y = Y0;
      tiers.forEach((t) => {
        const h = t.f * FLOOR_H;
        const yb = y + h;
        boxWalls(G[variant], x, z, t.w, t.d, y, yb, tint, uBase, vOff, 12, FLOOR_H * 4);
        upQuad(roofG, x - t.w / 2, z - t.d / 2, x + t.w / 2, z + t.d / 2, yb,
          [0, 0], [1, 0], [1, 1], [0, 1], roofCol);
        this.buildingData.push({ x: x, y: y + h / 2, z: z, w: t.w, h: h, d: t.d });
        y = yb;
      });

      if (floors >= 20 && R() < 0.5) {
        const ah = 8 + R() * 12;
        dummy.position.set(x, y + ah / 2, z);
        dummy.scale.set(0.7, ah, 0.7);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        antennas.push(dummy.matrix.clone());
      }
    }

    G.forEach((g, v) => {
      if (g.empty) return;
      const mesh = new THREE.Mesh(g.build(), new THREE.MeshStandardMaterial({
        map: this._facadeTex(v), vertexColors: true,
        roughness: v === 2 ? 0.45 : 0.85, metalness: 0.0
      }));
      this.scene.add(mesh);
    });
    if (!roofG.empty) {
      this.scene.add(new THREE.Mesh(roofG.build(), new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide
      })));
    }
    if (antennas.length) {
      const am = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(1, 1, 1, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.5 }),
        antennas.length
      );
      antennas.forEach((mx, i) => am.setMatrixAt(i, mx));
      am.instanceMatrix.needsUpdate = true;
      this.scene.add(am);
    }
    this.farBuildingCount = placed.length;
  }

  // ---------------------------------------------------------- game functions

  shrinkDirtPile() {
    for (let i = 0; i < 15; i++) {
      if (this.allDirtClods.length > 0) {
        this.dirtPileGroup.remove(this.allDirtClods.pop());
      }
    }
  }

  resetDirtPile() {
    this.dirtPileGroup.clear();
    this.allDirtClods = this._masterClods.slice();
    this.allDirtClods.forEach((clod) => this.dirtPileGroup.add(clod));
    this.dirtPileGroup.visible = true;
  }

  addDirtToTruck() {
    this.truckDirtLevel++;
    if (!this._truckDirtMat) {
      this._truckDirtMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1.0 });
      this._truckDirtGeo = new THREE.DodecahedronGeometry(1.5, 0);
    }
    const dirtMesh = new THREE.Mesh(this._truckDirtGeo, this._truckDirtMat);
    dirtMesh.position.set((Math.random() - 0.5) * 1.5, 1.9 + (this.truckDirtLevel * 0.45), -1 + (Math.random() - 0.5) * 2);
    dirtMesh.scale.set(1.5, 1, 1.5);
    dirtMesh.castShadow = true;
    this.truckGroup.add(dirtMesh);
    this.truckDirtMeshes.push(dirtMesh);
  }

  createPhysicsColliders(world, RAPIER) {
    const groundBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
    const groundBody = world.createRigidBody(groundBodyDesc);
    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(1000, 0.1, 1000);
    const propBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    (this.propColliders || []).forEach((p) => {
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(p.w / 2, p.h / 2, p.d / 2).setTranslation(p.x, p.y, p.z).setFriction(0.8).setRestitution(0),
        propBody
      );
    });
    world.createCollider(groundColliderDesc, groundBody);

    this.buildingData.forEach((data) => {
      const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(data.x, data.y, data.z);
      const body = world.createRigidBody(bodyDesc);
      const colliderDesc = RAPIER.ColliderDesc.cuboid(data.w / 2, data.h / 2, data.d / 2);
      const col = world.createCollider(colliderDesc, body);
      // the truck is the only building that moves, so keep its colliders
      if (this._truckData && this._truckData.indexOf(data) >= 0) {
        if (!this._truckColliders) this._truckColliders = [];
        this._truckColliders.push({ col: col, data: data });
      }
    });
  }

  // Move the whole job site (pile, dirt patch, cone ring, truck) to a new place.
  // Used by Jobs/SiteSystem so every job really happens somewhere else.
  moveJobSite(px, pz, tx, tz) {
    if (typeof px !== 'number' || typeof pz !== 'number') return;
    if (typeof tx !== 'number' || typeof tz !== 'number') { tx = px + 15; tz = pz; }

    if (this.dirtPileGroup) this.dirtPileGroup.position.set(px, 0, pz);
    if (this.jobPatch) this.jobPatch.position.set(px, 0.04, pz);
    if (this.jobCones) {
      for (let i = 0; i < this.jobCones.length; i++) {
        const c = this.jobCones[i];
        c.position.set(px + c.userData.ox, 0.04, pz + c.userData.oz);
      }
    }
    if (this.truckGroup) this.truckGroup.position.set(tx, 0, tz);

    if (this._truckData) {
      for (let i = 0; i < this._truckData.length; i++) {
        const d = this._truckData[i];
        d.x = tx + d.ox;
        d.z = tz + d.oz;
      }
    }
    if (this._truckColliders) {
      for (let i = 0; i < this._truckColliders.length; i++) {
        const t = this._truckColliders[i];
        try { t.col.setTranslation({ x: t.data.x, y: t.data.y, z: t.data.z }, true); } catch (e) {}
      }
    }
  }
}
