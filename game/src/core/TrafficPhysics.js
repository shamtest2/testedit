import * as THREE from 'three';

export default class TrafficPhysics {
  constructor(world, RAPIER, trafficCars) {
    this.world = world;
    this.RAPIER = RAPIER;
    this.trafficCars = trafficCars || [];

    this.bodies = [];
    this._pos = { x: 0, y: 0, z: 0 };
    this._quat = { x: 0, y: 0, z: 0, w: 1 };
    this._half = { x: 1, y: 0.8, z: 2.25 };
  }

  init() {
    if (!this.world || !this.RAPIER) return;
    const R = this.RAPIER;
    this.bodies.length = 0;

    for (let i = 0; i < this.trafficCars.length; i++) {
      const car = this.trafficCars[i];
      const mesh = car && car.mesh;
      if (!mesh) {
        this.bodies.push(null);
        continue;
      }

      const p = mesh.position;
      const q = mesh.quaternion;

      const bodyDesc = R.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(p.x, p.y, p.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      const body = this.world.createRigidBody(bodyDesc);

      const colDesc = R.ColliderDesc.cuboid(
        this._half.x,
        this._half.y,
        this._half.z
      );
      colDesc.setTranslation(0, 1.0, 0).setRestitution(0).setFriction(0.5);
      this.world.createCollider(colDesc, body);

      this.bodies.push(body);
    }
  }

  update() {
    for (let i = 0; i < this.trafficCars.length; i++) {
      const car = this.trafficCars[i];
      const body = this.bodies[i];
      if (!body || !car || !car.mesh) continue;

      const p = car.mesh.position;
      const q = car.mesh.quaternion;

      this._pos.x = p.x;
      this._pos.y = p.y;
      this._pos.z = p.z;

      this._quat.x = q.x;
      this._quat.y = q.y;
      this._quat.z = q.z;
      this._quat.w = q.w;

      body.setNextKinematicTranslation(this._pos);
      body.setNextKinematicRotation(this._quat);
    }
  }

  dispose() {
    if (!this.world) {
      this.bodies.length = 0;
      return;
    }
    for (let i = 0; i < this.bodies.length; i++) {
      const body = this.bodies[i];
      if (body) {
        try {
          this.world.removeRigidBody(body);
        } catch (e) {}
      }
    }
    this.bodies.length = 0;
  }
}
