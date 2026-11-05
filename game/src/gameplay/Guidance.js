import * as THREE from 'three';

const _v = new THREE.Vector3();
const _targetScreen = { x: 0, y: 0 };

export default class Guidance {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    this._injectCSS();

    this._target = null;
    this._ring = null;
    this._ringGeo = new THREE.RingGeometry(0.55, 0.85, 40);
    this._ringMat = new THREE.MeshBasicMaterial({
      color: 0xffb84a,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this._ring = new THREE.Mesh(this._ringGeo, this._ringMat);
    this._ring.rotation.x = -Math.PI / 2;
    this._ring.visible = false;
    this.scene.add(this._ring);

    this._pulseTime = 0;

    this._arrow = document.createElement('div');
    this._arrow.className = 'guid-arrow';
    this._arrow.textContent = '➤';
    this._arrow.style.display = 'none';
    document.body.appendChild(this._arrow);

    this._arrowAngle = 0;
    this._arrowActive = false;

    this._steps = [
      'Drive to the dirt pile',
      'Lower the arm and scoop',
      'Dump into the blue truck'
    ];
    this._stepIndex = -1;
    this._card = null;
    this._cardActive = false;

    this._tutKey = 'jobguidance_tutorial_done';
  }

  _injectCSS() {
    if (document.getElementById('guidance-css')) return;
    const style = document.createElement('style');
    style.id = 'guidance-css';
    style.textContent = `
      .guid-arrow {
        position: fixed;
        pointer-events: none;
        font-size: 34px;
        color: #ffb84a;
        text-shadow: 0 2px 8px rgba(0,0,0,0.6), 0 0 14px rgba(255,170,40,0.65);
        transform: translate(-50%, -50%);
        z-index: 9990;
        will-change: left, top, transform;
      }
      .guid-card {
        position: fixed;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        max-width: 340px;
        padding: 14px 22px;
        background: rgba(22,26,34,0.62);
        border: 1px solid rgba(255,255,255,0.22);
        border-radius: 14px;
        backdrop-filter: blur(10px) saturate(140%);
        -webkit-backdrop-filter: blur(10px) saturate(140%);
        color: #fff;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 16px;
        font-weight: 600;
        text-align: center;
        cursor: pointer;
        z-index: 9999;
        box-shadow: 0 8px 26px rgba(0,0,0,0.35);
        user-select: none;
        opacity: 0;
        transition: opacity 0.25s ease;
      }
      .guid-card.show { opacity: 1; }
      .guid-card .guid-skip {
        display: inline-block;
        margin-top: 8px;
        padding: 6px 14px;
        min-height: 32px;
        border-radius: 9px;
        border: 1px solid rgba(255,255,255,0.32);
        background: rgba(255,255,255,0.12);
        color: #fff;
        font-family: inherit;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.4px;
        cursor: pointer;
      }
      .guid-card .guid-skip:hover { background: rgba(255,255,255,0.22); }
      .guid-card .guid-step {
        display: block;
        margin-top: 4px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 1px;
        color: #ffcf6b;
        text-transform: uppercase;
      }
    `;
    document.head.appendChild(style);
  }

  setTarget(target) {
    if (target) {
      this._target = target.clone();
      this._ring.position.copy(this._target);
      this._ring.position.y += 0.05;
      this._ring.visible = true;
      this._arrowActive = true;
      this._arrow.style.display = 'block';
    } else {
      this._target = null;
      this._ring.visible = false;
      this._arrowActive = false;
      this._arrow.style.display = 'none';
    }
  }

  startTutorial() {
    let done = false;
    try {
      done = localStorage.getItem(this._tutKey) === '1';
    } catch (e) {
      done = false;
    }
    if (done) return;

    this._stepIndex = 0;
    this._cardActive = true;

    if (!this._card) {
      const card = document.createElement('div');
      card.className = 'guid-card';
      card.addEventListener('click', () => this.nextTutorialStep());
      document.body.appendChild(card);
      this._card = card;
    }
    this._renderStep();
    requestAnimationFrame(() => {
      if (this._card) this._card.classList.add('show');
    });
  }

  _renderStep() {
    if (!this._card) return;
    if (this._stepIndex < 0 || this._stepIndex >= this._steps.length) {
      this._endTutorial();
      return;
    }
    const text = this._steps[this._stepIndex];
    const num = this._stepIndex + 1;
    const total = this._steps.length;
    this._card.innerHTML = '';
    const t = document.createElement('div');
    t.textContent = text;
    this._card.appendChild(t);
    const s = document.createElement('span');
    s.className = 'guid-step';
    s.textContent = 'Step ' + num + ' / ' + total + ' — tap to continue';
    this._card.appendChild(s);

    // onboarding must be skippable (CrazyGames quality guideline)
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'guid-skip';
    skip.textContent = 'Skip tutorial';
    skip.addEventListener('click', (ev) => {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      this._endTutorial();
    });
    this._card.appendChild(skip);
  }

  nextTutorialStep() {
    if (!this._cardActive) return;
    this._stepIndex++;
    if (this._stepIndex >= this._steps.length) {
      this._endTutorial();
    } else {
      this._renderStep();
    }
  }

  _endTutorial() {
    this._cardActive = false;
    this._stepIndex = -1;
    try {
      localStorage.setItem(this._tutKey, '1');
    } catch (e) {}
    if (this._card) {
      this._card.classList.remove('show');
      const card = this._card;
      this._card = null;
      setTimeout(() => {
        if (card.parentNode) card.parentNode.removeChild(card);
      }, 260);
    }
  }

  update(dt) {
    if (dt <= 0) return;

    if (this._target && this._ring.visible) {
      this._pulseTime += dt;
      const pulse = 0.5 + 0.5 * Math.sin(this._pulseTime * 3.2);
      const s = 1 + pulse * 0.18;
      this._ring.scale.set(s, s, s);
      this._ringMat.opacity = 0.35 + pulse * 0.5;
    }

    if (this._target && this._arrowActive) {
      _v.copy(this._target);
      _v.project(this.camera);

      const onScreen = _v.z < 1 && _v.x >= -0.92 && _v.x <= 0.92 && _v.y >= -0.92 && _v.y <= 0.92;
      const dist = this.camera.position.distanceTo(this._target);

      if (onScreen && dist < 9) {
        this._arrow.style.display = 'none';
        return;
      }
      this._arrow.style.display = 'block';

      const w = window.innerWidth;
      const h = window.innerHeight;
      let sx = (_v.x * 0.5 + 0.5) * w;
      let sy = (-_v.y * 0.5 + 0.5) * h;

      if (_v.z >= 1) {
        sx = w - sx;
        sy = h - sy;
      }

      const margin = 46;
      const cx = w * 0.5;
      const cy = h * 0.5;
      let dx = sx - cx;
      let dy = sy - cy;
      if (dx === 0 && dy === 0) dy = 1;

      const maxX = w * 0.5 - margin;
      const maxY = h * 0.5 - margin;
      const scaleX = maxX / Math.max(1e-4, Math.abs(dx));
      const scaleY = maxY / Math.max(1e-4, Math.abs(dy));
      const k = Math.min(scaleX, scaleY, 1);
      const ex = cx + dx * k;
      const ey = cy + dy * k;

      this._arrow.style.left = ex + 'px';
      this._arrow.style.top = ey + 'px';
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      this._arrow.style.transform = 'translate(-50%, -50%) rotate(' + angle + 'deg)';
    }
  }

  reset() {
    this._target = null;
    if (this._ring) this._ring.visible = false;
    this._pulseTime = 0;
    if (this._arrow) {
      this._arrow.style.display = 'none';
      this._arrowActive = false;
    }
    this._cardActive = false;
    this._stepIndex = -1;
    if (this._card) {
      if (this._card.parentNode) this._card.parentNode.removeChild(this._card);
      this._card = null;
    }
  }
}
