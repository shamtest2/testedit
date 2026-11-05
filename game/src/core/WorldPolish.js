import * as THREE from 'three';

const PALETTE = {
  greenA: '#6f8f4a',
  greenB: '#5c7a3c',
  dirt: '#8a7550',
  olive: '#4a5a32',
  barrier: '#d8dde3',
  fence: '#8b939c',
  containerA: '#c0573f',
  containerB: '#3f6c8f',
  containerC: '#b8933f',
  crane: '#8b939c',
  concrete: '#9aa0a6',
  dark: '#2a2a2a',
  amber: '#fbbf24'
};

const _v1 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const _s1 = new THREE.Vector3(1, 1, 1);
const _e1 = new THREE.Euler();

export default class WorldPolish {
  constructor(scene, THREE_REF, camera) {
    this.scene = scene;
    this.THREE = THREE_REF || THREE;
    this.camera = camera || null;
    this._group = new THREE.Group();
    this._group.name = 'WorldPolish';
    this.scene.add(this._group);

    this._disposables = [];
    this._canvasTextures = [];
    this._speedLines = null;
    this._speedLineOpacity = 0;
    this._fovBase = this.camera ? this.camera.fov : 60;
    this._fovVel = 0;
    this._fovCur = this._fovBase;
    this._hudCssInjected = false;
    this._speedCssInjected = false;
    this._built = false;
  }

  _track(obj) {
    this._disposables.push(obj);
    return obj;
  }

  _stdMat(color, opts) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.9, metalness: 0.05 }, opts || {}));
    this._track(m);
    return m;
  }

  _basicMat(color, opts) {
    const m = new THREE.MeshBasicMaterial(Object.assign({ color }, opts || {}));
    this._track(m);
    return m;
  }

  _decalMat(map, factor, y) {
    const m = new THREE.MeshBasicMaterial({
      map: map || null,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: factor,
      polygonOffsetUnits: factor,
      side: THREE.DoubleSide
    });
    this._track(m);
    return m;
  }

  _injectHUDCSS() {
    if (this._hudCssInjected || typeof document === 'undefined') return;
    this._hudCssInjected = true;
    const s = document.createElement('style');
    s.id = 'world-polish-hud';
    s.textContent = `
      #speed-box, #speed-val, .hud-speed {
        background: rgba(12,18,30,0.72) !important;
        border: 1px solid rgba(148,163,184,0.3) !important;
        border-radius: 10px !important;
        padding: 6px 14px !important;
        font-size: 18px !important;
        min-height: 18px;
        font-weight: 800 !important;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif !important;
        color: #fbbf24 !important;
        text-shadow: 0 2px 4px rgba(0,0,0,0.85), 0 0 8px rgba(251,191,36,0.35) !important;
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
      }
    `;
    document.head.appendChild(s);
  }

  _injectSpeedLinesCSS() {
    if (this._speedCssInjected || typeof document === 'undefined') return;
    this._speedCssInjected = true;
    const s = document.createElement('style');
    s.id = 'world-polish-speedlines';
    s.textContent = `
      #wp-speedlines {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 8000;
        opacity: 0;
        transition: opacity 0.18s linear;
        background:
          radial-gradient(ellipse at center, rgba(255,255,255,0) 40%, rgba(255,255,255,0.05) 100%),
          repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,0.06) 0deg 1deg, rgba(255,255,255,0) 1deg 6deg);
        mask-image: radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,1) 100%);
        -webkit-mask-image: radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,1) 100%);
        will-change: opacity;
      }
    `;
    document.head.appendChild(s);
    const div = document.createElement('div');
    div.id = 'wp-speedlines';
    document.body.appendChild(div);
    this._speedLines = div;
  }

  _makeCanvasTexture(draw, w, h) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    draw(ctx, w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    this._canvasTextures.push(tex);
    return tex;
  }

  makeSign(text, w, h, bg, fg) {
    const scale = 256;
    const tex = this._makeCanvasTexture((ctx, cw, ch) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = fg;
      ctx.lineWidth = 12;
      ctx.strokeRect(8, 8, cw - 16, ch - 16);
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = String(text).split('|');
      const lineH = ch / (lines.length + 0.5);
      let fontSize = lineH * 0.7;
      ctx.font = `900 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      let maxW = 0;
      for (let i = 0; i < lines.length; i++) {
        maxW = Math.max(maxW, ctx.measureText(lines[i]).width);
      }
      const targetW = cw * 0.88;
      if (maxW > targetW) {
        fontSize *= targetW / maxW;
        ctx.font = `900 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      }
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], cw / 2, ch / 2 + (i - (lines.length - 1) / 2) * lineH);
      }
    }, scale, Math.floor(scale * (h / w)));

    const planeMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    this._track(planeMat);
    const planeGeo = new THREE.PlaneGeometry(w, h);
    this._track(planeGeo);
    const signMesh = new THREE.Mesh(planeGeo, planeMat);
    signMesh.position.y = h / 2 + 2.4;

    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6);
    this._track(poleGeo);
    const poleMat = this._stdMat(0x555555, { metalness: 0.5, roughness: 0.6 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1.2;

    const g = new THREE.Group();
    g.add(pole);
    g.add(signMesh);
    g.userData.isSign = true;
    return g;
  }

  _addSignToScene(text, w, h, bg, fg, x, y, z, rotY) {
    const sign = this.makeSign(text, w, h, bg, fg);
    sign.position.set(x, y || 0, z);
    if (rotY !== undefined) sign.rotation.y = rotY;
    this._group.add(sign);
    return sign;
  }

  _groundTexture() {
    return this._makeCanvasTexture((ctx, cw, ch) => {
      ctx.fillStyle = PALETTE.greenA;
      ctx.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 9000; i++) {
        const x = Math.random() * cw;
        const y = Math.random() * ch;
        const r = 1 + Math.random() * 4;
        const t = Math.random();
        if (t < 0.45) ctx.fillStyle = PALETTE.greenB;
        else if (t < 0.75) ctx.fillStyle = PALETTE.greenA;
        else if (t < 0.9) ctx.fillStyle = PALETTE.dirt;
        else ctx.fillStyle = PALETTE.olive;
        ctx.globalAlpha = 0.4 + Math.random() * 0.4;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 25; i++) {
        const x = Math.random() * cw;
        const y = Math.random() * ch;
        const r = 20 + Math.random() * 50;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(138,117,80,0.35)');
        grad.addColorStop(1, 'rgba(138,117,80,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }, 512, 512);
  }

  _buildGround() {
    const tex = this._groundTexture();
    if (!tex) return;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(60, 60);

    const groundGeo = new THREE.PlaneGeometry(600, 600, 60, 60);
    this._track(groundGeo);

    const colors = new Float32Array(groundGeo.attributes.position.count * 3);
    const pos = groundGeo.attributes.position;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const d = Math.sqrt(x * x + (y + 120) * (y + 120));
      const t = Math.min(1, d / 300);
      c.set(PALETTE.greenA);
      const olive = new THREE.Color(PALETTE.olive);
      c.lerp(olive, t * 0.6);
      const jitter = (Math.random() - 0.5) * 0.08;
      colors[i * 3] = c.r + jitter;
      colors[i * 3 + 1] = c.g + jitter;
      colors[i * 3 + 2] = c.b + jitter;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const groundMat = new THREE.MeshStandardMaterial({
      map: tex,
      vertexColors: true,
      roughness: 1,
      metalness: 0
    });
    this._track(groundMat);

    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.y = -0.02;
    this._group.add(ground);
  }

  _buildSigns() {
    const site = { x: 0, z: -120 };
    this._addSignToScene('DIG SITE', 3.2, 1.2, '#fbbf24', '#1a1a1a', site.x - 8, 0, site.z + 12, 0);
    this._addSignToScene('WATCH FOR|MACHINERY', 3.4, 2.2, '#f59e0b', '#1a1a1a', site.x + 8, 0, site.z + 12, 0);
    this._addSignToScene('GARAGE', 4, 1.4, '#1e3a8a', '#ffffff', 0, 0, 4, Math.PI);
    this._addSignToScene('SPEED|20', 1.6, 1.6, '#ffffff', '#111111', site.x - 14, 0, site.z + 20, 0);
    this._addSignToScene('ROAD WORK|AHEAD', 2, 2, '#f59e0b', '#111111', site.x + 16, 0, site.z + 28, 0);

    const roadNames = ['5TH AVE', 'MAIN ST', 'OAK BLVD', 'PINE ST'];
    const coords = [-240, -160, -80, 80, 160, 240];
    let nameIdx = 0;
    for (let i = 0; i < coords.length; i++) {
      const c = coords[i];
      const bg = i % 2 === 0 ? '#1e5a3a' : '#1e3a8a';
      this._addSignToScene(roadNames[nameIdx % roadNames.length], 3.2, 0.9, bg, '#ffffff', c + 5, 0, -120, Math.PI / 2);
      nameIdx++;
      this._addSignToScene(roadNames[nameIdx % roadNames.length], 3.2, 0.9, bg, '#ffffff', -120, 0, c + 5, 0);
      nameIdx++;
    }
  }

  _buildJobSiteProps() {
    const site = new THREE.Vector3(0, 0, -120);

    const barrierGeo = new THREE.BoxGeometry(3.2, 0.9, 0.45);
    this._track(barrierGeo);
    const barrierMat = this._stdMat(PALETTE.barrier);
    const barrierCount = 14;
    const barriers = new THREE.InstancedMesh(barrierGeo, barrierMat, barrierCount);
    barriers.castShadow = barriers.receiveShadow = true;
    this._track(barriers);
    const barrierPositions = [];
    for (let i = 0; i < barrierCount; i++) {
      const angle = (i / barrierCount) * Math.PI * 2;
      const radius = 16;
      const x = site.x + Math.cos(angle) * radius;
      const z = site.z + Math.sin(angle) * radius;
      barrierPositions.push({ x, z, rot: -angle });
    }
    for (let i = 0; i < barrierPositions.length; i++) {
      const b = barrierPositions[i];
      _e1.set(0, b.rot, 0);
      _q1.setFromEuler(_e1);
      _v1.set(b.x, 0.45, b.z);
      _m1.compose(_v1, _q1, _s1);
      barriers.setMatrixAt(i, _m1);
    }
    barriers.instanceMatrix.needsUpdate = true;
    this._group.add(barriers);

    const fenceGeo = new THREE.BoxGeometry(4, 2, 0.08);
    this._track(fenceGeo);
    const fenceMat = new THREE.MeshStandardMaterial({
      color: PALETTE.fence,
      roughness: 0.7,
      transparent: true,
      opacity: 0.55,
      wireframe: true
    });
    this._track(fenceMat);
    const fenceCount = 20;
    const fences = new THREE.InstancedMesh(fenceGeo, fenceMat, fenceCount);
    this._track(fences);
    for (let i = 0; i < fenceCount; i++) {
      const angle = (i / fenceCount) * Math.PI * 2;
      const radius = 22;
      const x = site.x + Math.cos(angle) * radius;
      const z = site.z + Math.sin(angle) * radius;
      _e1.set(0, -angle + Math.PI / 2, 0);
      _q1.setFromEuler(_e1);
      _v1.set(x, 1, z);
      _m1.compose(_v1, _q1, _s1);
      fences.setMatrixAt(i, _m1);
    }
    fences.instanceMatrix.needsUpdate = true;
    this._group.add(fences);

    const containerGeo = new THREE.BoxGeometry(6, 2.6, 2.4);
    this._track(containerGeo);
    const containerMats = [
      this._stdMat(PALETTE.containerA),
      this._stdMat(PALETTE.containerB),
      this._stdMat(PALETTE.containerC)
    ];
    const containerData = [
      { x: -18, z: -100, ry: 0.2, mi: 0 },
      { x: 18, z: -108, ry: -0.3, mi: 1 },
      { x: -20, z: -135, ry: 0.4, mi: 2 },
      { x: 22, z: -140, ry: -0.15, mi: 0 }
    ];
    for (let i = 0; i < containerData.length; i++) {
      const cd = containerData[i];
      const m = new THREE.Mesh(containerGeo, containerMats[cd.mi]);
      m.position.set(cd.x, 1.3, cd.z);
      m.rotation.y = cd.ry;
      m.castShadow = m.receiveShadow = true;
      this._group.add(m);
    }

    const scaffoldGeo = new THREE.BoxGeometry(0.1, 4, 0.1);
    this._track(scaffoldGeo);
    const scaffoldMat = this._stdMat(0x9a8c3a, { metalness: 0.6, roughness: 0.5 });
    const scaffoldCount = 16;
    const scaffolds = new THREE.InstancedMesh(scaffoldGeo, scaffoldMat, scaffoldCount);
    this._track(scaffolds);
    let si = 0;
    const scaffBuildings = [
      { x: -40, z: -60 },
      { x: 40, z: -80 }
    ];
    for (let b = 0; b < scaffBuildings.length; b++) {
      const bs = scaffBuildings[b];
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 2; j++) {
          _v1.set(bs.x + j * 3 - 1.5, 2, bs.z + i * 3 - 4.5);
          _q1.identity();
          _m1.compose(_v1, _q1, _s1);
          scaffolds.setMatrixAt(si++, _m1);
        }
      }
    }
    scaffolds.count = si;
    scaffolds.instanceMatrix.needsUpdate = true;
    this._group.add(scaffolds);

    const craneMat = this._stdMat(PALETTE.crane, { metalness: 0.6, roughness: 0.5 });
    const craneGroup = new THREE.Group();
    const mastGeo = new THREE.BoxGeometry(0.8, 30, 0.8);
    this._track(mastGeo);
    const mast = new THREE.Mesh(mastGeo, craneMat);
    mast.position.y = 15;
    craneGroup.add(mast);
    const jibGeo = new THREE.BoxGeometry(24, 0.6, 0.6);
    this._track(jibGeo);
    const jib = new THREE.Mesh(jibGeo, craneMat);
    jib.position.set(8, 30, 0);
    craneGroup.add(jib);
    const counterJibGeo = new THREE.BoxGeometry(8, 0.6, 0.6);
    this._track(counterJibGeo);
    const counterJib = new THREE.Mesh(counterJibGeo, craneMat);
    counterJib.position.set(-5, 30, 0);
    craneGroup.add(counterJib);
    craneGroup.position.set(-60, 0, -180);
    this._group.add(craneGroup);
  }

  _buildRoadDecals() {
    const manholeGeo = new THREE.CircleGeometry(0.7, 12);
    this._track(manholeGeo);
    const manholeMat = new THREE.MeshStandardMaterial({
      color: PALETTE.dark,
      roughness: 0.8,
      metalness: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    this._track(manholeMat);
    const manholeCount = 12;
    const manholes = new THREE.InstancedMesh(manholeGeo, manholeMat, manholeCount);
    this._track(manholes);
    for (let i = 0; i < manholeCount; i++) {
      const x = (Math.random() - 0.5) * 400;
      const z = (Math.random() - 0.5) * 400;
      _v1.set(x, 0.02, z);
      _q1.setFromAxisAngle(_v1.clone().set(1, 0, 0), -Math.PI / 2);
      _m1.compose(_v1, _q1, _s1);
      manholes.setMatrixAt(i, _m1);
    }
    manholes.instanceMatrix.needsUpdate = true;
    this._group.add(manholes);

    const crackGeo = new THREE.PlaneGeometry(2.5, 2.5);
    this._track(crackGeo);
    const crackMat = this._decalMat(null, -2);
    crackMat.color.setHex(0x1a1a1a);
    crackMat.opacity = 0.45;
    const crackCount = 20;
    const cracks = new THREE.InstancedMesh(crackGeo, crackMat, crackCount);
    this._track(cracks);
    for (let i = 0; i < crackCount; i++) {
      const x = (Math.random() - 0.5) * 400;
      const z = (Math.random() - 0.5) * 400;
      _v1.set(x, 0.03, z);
      _e1.set(-Math.PI / 2, 0, Math.random() * Math.PI);
      _q1.setFromEuler(_e1);
      _m1.compose(_v1, _q1, _s1);
      cracks.setMatrixAt(i, _m1);
    }
    cracks.instanceMatrix.needsUpdate = true;
    this._group.add(cracks);

    const patchGeo = new THREE.PlaneGeometry(3, 2);
    this._track(patchGeo);
    const patchMat = this._decalMat(null, -3);
    patchMat.color.setHex(0x2a2a2a);
    patchMat.opacity = 0.5;
    const patchCount = 14;
    const patches = new THREE.InstancedMesh(patchGeo, patchMat, patchCount);
    this._track(patches);
    for (let i = 0; i < patchCount; i++) {
      const x = (Math.random() - 0.5) * 380;
      const z = (Math.random() - 0.5) * 380;
      _v1.set(x, 0.04, z);
      _e1.set(-Math.PI / 2, 0, Math.random() * Math.PI);
      _q1.setFromEuler(_e1);
      _m1.compose(_v1, _q1, _s1);
      patches.setMatrixAt(i, _m1);
    }
    patches.instanceMatrix.needsUpdate = true;
    this._group.add(patches);

    const arrowGeo = new THREE.PlaneGeometry(1.2, 2.5);
    this._track(arrowGeo);
    const arrowMat = this._decalMat(null, -4);
    arrowMat.color.setHex(0xffffff);
    arrowMat.opacity = 0.8;
    const arrowCount = 24;
    const arrows = new THREE.InstancedMesh(arrowGeo, arrowMat, arrowCount);
    this._track(arrows);
    for (let i = 0; i < arrowCount; i++) {
      const x = (Math.random() - 0.5) * 300;
      const z = (Math.random() - 0.5) * 300;
      _v1.set(x, 0.05, z);
      _e1.set(-Math.PI / 2, 0, Math.random() < 0.5 ? 0 : Math.PI);
      _q1.setFromEuler(_e1);
      _m1.compose(_v1, _q1, _s1);
      arrows.setMatrixAt(i, _m1);
    }
    arrows.instanceMatrix.needsUpdate = true;
    this._group.add(arrows);

    const crosswalkGeo = new THREE.PlaneGeometry(0.5, 3);
    this._track(crosswalkGeo);
    const crosswalkMat = this._decalMat(null, -5);
    crosswalkMat.color.setHex(0xeeeeee);
    crosswalkMat.opacity = 0.6;
    const crosswalkCount = 10;
    const crosswalks = new THREE.InstancedMesh(crosswalkGeo, crosswalkMat, crosswalkCount);
    this._track(crosswalks);
    const cwPositions = [-240, -160, -80, 80, 160];
    for (let i = 0; i < cwPositions.length; i++) {
      const baseX = cwPositions[i];
      for (let j = 0; j < 5; j++) {
        const x = baseX + (j - 2) * 1.2;
        _v1.set(x, 0.055, -100);
        _e1.set(-Math.PI / 2, 0, 0);
        _q1.setFromEuler(_e1);
        _m1.compose(_v1, _q1, _s1);
        crosswalks.setMatrixAt(i * 2 + (j < 2 ? 0 : 1), _m1);
      }
    }
    crosswalks.count = crosswalkCount;
    crosswalks.instanceMatrix.needsUpdate = true;
    this._group.add(crosswalks);

    const planterGeo = new THREE.BoxGeometry(1.2, 0.6, 1.2);
    this._track(planterGeo);
    const planterMat = this._stdMat(PALETTE.concrete);
    const plantCount = 12;
    const planters = new THREE.InstancedMesh(planterGeo, planterMat, plantCount);
    this._track(planters);
    const plantGreens = this._stdMat(PALETTE.greenB);
    const plantGeo = new THREE.ConeGeometry(0.4, 0.9, 6);
    this._track(plantGeo);
    const plants = new THREE.InstancedMesh(plantGeo, plantGreens, plantCount);
    this._track(plants);
    for (let i = 0; i < plantCount; i++) {
      const x = (Math.random() - 0.5) * 300;
      const z = (Math.random() - 0.5) * 300 + 20;
      _v1.set(x, 0.3, z);
      _q1.identity();
      _m1.compose(_v1, _q1, _s1);
      planters.setMatrixAt(i, _m1);
      _v1.set(x, 1.0, z);
      _m1.compose(_v1, _q1, _s1);
      plants.setMatrixAt(i, _m1);
    }
    planters.instanceMatrix.needsUpdate = true;
    plants.instanceMatrix.needsUpdate = true;
    this._group.add(planters);
    this._group.add(plants);

    const busGeo = new THREE.BoxGeometry(3, 2.5, 1.5);
    this._track(busGeo);
    const busMat = new THREE.MeshStandardMaterial({
      color: 0x3f6c8f,
      roughness: 0.7,
      transparent: true,
      opacity: 0.6
    });
    this._track(busMat);
    const busData = [
      { x: -100, z: 40 },
      { x: 100, z: -40 }
    ];
    for (let i = 0; i < busData.length; i++) {
      const bs = busData[i];
      const m = new THREE.Mesh(busGeo, busMat);
      m.position.set(bs.x, 1.25, bs.z);
      m.castShadow = true;
      this._group.add(m);
    }
  }

  build() {
    if (this._built) return;
    this._built = true;
    this._injectHUDCSS();
    this._injectSpeedLinesCSS();
    this._buildGround();
    this._buildSigns();
    this._buildJobSiteProps();
    this._buildRoadDecals();
  }

  update(dt, speedKmh) {
    if (dt <= 0) dt = 0.0001;
    const speed = Math.max(0, speedKmh || 0);

    if (this.camera) {
      const target = speed > 45 ? this._fovBase + 8 : this._fovBase + (speed / 45) * 8;
      const k = 8.0;
      const c = 2 * Math.sqrt(k);
      const x = this._fovCur - target;
      const a = -k * x - c * this._fovVel;
      this._fovVel += a * dt;
      this._fovCur += this._fovVel * dt;
      if (Math.abs(this._fovCur - this._fovBase) < 0.01 && speed < 0.5) {
        this._fovCur = this._fovBase;
        this._fovVel = 0;
      }
      this.camera.fov = this._fovCur;
      this.camera.updateProjectionMatrix();
    }

    if (this._speedLines) {
      const want = speed > 30 ? Math.min(0.32, (speed - 30) / 80) : 0;
      this._speedLineOpacity += (want - this._speedLineOpacity) * Math.min(1, dt * 6);
      if (this._speedLineOpacity < 0.005) this._speedLineOpacity = 0;
      this._speedLines.style.opacity = String(this._speedLineOpacity);
    }
  }

  dispose() {
    if (this._group && this._group.parent) {
      this._group.parent.remove(this._group);
    }
    for (let i = 0; i < this._disposables.length; i++) {
      const d = this._disposables[i];
      if (d && d.dispose) { try { d.dispose(); } catch (e) {} }
    }
    this._disposables.length = 0;
    for (let i = 0; i < this._canvasTextures.length; i++) {
      try { this._canvasTextures[i].dispose(); } catch (e) {}
    }
    this._canvasTextures.length = 0;
    if (this._speedLines && this._speedLines.parentNode) {
      this._speedLines.parentNode.removeChild(this._speedLines);
    }
    this._speedLines = null;
    const css1 = document.getElementById('world-polish-hud');
    if (css1 && css1.parentNode) css1.parentNode.removeChild(css1);
    const css2 = document.getElementById('world-polish-speedlines');
    if (css2 && css2.parentNode) css2.parentNode.removeChild(css2);
    this._hudCssInjected = false;
    this._speedCssInjected = false;
    this._built = false;
  }
}
