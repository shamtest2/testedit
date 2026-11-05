export default class JobManager {
  constructor() {
    this.jobs = [
      { id: 1, title: 'Clear the Highway', objective: 'Scoop and haul debris off the highway', loads: 3, timeLimit: 180, reward: 150, requiredJob: null },
      { id: 2, title: 'Fill the Pothole Crew', objective: 'Deliver dirt to patch the potholes', loads: 4, timeLimit: 200, reward: 250, requiredJob: 1 },
      { id: 3, title: 'Rush Hour Rescue', objective: 'Clear the road before traffic builds up', loads: 5, timeLimit: 200, reward: 400, requiredJob: 2 },
      { id: 4, title: 'Night Shift', objective: 'Work the site through the night', loads: 6, timeLimit: 220, reward: 600, requiredJob: 3 },
      { id: 5, title: 'Mega Site', objective: 'Complete the mega construction contract', loads: 8, timeLimit: 260, reward: 1000, requiredJob: 4 }
    ];

    this.current = null;
    this.timeLeft = 0;
    this.done = 0;
    this.total = 0;
    this.state = 'idle';
    this.completed = {};
    this.bestStars = {};

    this.onTick = null;
    this.onProgress = null;
    this.onComplete = null;
    this.onFail = null;
  }

  start(id) {
    const job = this.jobs.find(j => j.id === id);
    if (!job) return false;
    if (this.isLocked(id)) return false;

    this.current = job;
    this.timeLeft = job.timeLimit;
    this.done = 0;
    this.total = job.loads;
    this.state = 'running';

    if (this.onProgress) this.onProgress(this.done, this.total);
    if (this.onTick) this.onTick(this.timeLeft);
    return true;
  }

  update(dt) {
    if (this.state !== 'running' || !this.current) return;
    if (dt <= 0) return;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      if (this.onTick) this.onTick(this.timeLeft);
      this.fail();
      return;
    }
    if (this.onTick) this.onTick(this.timeLeft);
  }

  addLoad() {
    if (this.state !== 'running' || !this.current) return;
    this.done++;
    if (this.done > this.total) this.done = this.total;
    if (this.onProgress) this.onProgress(this.done, this.total);
    if (this.done >= this.total) {
      this.complete();
    }
  }

  isLocked(id) {
    const job = this.jobs.find(j => j.id === id);
    if (!job) return true;
    if (job.requiredJob === null || job.requiredJob === undefined) return false;
    return !this.completed[job.requiredJob];
  }

  getStars() {
    if (!this.current) return 0;
    const ratio = this.timeLeft / this.current.timeLimit;
    if (ratio > 0.5) return 3;
    if (ratio > 0.2) return 2;
    return 1;
  }

  complete() {
    if (!this.current || this.state !== 'running') {
      return { coins: 0, stars: 0, timeLeft: 0 };
    }
    const job = this.current;
    const stars = this.getStars();
    const timeLeft = this.timeLeft;
    const coins = job.reward;

    this.completed[job.id] = true;
    if (!this.bestStars[job.id] || this.bestStars[job.id] < stars) {
      this.bestStars[job.id] = stars;
    }
    this.state = 'complete';

    const result = { coins, stars, timeLeft };
    if (this.onComplete) this.onComplete(result);
    return result;
  }

  fail() {
    if (this.state !== 'running') return;
    this.state = 'failed';
    if (this.onFail) this.onFail();
  }

  retry() {
    if (!this.current) return false;
    return this.start(this.current.id);
  }

  load(saveObj) {
    if (!saveObj || typeof saveObj !== 'object') return;
    this.completed = {};
    this.bestStars = {};
    if (saveObj.completed && typeof saveObj.completed === 'object') {
      for (const k in saveObj.completed) {
        if (saveObj.completed[k]) this.completed[k] = true;
      }
    }
    if (saveObj.bestStars && typeof saveObj.bestStars === 'object') {
      for (const k in saveObj.bestStars) {
        const v = saveObj.bestStars[k];
        if (typeof v === 'number' && v >= 0) this.bestStars[k] = v;
      }
    }
  }

  save() {
    const out = { completed: {}, bestStars: {} };
    for (const k in this.completed) out.completed[k] = !!this.completed[k];
    for (const k in this.bestStars) out.bestStars[k] = this.bestStars[k];
    return out;
  }
}
