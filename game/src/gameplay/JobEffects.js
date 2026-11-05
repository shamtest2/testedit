import * as THREE from 'three';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export default class JobEffects {
  constructor(scene, camera, world, vehicle) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.vehicle = vehicle;

    this._injectCSS();

    this._particleCount = 20;
    this._dustGeo = new THREE.BufferGeometry();
    this._dustPositions = new Float32Array(this._particleCount * 3);
    this._dustGeo.setAttribute('position', new THREE.BufferAttribute(this._dustPositions, 3));
    this._dustMat = new THREE.PointsMaterial({
      color: 0x9c7a4a,
      size: 0.18,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    this._dustPoints = new THREE.Points(this._dustGeo, this._dustMat);
    this._dustPoints.frustumCulled = false;
    this.scene.add(this._dustPoints);

    this._dustAlive = new Float32Array(this._particleCount);
    this._dustVel = new Float32Array(this._particleCount * 3);
    this._dustLife = new Float32Array(this._particleCount);
    this._dustMaxLife = new Float32Array(this._particleCount);

    this._chunkCount = 12;
    this._chunkMeshes = [];
    this._chunkGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    this._chunkMats = [];
    for (let i = 0; i < this._chunkCount; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x7a5c36, roughness: 1 });
      this._chunkMats.push(mat);
      const m = new THREE.Mesh(this._chunkGeo, mat);
      m.visible = false;
      m.castShadow = true;
      this.scene.add(m);
      this._chunkMeshes.push(m);
    }
    this._chunkT = new Float32Array(this._chunkCount);
    this._chunkDur = new Float32Array(this._chunkCount);
    this._chunkStart = [];
    this._chunkEnd = [];
    for (let i = 0; i < this._chunkCount; i++) {
      this._chunkStart.push(new THREE.Vector3());
      this._chunkEnd.push(new THREE.Vector3());
    }
    this._chunkActive = new Uint8Array(this._chunkCount);

    this._shakeTime = 0;
    this._shakeDur = 0;
    this._shakeAmp = 0;
    this._shakeOrigin = new THREE.Vector3();
    this._shakeApplied = false;

    this._bounceTime = 0;
    this._bounceDur = 0;
    this._bounceStartY = 0;
    this._bounceActive = false;

    this._coinValue = 0;
    this._coinTarget = 0;
    this._coinEl = null;
    this._coinT = 0;

    this._popups = [];
    this._popupPool = [];

    this._banner = null;
    this._bannerCoinEl = null;
    this._bannerCoinValue = 0;
    this._bannerCoinTarget = 0;
    this._bannerCoinT = 0;

    this._tmpHtml = null;

    this._createCoinCounter();
  }

  _injectCSS() {
    if (document.getElementById('job-effects-css')) return;
    const style = document.createElement('style');
    style.id = 'job-effects-css';
    style.textContent = `
      .je-popup {
        position: fixed;
        pointer-events: none;
        font-family: system-ui, -apple-system, sans-serif;
        font-weight: 800;
        font-size: 26px;
        color: #ffd54a;
        text-shadow: 0 2px 6px rgba(0,0,0,0.65), 0 0 12px rgba(255,200,50,0.5);
        transform: translate(-50%, -50%);
        opacity: 1;
        z-index: 9998;
        white-space: nowrap;
      }
      .je-banner {
        position: fixed;
        left: 50%;
        top: 42%;
        transform: translate(-50%, -50%);
        background: linear-gradient(160deg, rgba(30,26,18,0.96), rgba(55,42,20,0.96));
        border: 2px solid #ffcf4d;
        border-radius: 16px;
        padding: 22px 38px 26px;
        text-align: center;
        font-family: system-ui, -apple-system, sans-serif;
        color: #fff;
        z-index: 10000;
        box-shadow: 0 10px 40px rgba(0,0,0,0.55), 0 0 30px rgba(255,200,50,0.25);
        pointer-events: auto;
      }
      .je-banner h1 {
        margin: 0 0 10px;
        font-size: 34px;
        letter-spacing: 3px;
        color: #ffd54a;
        text-shadow: 0 2px 8px rgba(255,180,0,0.45);
      }
      .je-banner .je-coins {
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 18px;
        color: #ffe9a8;
      }
      .je-banner button {
        font-family: inherit;
        font-size: 17px;
        font-weight: 700;
        padding: 10px 26px;
        border-radius: 10px;
        border: none;
        background: #ffcf4d;
        color: #3a2c0a;
        cursor: pointer;
        transition: transform 0.12s, background 0.12s;
      }
      .je-banner button:hover {
        background: #ffe17a;
        transform: scale(1.05);
      }
      .je-banner button:active {
        transform: scale(0.97);
      }
      .je-counter {
        position: fixed;
        left: 18px;
        bottom: 18px;
        font-family: system-ui, -apple-system, sans-serif;
        font-weight: 800;
        font-size: 20px;
        color: #ffd54a;
        background: rgba(20,16,8,0.75);
        border: 1px solid rgba(255,210,80,0.5);
        border-radius: 10px;
        padding: 8px 16px;
        z-index: 9997;
        text-shadow: 0 1px 3px rgba(0,0,0,0.6);
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  _createCoinCounter() {
    if (this._coinEl) return;
    this._coinEl = document.createElement('div');
    this._coinEl.className = 'je-counter';
    this._coinEl.textContent = '🪙 0';
    document.body.appendChild(this._coinEl);
  }

  _getPopup() {
    if (this._popupPool.length > 0) {
      const el = this._popupPool.pop();
      el.style.display = 'block';
      el.style.opacity = '1';
      return el;
    }
    const el = document.createElement('div');
    el.className = 'je-popup';
    document.body.appendChild(el);
    return el;
  }

  _releasePopup(el) {
    el.style.display = 'none';
    if (this._popupPool.length < 16) this._popupPool.push(el);
    else if (el.parentNode) el.parentNode.removeChild(el);
  }

  onScoop(worldPosition) {
    if (!worldPosition) return;
    for (let i = 0; i < this._particleCount; i++) {
      this._dustAlive[i] = 1;
      const i3 = i * 3;
      this._dustPositions[i3] = worldPosition.x + (Math.random() - 0.5) * 0.6;
      this._dustPositions[i3 + 1] = worldPosition.y + Math.random() * 0.3;
      this._dustPositions[i3 + 2] = worldPosition.z + (Math.random() - 0.5) * 0.6;
      this._dustVel[i3] = (Math.random() - 0.5) * 2.2;
      this._dustVel[i3 + 1] = Math.random() * 2.8 + 0.6;
      this._dustVel[i3 + 2] = (Math.random() - 0.5) * 2.2;
      const life = 0.6 + Math.random() * 0.5;
      this._dustLife[i] = life;
      this._dustMaxLife[i] = life;
    }
    this._dustGeo.attributes.position.needsUpdate = true;

    this._shakeTime = 0.15;
    this._shakeDur = 0.15;
    this._shakeAmp = 0.12;
    if (this.camera) {
      this._shakeOrigin.copy(this.camera.position);
      this._shakeApplied = false;
    }
  }

  onDump(truckPosition, bucketPosition) {
    if (!truckPosition || !bucketPosition) return;
    for (let i = 0; i < this._chunkCount; i++) {
      this._chunkActive[i] = 1;
      this._chunkT[i] = 0;
      this._chunkDur[i] = 0.55 + Math.random() * 0.25;
      this._chunkStart[i].copy(bucketPosition);
      this._chunkEnd[i].copy(truckPosition);
      this._chunkEnd[i].x += (Math.random() - 0.5) * 0.8;
      this._chunkEnd[i].y += 0.15 + Math.random() * 0.2;
      this._chunkEnd[i].z += (Math.random() - 0.5) * 0.8;
      const m = this._chunkMeshes[i];
      m.visible = true;
      m.position.copy(bucketPosition);
      m.scale.setScalar(1);
      this._chunkMats[i].opacity = 1;
      this._chunkMats[i].transparent = false;
    }

    if (this.world && this.world.truckGroup) {
      this._bounceStartY = this.world.truckGroup.position.y;
      this._bounceTime = 0;
      this._bounceDur = 0.15;
      this._bounceActive = true;
    }

    this.showCoins(10);
  }

  showCoins(amount) {
    if (!amount || amount <= 0) return;
    this._coinTarget += amount;
    if (this._coinEl) {
      this._coinT = 0.9;
    }

    if (this.camera) {
      _v1.set(0, 0, 0).applyMatrix4(this.camera.matrixWorld);
      _v1.y += 1.1;
      _v1.project(this.camera);
      const sx = (_v1.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-_v1.y * 0.5 + 0.5) * window.innerHeight;
      const el = this._getPopup();
      el.textContent = '+' + amount;
      el.style.left = sx + 'px';
      el.style.top = sy + 'px';
      el.style.opacity = '1';
      this._popups.push({ el, t: 0, dur: 1.3, x: sx, y: sy });
    }
  }

  showJobComplete(totalCoins, onNext) {
    if (this._banner) {
      if (this._banner.parentNode) this._banner.parentNode.removeChild(this._banner);
      this._banner = null;
    }
    const banner = document.createElement('div');
    banner.className = 'je-banner';
    const h = document.createElement('h1');
    h.textContent = 'JOB COMPLETE';
    banner.appendChild(h);
    const coins = document.createElement('div');
    coins.className = 'je-coins';
    banner.appendChild(coins);
    const btn = document.createElement('button');
    btn.textContent = 'Next job';
    btn.addEventListener('click', () => {
      if (typeof onNext === 'function') onNext();
      if (banner.parentNode) banner.parentNode.removeChild(banner);
      if (this._banner === banner) this._banner = null;
    });
    banner.appendChild(btn);
    document.body.appendChild(banner);
    this._banner = banner;
    this._bannerCoinEl = coins;
    this._bannerCoinValue = 0;
    this._bannerCoinTarget = totalCoins || 0;
    this._bannerCoinT = 0;
    coins.textContent = '🪙 0';
  }

  update(dt) {
    if (dt <= 0) return;

    let dustDirty = false;
    for (let i = 0; i < this._particleCount; i++) {
      if (!this._dustAlive[i]) continue;
      this._dustLife[i] -= dt;
      if (this._dustLife[i] <= 0) {
        this._dustAlive[i] = 0;
        const i3 = i * 3;
        this._dustPositions[i3 + 1] = -9999;
        dustDirty = true;
        continue;
      }
      const i3 = i * 3;
      this._dustVel[i3 + 1] -= 6 * dt;
      this._dustPositions[i3] += this._dustVel[i3] * dt;
      this._dustPositions[i3 + 1] += this._dustVel[i3 + 1] * dt;
      this._dustPositions[i3 + 2] += this._dustVel[i3 + 2] * dt;
      dustDirty = true;
    }
    if (dustDirty) {
      this._dustGeo.attributes.position.needsUpdate = true;
      let maxLife = 0;
      let avgLife = 0;
      let count = 0;
      for (let i = 0; i < this._particleCount; i++) {
        if (this._dustAlive[i]) {
          avgLife += this._dustLife[i] / this._dustMaxLife[i];
          count++;
        }
      }
      if (count > 0) {
        avgLife /= count;
        this._dustMat.opacity = 0.9 * avgLife;
        this._dustMat.size = 0.18 * (0.5 + avgLife * 0.5);
      } else {
        this._dustMat.opacity = 0;
      }
    }

    for (let i = 0; i < this._chunkCount; i++) {
      if (!this._chunkActive[i]) continue;
      this._chunkT[i] += dt;
      const p = Math.min(1, this._chunkT[i] / this._chunkDur[i]);
      const s = this._chunkStart[i];
      const e = this._chunkEnd[i];
      const m = this._chunkMeshes[i];
      const inv = 1 - p;
      m.position.x = s.x * inv + e.x * p;
      m.position.z = s.z * inv + e.z * p;
      m.position.y = s.y * inv + e.y * p + Math.sin(p * Math.PI) * 1.4;
      m.rotation.x += dt * 8;
      m.rotation.z += dt * 6;
      if (p >= 1) {
        this._chunkActive[i] = 0;
        m.visible = false;
      }
    }

    if (this._shakeTime > 0) {
      this._shakeTime -= dt;
      if (this.camera) {
        if (!this._shakeApplied) {
          this._shakeOrigin.copy(this.camera.position);
          this._shakeApplied = true;
        }
        const k = Math.max(0, this._shakeTime / this._shakeDur);
        const amp = this._shakeAmp * k;
        this.camera.position.x = this._shakeOrigin.x + (Math.random() - 0.5) * amp * 2;
        this.camera.position.y = this._shakeOrigin.y + (Math.random() - 0.5) * amp * 2;
        this.camera.position.z = this._shakeOrigin.z + (Math.random() - 0.5) * amp * 2;
        if (this._shakeTime <= 0) {
          this.camera.position.copy(this._shakeOrigin);
        }
      }
    }

    if (this._bounceActive && this.world && this.world.truckGroup) {
      this._bounceTime += dt;
      const p = Math.min(1, this._bounceTime / this._bounceDur);
      const h = Math.sin(p * Math.PI) * 0.15;
      this.world.truckGroup.position.y = this._bounceStartY + h;
      if (p >= 1) {
        this.world.truckGroup.position.y = this._bounceStartY;
        this._bounceActive = false;
      }
    }

    if (this._coinT > 0) {
      this._coinT -= dt;
      if (this._coinEl) {
        this._coinValue += (this._coinTarget - this._coinValue) * Math.min(1, dt * 10);
        this._coinEl.textContent = '🪙 ' + Math.round(this._coinValue);
      }
      if (this._coinT <= 0) {
        this._coinValue = this._coinTarget;
        if (this._coinEl) this._coinEl.textContent = '🪙 ' + Math.round(this._coinValue);
      }
    }

    for (let i = this._popups.length - 1; i >= 0; i--) {
      const p = this._popups[i];
      p.t += dt;
      const k = p.t / p.dur;
      if (k >= 1) {
        this._releasePopup(p.el);
        this._popups.splice(i, 1);
        continue;
      }
      p.el.style.top = (p.y - k * 70) + 'px';
      p.el.style.opacity = String(1 - k * k);
      p.el.style.fontSize = (26 + k * 6) + 'px';
    }

    if (this._bannerCoinEl && this._bannerCoinT < 1.5) {
      this._bannerCoinT += dt;
      this._bannerCoinValue += (this._bannerCoinTarget - this._bannerCoinValue) * Math.min(1, dt * 8);
      if (Math.abs(this._bannerCoinValue - this._bannerCoinTarget) < 0.5) {
        this._bannerCoinValue = this._bannerCoinTarget;
      }
      this._bannerCoinEl.textContent = '🪙 ' + Math.round(this._bannerCoinValue);
    }
  }

  reset() {
    for (let i = 0; i < this._particleCount; i++) {
      this._dustAlive[i] = 0;
      const i3 = i * 3;
      this._dustPositions[i3 + 1] = -9999;
    }
    this._dustGeo.attributes.position.needsUpdate = true;
    this._dustMat.opacity = 0;

    for (let i = 0; i < this._chunkCount; i++) {
      this._chunkActive[i] = 0;
      this._chunkMeshes[i].visible = false;
    }

    if (this.camera && this._shakeApplied) {
      this.camera.position.copy(this._shakeOrigin);
    }
    this._shakeTime = 0;
    this._shakeApplied = false;

    if (this._bounceActive && this.world && this.world.truckGroup) {
      this.world.truckGroup.position.y = this._bounceStartY;
    }
    this._bounceActive = false;

    for (let i = 0; i < this._popups.length; i++) {
      this._releasePopup(this._popups[i].el);
    }
    this._popups.length = 0;

    if (this._banner) {
      if (this._banner.parentNode) this._banner.parentNode.removeChild(this._banner);
      this._banner = null;
      this._bannerCoinEl = null;
    }

    this._coinTarget = 0;
    this._coinValue = 0;
    this._coinT = 0;
    if (this._coinEl) this._coinEl.textContent = '🪙 0';
  }
}
