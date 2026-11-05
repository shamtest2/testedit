const REST_BOOM = -0.2;
const REST_BUCKET = 0.2;
const BOOM_LOW = 0.8;
const BOOM_PUSH = 0.9;
const BOOM_DUMP = -0.35;
const BUCKET_OPEN = -0.5;
const BUCKET_CURL = 1.2;
const BUCKET_DUMP = -0.9;
const BUCKET_RETURN = 0.9;

function easeInOutCubic(t) {
  if (t < 0.5) return 4 * t * t * t;
  const f = -2 * t + 2;
  return 1 - (f * f * f) / 2;
}

function easeOutCubic(t) {
  const f = 1 - t;
  return 1 - f * f * f;
}

function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export default class DigAnimator {
  constructor(vehicle, THREE) {
    this.vehicle = vehicle;
    this.THREE = THREE;
    this.onEvent = null;

    this._type = null;
    this._time = 0;
    this._duration = 3.0;
    this._events = [];
    this._eventIndex = 0;

    this._boom = REST_BOOM;
    this._bucket = REST_BUCKET;

    this._lastBoom = REST_BOOM;
    this._lastBucket = REST_BUCKET;

    if (typeof window !== 'undefined') window.__digBusy = false;
  }

  get busy() {
    return this._type !== null;
  }

  _emit(name) {
    if (typeof this.onEvent === 'function') this.onEvent(name);
  }

  start(type) {
    if (this.busy) return;
    if (type !== 'scoop' && type !== 'dump') return;

    this._type = type;
    this._time = 0;
    this._eventIndex = 0;
    this._events.length = 0;

    if (type === 'scoop') {
      this._events.push([0.0, 'start']);
      this._events.push([1.3, 'dig']);
      this._events.push([1.9, 'fill']);
      this._events.push([1.9, 'lift']);
      this._events.push([3.0, 'end']);
    } else {
      this._events.push([0.0, 'start']);
      this._events.push([0.8, 'tip']);
      this._events.push([1.3, 'drop']);
      this._events.push([1.9, 'thud']);
      this._events.push([3.0, 'end']);
    }

    this._boom = this._readBoom();
    this._bucket = this._readBucket();

    if (typeof window !== 'undefined') window.__digBusy = true;
  }

  _readBoom() {
    const p = this.vehicle && this.vehicle.boomPivot;
    return p ? p.rotation.x : REST_BOOM;
  }

  _readBucket() {
    const p = this.vehicle && this.vehicle.bucketPivot;
    return p ? p.rotation.x : REST_BUCKET;
  }

  update(dt) {
    if (!this.busy) return;
    if (dt < 0) dt = 0;

    this._time += dt;
    const t = this._time;

    while (
      this._eventIndex < this._events.length &&
      t >= this._events[this._eventIndex][0] - 1e-6
    ) {
      this._emit(this._events[this._eventIndex][1]);
      this._eventIndex++;
    }

    let boom = REST_BOOM;
    let bucket = REST_BUCKET;

    if (this._type === 'scoop') {
      if (t < 0.6) {
        const k = easeInOutCubic(clamp01(t / 0.6));
        bucket = this._lerp(this._bucket, BUCKET_OPEN, k);
        boom = this._lerp(this._boom, this._lerp(this._boom, BOOM_LOW, 0.25), k);
      } else if (t < 1.3) {
        const k = easeInOutCubic(clamp01((t - 0.6) / 0.7));
        bucket = BUCKET_OPEN;
        boom = this._lerp(this._lerp(this._boom, BOOM_LOW, 0.25), BOOM_LOW, k);
      } else if (t < 1.9) {
        const k = easeInOutCubic(clamp01((t - 1.3) / 0.6));
        boom = this._lerp(BOOM_LOW, BOOM_PUSH, k);
        bucket = this._lerp(BUCKET_OPEN, BUCKET_CURL, k);
      } else if (t < 3.0) {
        const raw = clamp01((t - 1.9) / 1.1);
        const k = easeInOutCubic(raw);
        const liftK = raw < 0.82 ? raw / 0.82 : 1;
        const liftEase = easeInOutCubic(clamp01(liftK));
        boom = this._lerp(BOOM_PUSH, REST_BOOM, liftEase);
        bucket = this._lerp(BUCKET_CURL, BUCKET_RETURN, k);
        if (raw > 0.82) {
          const s = clamp01((raw - 0.82) / 0.18);
          boom += Math.sin(s * Math.PI) * 0.05;
          bucket = this._lerp(BUCKET_RETURN, REST_BUCKET, easeOutCubic(s));
        }
      } else {
        boom = REST_BOOM;
        bucket = REST_BUCKET;
      }
    } else {
      if (t < 0.8) {
        const k = easeInOutCubic(clamp01(t / 0.8));
        boom = this._lerp(this._boom, BOOM_DUMP, k);
        bucket = this._lerp(this._bucket, BUCKET_CURL, k);
      } else if (t < 1.6) {
        const raw = clamp01((t - 0.8) / 0.8);
        const accel = raw * raw;
        boom = BOOM_DUMP;
        bucket = this._lerp(BUCKET_CURL, BUCKET_DUMP, accel);
      } else if (t < 2.2) {
        const raw = clamp01((t - 1.6) / 0.6);
        const shake = Math.sin(raw * Math.PI * 4) * 0.08 * (1 - raw);
        boom = BOOM_DUMP;
        bucket = BUCKET_DUMP + shake;
      } else if (t < 3.0) {
        const k = easeOutCubic(clamp01((t - 2.2) / 0.8));
        boom = this._lerp(BOOM_DUMP, REST_BOOM, k);
        bucket = this._lerp(BUCKET_DUMP, REST_BUCKET, k);
      } else {
        boom = REST_BOOM;
        bucket = REST_BUCKET;
      }
    }

    this._lastBoom = boom;
    this._lastBucket = bucket;
    this._apply(boom, bucket);

    if (t >= this._duration) {
      this._type = null;
      this._time = 0;
      this._apply(REST_BOOM, REST_BUCKET);
      if (typeof window !== 'undefined') window.__digBusy = false;
    }
  }

  _lerp(a, b, t) {
    return a + (b - a) * t;
  }

  _apply(boom, bucket) {
    const v = this.vehicle;
    if (!v) return;
    if (v.boomPivot) v.boomPivot.rotation.x = boom;
    if (v.bucketPivot) v.bucketPivot.rotation.x = bucket;
    v.targetBoomAngle = boom;
    v.targetBucketAngle = bucket;
  }
}
