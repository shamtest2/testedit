import * as THREE from 'three';

// Cab camera settings (positions are local to the vehicle)
const CAB_EYE = new THREE.Vector3(0, 2.4, -0.2);
const CAB_LOOK = new THREE.Vector3(0, 1.4, 20);
const CAB_NEAR = 0.3;

export class CameraManager {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.currentMode = 'orbit';

        this.spherical = new THREE.Spherical();
        this.spherical.radius = 14;
        this.spherical.phi = Math.PI / 2.2;
        this.spherical.theta = Math.PI;

        this.isDragging = false;
        this.previousMousePosition = { x: 0, y: 0 };

        this.raycaster = new THREE.Raycaster();
        this.collidableMeshes = [];
        this.minDistance = 3.0;

        this.currentLookAt = new THREE.Vector3();

        // cab view helpers
        this._vehicle = null;
        this._hidden = [];
        this._cabReady = false;
        this._baseNear = 0.5;

        // reusable vectors (no new objects every frame)
        this._headPos = new THREE.Vector3();
        this._idealPos = new THREE.Vector3();
        this._offset = new THREE.Vector3();
        this._focus = new THREE.Vector3();
        this._rayDir = new THREE.Vector3();

        this.setupInputs();
    }

    setCollidables(meshes) {
        this.collidableMeshes = meshes || [];
    }

    setupInputs() {
        this.domElement.addEventListener('pointerdown', (e) => {
            this.isDragging = true;
            this.previousMousePosition = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('pointermove', (e) => {
            if (!this.isDragging || this.currentMode !== 'orbit') return;
            const deltaX = e.clientX - this.previousMousePosition.x;
            const deltaY = e.clientY - this.previousMousePosition.y;

            this.spherical.theta -= deltaX * 0.005;
            this.spherical.phi -= deltaY * 0.005;

            this.spherical.phi = Math.max(0.1, Math.min(Math.PI / 2 + 0.3, this.spherical.phi));
            this.previousMousePosition = { x: e.clientX, y: e.clientY };
        });

        const stopDrag = () => { this.isDragging = false; };
        window.addEventListener('pointerup', stopDrag);
        window.addEventListener('pointercancel', stopDrag);
        window.addEventListener('blur', stopDrag);

        this.domElement.addEventListener('wheel', (e) => {
            if (this.currentMode !== 'orbit') return;
            this.spherical.radius += e.deltaY * 0.02;
            this.spherical.radius = Math.max(8, Math.min(60, this.spherical.radius));
        }, { passive: true });

        document.querySelectorAll('.cam-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                const mode = target && target.dataset ? target.dataset.mode : null;
                if (!mode) return;
                this.setMode(mode);
                document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
                target.classList.add('active');
            });
        });
    }

    setMode(mode) {
        if (this.currentMode === mode) return;

        if (mode === 'orbit') {
            this.spherical.theta = Math.PI;
            this.spherical.phi = Math.PI / 2.2;
            this.spherical.radius = 14;
        }
        this.currentMode = mode;
    }

    // ---- Cab view: hide only the parts that Vehicle.js marked with userData.cabHide (roof, glass) ----
    _prepareCab(root) {
        this._restoreCab();
        root.traverse((o) => {
            if (o.userData && o.userData.cabHide && o.visible) {
                o.visible = false;
                this._hidden.push(o);
            }
        });
        this._cabReady = true;
    }

    _restoreCab() {
        for (let i = 0; i < this._hidden.length; i++) {
            this._hidden[i].visible = true;
        }
        this._hidden.length = 0;
        this._cabReady = false;
    }

    update(vehicleMesh, deltaTime, currentSpeed) {
        if (!vehicleMesh) return;

        // time based smoothing: same feel at 60, 144 and 165 fps
        const dt = Math.min(Math.max(deltaTime || 0.016, 0.001), 0.1);
        const k = (rate) => 1 - Math.exp(-rate * dt);

        if (this._vehicle !== vehicleMesh) {
            this._restoreCab();
            this._vehicle = vehicleMesh;
        }

        const inCab = this.currentMode === 'cab';
        if (inCab && !this._cabReady) this._prepareCab(vehicleMesh);
        else if (!inCab && this._cabReady) this._restoreCab();

        // near plane: smaller in the cab so nothing is cut, normal outside
        if (!inCab && this.camera.near !== CAB_NEAR) this._baseNear = this.camera.near;
        const wantNear = inCab ? CAB_NEAR : this._baseNear;
        if (this.camera.near !== wantNear) this.camera.near = wantNear;

        const vehiclePos = vehicleMesh.position;
        const headPos = this._headPos.copy(vehiclePos);
        headPos.y += 2;

        // speed zoom (km/h): a little wider when fast
        const baseFov = 70;
        const maxFovBonus = 12;
        const speedRatio = Math.min(Math.abs(currentSpeed || 0) / 40, 1);
        const targetFov = baseFov + (speedRatio * maxFovBonus);
        this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, k(3));
        this.camera.updateProjectionMatrix();

        const idealPos = this._idealPos;
        const offset = this._offset;

        if (this.currentMode === 'orbit') {
            offset.setFromSpherical(this.spherical);
            idealPos.copy(headPos).add(offset);

            this.camera.position.lerp(idealPos, k(10));
            this.currentLookAt.lerp(headPos, k(13));
            this.camera.lookAt(this.currentLookAt);

        } else if (this.currentMode === 'chase') {
            offset.set(0, 4, 9).applyQuaternion(vehicleMesh.quaternion);
            idealPos.copy(vehiclePos).add(offset);

            this.camera.position.lerp(idealPos, k(6.5));
            this.currentLookAt.lerp(headPos, k(10));
            this.camera.lookAt(this.currentLookAt);

        } else if (this.currentMode === 'cab') {
            // eye is fixed to the vehicle, looks far down the road
            offset.copy(CAB_EYE).applyQuaternion(vehicleMesh.quaternion);
            this.camera.position.copy(vehiclePos).add(offset);

            const look = this._focus.copy(CAB_LOOK).applyQuaternion(vehicleMesh.quaternion).add(vehiclePos);
            this.camera.lookAt(look);
            this.currentLookAt.copy(look);

        } else if (this.currentMode === 'bucket') {
            const bucketFocus = this._focus.set(0, 1, 4).applyQuaternion(vehicleMesh.quaternion).add(vehiclePos);

            offset.set(0, 5, -12).applyQuaternion(vehicleMesh.quaternion);
            idealPos.copy(bucketFocus).add(offset);

            this.camera.position.lerp(idealPos, k(6.5));
            this.currentLookAt.lerp(bucketFocus, k(13));
            this.camera.lookAt(this.currentLookAt);
        }

        // building / tree collision (works only if meshes were given with setCollidables)
        if (!inCab && this.collidableMeshes.length > 0) {
            const rayDir = this._rayDir.copy(this.camera.position).sub(headPos);
            const distance = rayDir.length();
            if (distance > 0.001) {
                rayDir.normalize();
                this.raycaster.set(headPos, rayDir);
                this.raycaster.far = distance;

                const intersects = this.raycaster.intersectObjects(this.collidableMeshes, false);
                if (intersects.length > 0) {
                    const hitDist = intersects[0].distance;
                    if (hitDist < distance) {
                        const safeDist = Math.max(this.minDistance, hitDist - 0.5);
                        this.camera.position.copy(headPos).add(rayDir.multiplyScalar(safeDist));
                    }
                }
            }
        }
    }
}
