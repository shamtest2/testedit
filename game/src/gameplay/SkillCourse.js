import * as THREE from 'three';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const _e1 = new THREE.Euler();
const _s1 = new THREE.Vector3(1, 1, 1);

const CONE_COUNT = 7;
const TIRE_COUNT = 8;
const SPEED_GATE_COUNT = 5;
const TOTAL_CHECKPOINTS = 12;
const SPEED_BONUS_KMH = 25;

export default class SkillCourse {
  constructor(scene, THREE_REF, origin, yaw) {
    this.scene = scene;
    this.THREE = THREE_REF || THREE;
    this.origin = origin ? origin.clone() : new THREE.Vector3();
    this.yaw = yaw || 0;

    this.group = new THREE.Group();
    this.group.position.copy(this.origin);
    this.group.rotation.y = this.yaw;
    this.scene.add(this.group);

    this._geos = [];
    this._mats = [];
    this._disposables = [];

    this._checkpoints = [];
    this._ringMeshes = [];
    this._ringFlash = [];
    this._ringPulse = [];

    this._cones = [];
    this._coneState = null;
    this._coneInstanced = null;
    this._coneStripeInstanced = null;

    this._tires = [];
    this._tireState = null;
    this._tireInstanced = null;

    this._gates = [];
    this._passed = [];
    this._bonusClaimed = null;

    this._running = false;
    this._finished = false;
    this._time = 0;
    this._penalties = 0;
    this._nextIndex = 0;

    this.onCheckpoint = null;
    this.onPenalty = null;
    this.onBonus = null;
    this.onFinish = null;

    this._build();
  }

  _track(obj) {
    this._disposables.push(obj);
    return obj;
  }

  _mat(color, opts) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85 }, opts || {}));
    this._track(m);
    return m;
  }

  _ringMat(color) {
    const m = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this._track(m);
    return m;
  }

  _build() {
    const T = this.THREE;

    const startMat = this._mat(0x22c55e, { emissive: 0x11aa44, emissiveIntensity: 0.6 });
    const finishMat = this._mat(0xf2f2f2, { emissive: 0x333333, emissiveIntensity: 0.3 });
    const coneMat = this._mat(0xff6a00);
    const coneStripeMat = this._mat(0xffffff);
    const baseMat = this._mat(0x222222);
    const barrierMat = this._mat(0xd8dde3);
    const tireMat = this._mat(0x1a1a1a);
    const beamMat = this._mat(0x666666, { metalness: 0.4 });
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
    this._track(arrowMat);

    const archGeo = new T.BoxGeometry(0.5, 5, 0.5);
    this._track(archGeo);
    const bannerGeo = new T.BoxGeometry(8, 1.2, 0.2);
    this._track(bannerGeo);

    const startArch = new T.Group();
    const pL = new T.Mesh(archGeo, startMat); pL.position.set(-4, 2.5, 0);
    const pR = new T.Mesh(archGeo, startMat); pR.position.set(4, 2.5, 0);
    const banner = new T.Mesh(bannerGeo, startMat); banner.position.set(0, 5.2, 0);
    startArch.add(pL, pR, banner);
    startArch.position.set(0, 0, 0);
    this.group.add(startArch);

    const finishArch = new T.Group();
    const fL = new T.Mesh(archGeo, finishMat); fL.position.set(-4, 2.5, 0);
    const fR = new T.Mesh(archGeo, finishMat); fR.position.set(4, 2.5, 0);
    const fbanner = new T.Mesh(bannerGeo, finishMat); fbanner.position.set(0, 5.2, 0);
    finishArch.add(fL, fR, fbanner);
    this.group.add(finishArch);

    const coneGeo = new T.ConeGeometry(0.28, 0.9, 10);
    this._track(coneGeo);
    const coneStripeGeo = new T.CylinderGeometry(0.17, 0.21, 0.14, 10);
    this._track(coneStripeGeo);
    const baseGeo = new T.BoxGeometry(0.6, 0.08, 0.6);
    this._track(baseGeo);

    const coneInst = new T.InstancedMesh(coneGeo, coneMat, CONE_COUNT + TIRE_COUNT);
    coneInst.count = CONE_COUNT;
    coneInst.castShadow = true;
    coneInst.frustumCulled = false;
    this.group.add(coneInst);
    this._coneInstanced = coneInst;
    this._track(coneInst);

    const stripeInst = new T.InstancedMesh(coneStripeGeo, coneStripeMat, CONE_COUNT);
    stripeInst.castShadow = true;
    stripeInst.frustumCulled = false;
    this.group.add(stripeInst);
    this._coneStripeInstanced = stripeInst;
    this._track(stripeInst);

    const slalomStartZ = -14;
    for (let i = 0; i < CONE_COUNT; i++) {
      const z = slalomStartZ - i * 7;
      const x = (i % 2 === 0) ? -2.5 : 2.5;
      this._cones.push({
        base: new T.Vector3(x, 0, z),
        pos: new T.Vector3(x, 0, z),
        rot: new T.Euler(0, 0, 0),
        vel: new T.Vector3(),
        spin: new T.Vector3(),
        knocked: false,
        settled: false
      });
    }
    this._coneState = new Uint8Array(CONE_COUNT);

    const gateZ = -14 - CONE_COUNT * 7 - 6;
    const barrierGeo = new T.BoxGeometry(3.2, 0.9, 0.45);
    this._track(barrierGeo);
    const b1 = new T.Mesh(barrierGeo, barrierMat);
    b1.position.set(-3.6, 0.45, gateZ);
    const b2 = new T.Mesh(barrierGeo, barrierMat);
    b2.position.set(3.6, 0.45, gateZ);
    b1.castShadow = b2.castShadow = true;
    this.group.add(b1, b2);
    this._gates.push({ x: 0, z: gateZ, halfW: 2.5 });

    const tireGeo = new T.TorusGeometry(0.55, 0.25, 8, 14);
    this._track(tireGeo);
    const tireInst = new T.InstancedMesh(tireGeo, tireMat, TIRE_COUNT);
    tireInst.castShadow = true;
    tireInst.frustumCulled = false;
    this.group.add(tireInst);
    this._tireInstanced = tireInst;
    this._track(tireInst);

    const tireStackZ = gateZ - 10;
    const stacks = [
      { x: -3, z: tireStackZ, n: 3 },
      { x: 3, z: tireStackZ - 5, n: 3 },
      { x: 0, z: tireStackZ - 10, n: 2 }
    ];
    let ti = 0;
    for (let s = 0; s < stacks.length; s++) {
      const st = stacks[s];
      for (let k = 0; k < st.n; k++) {
        this._tires.push({
          base: new T.Vector3(st.x, 0.25 + k * 0.5, st.z),
          pos: new T.Vector3(st.x, 0.25 + k * 0.5, st.z),
          rot: new T.Euler(Math.PI / 2, 0, 0),
          vel: new T.Vector3(),
          spin: new T.Vector3(),
          knocked: false,
          settled: false
        });
        ti++;
      }
    }
    this._tireState = new Uint8Array(TIRE_COUNT);

    const arrowGeo = new T.PlaneGeometry(1.6, 1.6);
    this._track(arrowGeo);
    const turnZ = tireStackZ - 14;
    for (let i = 0; i < 4; i++) {
      const arr = new T.Mesh(arrowGeo, arrowMat);
      arr.rotation.x = -Math.PI / 2;
      arr.position.set(-4 + i * 2.5, 0.02, turnZ);
      arr.rotation.z = -Math.PI / 2;
      this.group.add(arr);
    }
    for (let i = 0; i < 3; i++) {
      const arr = new T.Mesh(arrowGeo, arrowMat);
      arr.rotation.x = -Math.PI / 2;
      arr.position.set(8 + i * 2.5, 0.02, turnZ - 3 - i * 1.5);
      arr.rotation.z = 0;
      this.group.add(arr);
    }

    const beamGeo = new T.BoxGeometry(8, 0.3, 0.3);
    this._track(beamGeo);
    const beamZ = turnZ - 10;
    const beamL = new T.Mesh(archGeo, beamMat);
    beamL.position.set(-4, 3.2, beamZ);
    beamL.scale.y = 0.64;
    const beamR = new T.Mesh(archGeo, beamMat);
    beamR.position.set(4, 3.2, beamZ);
    beamR.scale.y = 0.64;
    const beam = new T.Mesh(beamGeo, beamMat);
    beam.position.set(0, 3.2, beamZ);
    this.group.add(beamL, beamR, beam);
    this._gates.push({ x: 0, z: beamZ, halfW: 2.5, bucketGate: true });

    const speedBaseZ = beamZ - 10;
    for (let i = 0; i < SPEED_GATE_COUNT; i++) {
      const gz = speedBaseZ - i * 8;
      const postL = new T.Mesh(archGeo, beamMat);
      postL.position.set(-4, 1.8, gz);
      postL.scale.y = 0.72;
      const postR = new T.Mesh(archGeo, beamMat);
      postR.position.set(4, 1.8, gz);
      postR.scale.y = 0.72;
      const top = new T.Mesh(beamGeo, beamMat);
      top.position.set(0, 3.6, gz);
      this.group.add(postL, postR, top);
      this._gates.push({ x: 0, z: gz, halfW: 2.5, speedGate: true });
    }

    const finishZ = speedBaseZ - SPEED_GATE_COUNT * 8 - 8;
    finishArch.position.set(0, 0, finishZ);
    startArch.position.set(0, 0, 2);

    const cpZ = [];
    cpZ.push(0);
    for (let i = 0; i < CONE_COUNT; i++) cpZ.push(slalomStartZ - i * 7);
    cpZ.push(gateZ);
    cpZ.push(tireStackZ - 2);
    cpZ.push(turnZ);
    cpZ.push(beamZ);
    cpZ.push(speedBaseZ - 2);
    cpZ.push(speedBaseZ - SPEED_GATE_COUNT * 8 + 6);
    cpZ.push(finishZ);

    const torusGeo = new T.TorusGeometry(2.2, 0.16, 10, 32);
    this._track(torusGeo);

    for (let i = 0; i < TOTAL_CHECKPOINTS && i < cpZ.length; i++) {
      const ringMat = this._ringMat(0xfbbf24);
      const ring = new T.Mesh(torusGeo, ringMat);
      ring.position.set(0, 2.2, cpZ[i]);
      ring.rotation.x = 0;
      ring.visible = false;
      this.group.add(ring);
      this._ringMeshes.push(ring);
      this._ringFlash.push(0);
      this._ringPulse.push(Math.random() * Math.PI * 2);
      this._checkpoints.push(new T.Vector3(0, 0, cpZ[i]));
      this._passed.push(false);
    }

    this._bonusClaimed = new Uint8Array(TOTAL_CHECKPOINTS);

    this._updateConeMatrices(true);
    this._updateTireMatrices(true);
    this._updateRingVisibility();
  }

  _updateConeMatrices(force) {
    if (!this._coneInstanced) return;
    for (let i = 0; i < CONE_COUNT; i++) {
      const c = this._cones[i];
      _q1.setFromEuler(c.rot);
      _m1.compose(c.pos, _q1, _s1);
      this._coneInstanced.setMatrixAt(i, _m1);
      _v1.set(0, 0.38, 0);
      _v1.applyQuaternion(_q1);
      _v1.add(c.pos);
      _e1.copy(c.rot);
      _q1.setFromEuler(_e1);
      _m1.compose(_v1, _q1, _s1);
      if (this._coneStripeInstanced) this._coneStripeInstanced.setMatrixAt(i, _m1);
    }
    this._coneInstanced.instanceMatrix.needsUpdate = true;
    if (this._coneStripeInstanced) this._coneStripeInstanced.instanceMatrix.needsUpdate = true;
  }

  _updateTireMatrices(force) {
    if (!this._tireInstanced) return;
    for (let i = 0; i < TIRE_COUNT; i++) {
      const t = this._tires[i];
      _q1.setFromEuler(t.rot);
      _m1.compose(t.pos, _q1, _s1);
      this._tireInstanced.setMatrixAt(i, _m1);
    }
    this._tireInstanced.instanceMatrix.needsUpdate = true;
  }

  _updateRingVisibility() {
    for (let i = 0; i < this._ringMeshes.length; i++) {
      const r = this._ringMeshes[i];
      if (i === this._nextIndex) {
        r.visible = true;
        r.material.opacity = 0.85;
        r.scale.setScalar(1);
      } else if (i === this._nextIndex + 1) {
        r.visible = true;
        r.material.opacity = 0.22;
        r.scale.setScalar(0.85);
      } else if (this._ringFlash[i] > 0) {
        r.visible = true;
      } else {
        r.visible = false;
      }
    }
  }

  start() {
    this.reset();
    this._running = true;
    this._finished = false;
    this._time = 0;
    this._penalties = 0;
    this._nextIndex = 0;
    this._updateRingVisibility();
  }

  reset() {
    this._running = false;
    this._finished = false;
    this._time = 0;
    this._penalties = 0;
    this._nextIndex = 0;
    for (let i = 0; i < TOTAL_CHECKPOINTS; i++) {
      this._passed[i] = false;
      this._ringFlash[i] = 0;
      this._bonusClaimed[i] = 0;
      const r = this._ringMeshes[i];
      r.scale.setScalar(1);
      r.material.opacity = 0.75;
    }
    for (let i = 0; i < CONE_COUNT; i++) {
      const c = this._cones[i];
      c.pos.copy(c.base);
      c.rot.set(0, 0, 0);
      c.vel.set(0, 0, 0);
      c.spin.set(0, 0, 0);
      c.knocked = false;
      c.settled = false;
    }
    for (let i = 0; i < TIRE_COUNT; i++) {
      const t = this._tires[i];
      t.pos.copy(t.base);
      t.rot.set(Math.PI / 2, 0, 0);
      t.vel.set(0, 0, 0);
      t.spin.set(0, 0, 0);
      t.knocked = false;
      t.settled = false;
    }
    this._updateConeMatrices(true);
    this._updateTireMatrices(true);
    this._updateRingVisibility();
  }

  _worldPosOfLocal(local, out) {
    out.copy(local);
    out.applyAxisAngle(_v3.set(0, 1, 0), this.yaw);
    out.add(this.origin);
    return out;
  }

  update(dt, vehicle) {
    if (!vehicle || !vehicle.mesh) return;
    if (dt <= 0) dt = 0.0001;

    if (this._running && !this._finished) {
      this._time += dt;
    }

    this._updateKnockables(dt, vehicle);

    if (this._running && !this._finished) {
      const vpos = vehicle.mesh.position;
      for (let i = this._nextIndex; i < Math.min(this._nextIndex + 2, this._ringMeshes.length); i++) {
        const cp = this._checkpoints[i];
        this._worldPosOfLocal(cp, _v1);
        const dx = vpos.x - _v1.x;
        const dz = vpos.z - _v1.z;
        if (dx * dx + dz * dz < 16) {
          if (i === this._nextIndex) {
            this._passCheckpoint(i, vehicle);
          }
        }
      }

      for (let g = 0; g < this._gates.length; g++) {
        const gate = this._gates[g];
        if (this._bonusClaimed[Math.min(TOTAL_CHECKPOINTS - 1, g + 3)]) continue;
        this._worldPosOfLocal(_v2.set(gate.x, 0, gate.z), _v1);
        const dx = vpos.x - _v1.x;
        const dz = vpos.z - _v1.z;
        if (dx * dx + dz * dz < 9) {
          if (gate.speedGate) {
            const spd = vehicle.currentSpeed || 0;
            if (spd >= SPEED_BONUS_KMH && !this._bonusClaimed[g + 3]) {
              this._bonusClaimed[g + 3] = 1;
              this._time -= 1;
              if (this.onBonus) this.onBonus(1);
            }
          } else if (gate.bucketGate) {
            const bp = vehicle.boomPivot;
            if (bp && bp.rotation.x >= 0) {
              if (!this._penalties || true) {
                this._penalties += 2;
                if (this.onPenalty) this.onPenalty(2);
              }
            }
          }
        }
      }
    }

    for (let i = 0; i < this._ringMeshes.length; i++) {
      const flash = this._ringFlash[i];
      if (flash > 0) {
        this._ringFlash[i] = Math.max(0, flash - dt * 1.6);
        const r = this._ringMeshes[i];
        const k = 1 - this._ringFlash[i];
        r.scale.setScalar(1 + k * 0.8);
        r.material.opacity = this._ringFlash[i] * 0.9;
        r.material.color.setHex(0x22c55e);
        if (this._ringFlash[i] === 0) {
          r.visible = false;
          r.material.color.setHex(0xfbbf24);
        }
      }
    }

    for (let i = 0; i < this._ringMeshes.length; i++) {
      const r = this._ringMeshes[i];
      if (!r.visible) continue;
      if (i === this._nextIndex) {
        this._ringPulse[i] += dt * 3.2;
        const p = 0.5 + 0.5 * Math.sin(this._ringPulse[i]);
        r.scale.setScalar(1 + p * 0.12);
        r.material.opacity = 0.6 + p * 0.35;
      } else if (i === this._nextIndex + 1) {
        r.material.opacity = 0.22;
      }
    }

    if (!this._finished && this._nextIndex >= TOTAL_CHECKPOINTS) {
      this._finish();
    }
  }

  _passCheckpoint(i, vehicle) {
    this._passed[i] = true;
    this._ringFlash[i] = 1;
    this._nextIndex++;
    if (this.onCheckpoint) this.onCheckpoint(i, TOTAL_CHECKPOINTS);
    this._updateRingVisibility();
  }

  _updateKnockables(dt, vehicle) {
    const vpos = vehicle.mesh.position;

    for (let i = 0; i < CONE_COUNT; i++) {
      const c = this._cones[i];
      if (!c.knocked) {
        this._worldPosOfLocal(c.pos, _v1);
        const dx = vpos.x - _v1.x;
        const dz = vpos.z - _v1.z;
        if (dx * dx + dz * dz < 3.24) {
          c.knocked = true;
          c.vel.set((Math.random() - 0.5) * 5, 3 + Math.random() * 3, (Math.random() - 0.5) * 5);
          c.spin.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
          this._penalties += 2;
          if (this.onPenalty) this.onPenalty(2);
        }
      } else if (!c.settled) {
        c.vel.y -= 14 * dt;
        c.pos.x += c.vel.x * dt;
        c.pos.y += c.vel.y * dt;
        c.pos.z += c.vel.z * dt;
        c.rot.x += c.spin.x * dt;
        c.rot.y += c.spin.y * dt;
        c.rot.z += c.spin.z * dt;
        if (c.pos.y <= 0.15) {
          c.pos.y = 0.15;
          c.vel.y *= -0.3;
          c.vel.x *= 0.7;
          c.vel.z *= 0.7;
          c.spin.multiplyScalar(0.6);
          if (Math.abs(c.vel.y) < 0.5 && c.vel.lengthSq() < 0.5) {
            c.settled = true;
            c.rot.x = Math.PI / 2;
          }
        }
      }
    }

    for (let i = 0; i < TIRE_COUNT; i++) {
      const t = this._tires[i];
      if (!t.knocked) {
        this._worldPosOfLocal(t.pos, _v1);
        const dx = vpos.x - _v1.x;
        const dz = vpos.z - _v1.z;
        if (dx * dx + dz * dz < 3.24) {
          t.knocked = true;
          t.vel.set((Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6);
          t.spin.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
        }
      } else if (!t.settled) {
        t.vel.y -= 14 * dt;
        t.pos.x += t.vel.x * dt;
        t.pos.y += t.vel.y * dt;
        t.pos.z += t.vel.z * dt;
        t.rot.x += t.spin.x * dt;
        t.rot.y += t.spin.y * dt;
        t.rot.z += t.spin.z * dt;
        if (t.pos.y <= 0.25) {
          t.pos.y = 0.25;
          t.vel.y *= -0.3;
          t.vel.x *= 0.7;
          t.vel.z *= 0.7;
          t.spin.multiplyScalar(0.6);
          if (Math.abs(t.vel.y) < 0.5 && t.vel.lengthSq() < 0.5) {
            t.settled = true;
            t.rot.x = Math.PI / 2;
          }
        }
      }
    }

    this._updateConeMatrices(false);
    this._updateTireMatrices(false);
  }

  _finish() {
    this._finished = true;
    this._running = false;
    const total = this._time + this._penalties;
    let medal = 'none';
    if (total <= 55) medal = 'gold';
    else if (total <= 75) medal = 'silver';
    else if (total <= 100) medal = 'bronze';
    if (this.onFinish) {
      this.onFinish({ time: total, penalties: this._penalties, medal });
    }
  }

  getHud() {
    return {
      time: this._time + this._penalties,
      nextIndex: this._nextIndex,
      total: TOTAL_CHECKPOINTS,
      penalties: this._penalties
    };
  }

  getNextTarget() {
    if (this._nextIndex >= TOTAL_CHECKPOINTS) {
      return this._worldPosOfLocal(this._checkpoints[TOTAL_CHECKPOINTS - 1], new THREE.Vector3());
    }
    return this._worldPosOfLocal(this._checkpoints[this._nextIndex], new THREE.Vector3());
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    for (let i = 0; i < this._disposables.length; i++) {
      const d = this._disposables[i];
      if (d && d.dispose) { try { d.dispose(); } catch (e) {} }
    }
    this._disposables.length = 0;
    this._checkpoints.length = 0;
    this._ringMeshes.length = 0;
    this._cones.length = 0;
    this._tires.length = 0;
    this._gates.length = 0;
  }
}
