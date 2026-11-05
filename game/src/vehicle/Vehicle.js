import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export class Vehicle {
    constructor(scene, world, RAPIER) {
        this.scene = scene; this.world = world; this.RAPIER = RAPIER;
        this.mode = 'jcb'; this.hasDirt = false;
        
        this.armIsDown = false; this.bucketIsCurled = false;
        this.targetBoomAngle = -0.2; this.targetBucketAngle = 0.2;
        this.engineMultiplier = 1.0; this.hydraulicMultiplier = 1.0;

        this.particles = []; this.particlePool = []; this.particleGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        // soft round smoke / dust puffs (sprites with a painted radial gradient)
        this.puffTex = this._makePuffTexture(); this.puffPool = []; this.puffs = []; this._smokeAcc = 0; this._dustAcc = 0;
        
        this.chassisBody = this.createChassis();
        this.vehicleController = this.createVehicleController();
        this.mesh = this.createMesh(); this.scene.add(this.mesh);
        
        // Combined steering + spin requires intrinsic Y-X order on the wheel groups
        for (const w of this.wheelMeshes) { w.group.rotation.order = 'YXZ'; }
        
        // Physics state
        this.throttleState = 0;
        this.currentSteerAngle = 0;
        this.smoothedSpeed = 0;
        this.currentSpeed = 0;
        this.tipTimer = 0;
        this.lastSafePosition = { x: 0, y: 1.2, z: 0 };
        this.lastSafeQuaternion = { x: 0, y: 0, z: 0, w: 1 };
        
        // Scratch vectors (avoid per-frame allocations)
        this._tempVel = new THREE.Vector3();
        this._tempForward = new THREE.Vector3();
        this._tempQuat = new THREE.Quaternion();
        this._tempUp = new THREE.Vector3();
        
        // Spawn inside the new central garage hub
        this.chassisBody.setTranslation({ x: 0, y: 1.2, z: 0 }, true);
        this.chassisBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    }

    setUpgrades(saveData) {
        if(saveData) {
            this.engineMultiplier = 1 + (saveData.engineLevel - 1) * 0.5;
            this.hydraulicMultiplier = 1 + (saveData.hydraulicLevel - 1) * 0.6;
        }
    }

    createChassis() {
        const R = this.RAPIER;
        const chassisDesc = R.RigidBodyDesc.dynamic()
            .setTranslation(0, 1.2, 0)
            .setLinearDamping(0.15)
            .setAngularDamping(2.5)
            .setCcdEnabled(true);
        
        const chassisBody = this.world.createRigidBody(chassisDesc);
        
        // Light collider shell; the bulk of the mass is added below at a low offset.
        const colliderDesc = R.ColliderDesc.cuboid(0.9, 0.3, 1.5)
            .setMass(500)
            .setFriction(1.0)
            .setRestitution(0.0)
            .setTranslation(0, -0.3, 0);
        this.world.createCollider(colliderDesc, chassisBody);
        
        // Additional 6500kg at y=-0.5 => total 7000kg, COM ~ -0.48 from body origin.
        // Higher principal inertia on X/Y resists tipping and spinout.
        chassisBody.setAdditionalMassProperties(
            6500,
            { x: 0, y: -0.5, z: 0 },
            { x: 5000, y: 6600, z: 2000 },
            { x: 0, y: 0, z: 0, w: 1 }
        );
        
        return chassisBody;
    }

    createVehicleController() {
        const R = this.RAPIER; const controller = this.world.createVehicleController(this.chassisBody);
        const wheelPositions = [
            { x: -0.9, y: -0.2, z: 1.2, r: 0.35 }, { x: 0.9, y: -0.2, z: 1.2, r: 0.35 }, 
            { x: -1.0, y: -0.1, z: -1.1, r: 0.55 }, { x: 1.0, y: -0.1, z: -1.1, r: 0.55 }  
        ];
        const direction = { x: 0, y: -1, z: 0 }; const axle = { x: -1, y: 0, z: 0 };
        
        for (let pos of wheelPositions) controller.addWheel({x: pos.x, y: pos.y, z: pos.z}, direction, axle, 0.4, pos.r);
        
        for (let i = 0; i < 4; i++) {
            // Stiff springs tuned for a ~7-ton body
            controller.setWheelSuspensionStiffness(i, 150.0);
            controller.setWheelSuspensionCompression(i, 3.5);
            controller.setWheelSuspensionRelaxation(i, 3.0);
            controller.setWheelMaxSuspensionTravel(i, 0.25);
            controller.setWheelMaxSuspensionForce(i, 200000.0);
            // Realistic tire grip (2000 was ice-skating); tires should bite and rotate the vehicle
            controller.setWheelFrictionSlip(i, 1.5);
            controller.setWheelSideFrictionStiffness(i, 1.0);
        }
        return controller;
    }

    toggleArm() {
        this.armIsDown = !this.armIsDown;
        if (!this.armIsDown) { this.targetBoomAngle = -0.2; this.bucketIsCurled = false; this.targetBucketAngle = 0.2; } 
        else { this.targetBoomAngle = 0.8; }
    }

    _hint(msg) {
        const n = performance.now();
        if (this._lastHint && n - this._lastHint < 1500) return;
        this._lastHint = n;
        window.dispatchEvent(new CustomEvent('bh-hint', { detail: msg }));
    }

    autoAction() {
        if (this._auto || window.__digBusy) return;
        const bp = new THREE.Vector3(); this.bucketPivot.getWorldPosition(bp);
        if (!this.hasDirt) {
            if (!this.pilePos || bp.distanceTo(this.pilePos) > 9) { this._hint('Drive the bucket over the dirt pile'); return; }
            window.dispatchEvent(new CustomEvent('bh-dig', { detail: 'scoop' }));
        } else {
            if (!this.truckPos || bp.distanceTo(this.truckPos) > 8) { this._hint('Drive closer: bucket over the truck bed'); return; }
            window.dispatchEvent(new CustomEvent('bh-dig', { detail: 'dump' }));
        }
    }

    _autoStep(dt) {
        const a = this._auto; if (!a) return;
        a.t += dt;
        if (a.type === 'scoop') {
            if (a.step === 0) { this.armIsDown = true; this.targetBoomAngle = 0.8; this.targetBucketAngle = -0.5; a.step = 1; a.t = 0; }
            else if (a.step === 1 && a.t > 0.55) { this.targetBucketAngle = 1.2; this.bucketIsCurled = true; a.step = 2; a.t = 0; }
            else if (a.step === 2 && a.t > 0.5) { this.scoopDirt(); this.spawnDirtBurst(); a.step = 3; a.t = 0; }
            else if (a.step === 3 && a.t > 0.3) { this.targetBoomAngle = -0.2; this.armIsDown = false; a.step = 4; a.t = 0; }
            else if (a.step === 4 && a.t > 0.6) { this._auto = null; }
        } else {
            if (a.step === 0) { this.targetBoomAngle = -0.2; this.targetBucketAngle = -0.9; a.step = 1; a.t = 0; }
            else if (a.step === 1 && a.t > 0.6) { if (this.hasDirt) { this.spawnDirtBurst(); this.dropDirt(); } a.step = 2; a.t = 0; }
            else if (a.step === 2 && a.t > 0.5) { this.targetBucketAngle = 0.2; this.targetBoomAngle = -0.2; this.bucketIsCurled = false; this.armIsDown = false; a.step = 3; a.t = 0; }
            else if (a.step === 3 && a.t > 0.5) { this._auto = null; }
        }
    }

    _tryScoop() {
        if (this.hasDirt || !this.pilePos) return;
        const p = new THREE.Vector3(); this.bucketPivot.getWorldPosition(p);
        if (p.distanceTo(this.pilePos) < 14) this.scoopDirt();
    }

    toggleBucket() {
        this.bucketIsCurled = !this.bucketIsCurled;
        if (this.bucketIsCurled) { this.targetBucketAngle = 1.2; this._tryScoop(); }
        else { this.targetBucketAngle = -0.5; if (this.hasDirt) { this.spawnDirtBurst(); this.dropDirt(); } }
    }

    createMesh() {
        const group = new THREE.Group();

        // ---------- materials (plain standard materials: cheap and stable) ----------
        const paint = new THREE.MeshStandardMaterial({ color: 0xffb400, roughness: 0.42, metalness: 0.1 });
        const paintDark = new THREE.MeshStandardMaterial({ color: 0xc98a00, roughness: 0.5, metalness: 0.1 });
        const blackPlastic = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.7, metalness: 0.2 });
        const darkSteel = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.55, metalness: 0.35 });
        const steel = new THREE.MeshStandardMaterial({ color: 0xb4b9bf, roughness: 0.35, metalness: 0.3 });
        const wornSteel = new THREE.MeshStandardMaterial({ color: 0x8d9298, roughness: 0.6, metalness: 0.3 });
        const glass = new THREE.MeshStandardMaterial({ color: 0x4a7396, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.55, depthWrite: false });
        const tireRubber = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 1.0 });
        const headlightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffaa, emissiveIntensity: 2.0 });
        const taillightMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1.6 });
        const hazardYellow = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.55 });
        const hazardBlack = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.55 });
        const beaconMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff8800, emissiveIntensity: 0 });

        // ---------- small helpers ----------
        const put = (parent, mesh, x, y, z) => {
            mesh.position.set(x, y, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            parent.add(mesh);
            return mesh;
        };
        const box = (parent, w, h, d, mat, x, y, z) =>
            put(parent, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z);
        const rbox = (parent, w, h, d, r, mat, x, y, z) => {
            const rad = Math.max(0.02, Math.min(r, Math.min(w, h, d) / 2 - 0.01));
            return put(parent, new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, rad), mat), x, y, z);
        };
        const cyl = (parent, r, len, axis, mat, x, y, z, seg) => {
            const g = new THREE.CylinderGeometry(r, r, len, seg || 16);
            if (axis === 'x') g.rotateZ(Math.PI / 2);
            else if (axis === 'z') g.rotateX(Math.PI / 2);
            return put(parent, new THREE.Mesh(g, mat), x, y, z);
        };

        const visualGroup = new THREE.Group(); visualGroup.position.y = -0.1; group.add(visualGroup);
        const jcbGroup = new THREE.Group(); visualGroup.add(jcbGroup);

        // ---------- main body ----------
        rbox(jcbGroup, 2.2, 0.8, 4.0, 0.2, paint, 0, 0.6, 0);
        box(jcbGroup, 1.7, 0.3, 3.6, blackPlastic, 0, 0.1, 0);

        // ---------- hood (rounded) + sloped top ----------
        rbox(jcbGroup, 2.0, 0.8, 2.3, 0.28, paint, 0, 1.0, 0.85);
        const hoodTop = rbox(jcbGroup, 1.8, 0.5, 1.2, 0.22, paint, 0, 1.42, 1.45);
        hoodTop.rotation.x = 0.18;

        // front: grille, bumper, headlights
        box(jcbGroup, 1.3, 0.6, 0.3, darkSteel, 0, 0.85, 2.0);
        rbox(jcbGroup, 2.4, 0.4, 0.5, 0.15, darkSteel, 0, 0.35, 2.15);
        [-1, 1].forEach((s) => {
            box(jcbGroup, 0.3, 0.35, 0.3, headlightMat, s * 1.02, 1.15, 2.0);
        });

        // ---------- side tool boxes, fenders, mudguards, steps ----------
        [-1, 1].forEach((s) => {
            rbox(jcbGroup, 0.3, 0.6, 1.2, 0.1, darkSteel, s * 1.15, 0.55, 1.0);
            rbox(jcbGroup, 0.8, 0.3, 1.5, 0.12, paint, s * 1.0, 0.55, -1.1);
            rbox(jcbGroup, 0.5, 0.3, 0.9, 0.1, paintDark, s * 0.95, 0.2, 1.2);
            rbox(jcbGroup, 0.5, 0.3, 0.9, 0.1, darkSteel, s * 1.2, 0.85, -0.7);
        });

        // ---------- cab ----------
        rbox(jcbGroup, 1.9, 0.44, 2.0, 0.1, paintDark, 0, 1.2, -0.65);
        const glassBox = box(jcbGroup, 1.5, 1.4, 1.5, glass, 0, 2.1, -0.65);
        glassBox.castShadow = false;
        glassBox.userData.cabHide = true;
        [-1, 1].forEach((s) => {
            rbox(jcbGroup, 0.3, 1.5, 0.3, 0.1, paint, s * 0.77, 2.1, 0.15);
            rbox(jcbGroup, 0.3, 1.5, 0.3, 0.1, paint, s * 0.77, 2.1, -1.45);
        });
        rbox(jcbGroup, 2.1, 0.3, 2.2, 0.12, paint, 0, 2.95, -0.65).userData.cabHide = true;
        // interior
        rbox(jcbGroup, 0.8, 0.9, 0.8, 0.15, blackPlastic, 0, 1.95, -1.0);
        rbox(jcbGroup, 1.0, 0.5, 0.4, 0.1, blackPlastic, 0, 1.75, -0.1);
        const steeringWheel = cyl(jcbGroup, 0.25, 0.3, 'y', blackPlastic, 0, 2.1, -0.35);
        steeringWheel.rotation.x = -1.0;
        // roof gear
        rbox(jcbGroup, 0.9, 0.3, 0.6, 0.1, darkSteel, 0, 3.2, -1.15).userData.cabHide = true;
        [-1, 1].forEach((s) => {
            box(jcbGroup, 0.45, 0.3, 0.3, headlightMat, s * 0.7, 3.2, 0.3).userData.cabHide = true;
        });

        // amber beacon (blinking)
        cyl(jcbGroup, 0.2, 0.3, 'y', darkSteel, -0.6, 3.25, -1.3, 12);
        const beaconMesh = cyl(jcbGroup, 0.18, 0.3, 'y', beaconMat, -0.6, 3.55, -1.3, 12);
        beaconMesh.castShadow = false;
        this.beaconMesh = beaconMesh;
        const blinkLoop = () => {
            if (!this.beaconMesh) return;
            const t = performance.now() * 0.004;
            this.beaconMesh.material.emissiveIntensity = (Math.sin(t) > 0.3) ? 2.6 : 0.15;
            requestAnimationFrame(blinkLoop);
        };
        requestAnimationFrame(blinkLoop);

        // ---------- exhaust ----------
        this.exhaustTip = new THREE.Object3D(); this.exhaustTip.position.set(0.9, 3.55, 1.15); jcbGroup.add(this.exhaustTip);
        cyl(jcbGroup, 0.15, 1.8, 'y', darkSteel, 0.9, 2.3, 1.15, 12).userData.cabHide = true;
        cyl(jcbGroup, 0.2, 0.3, 'y', steel, 0.9, 3.3, 1.15, 12).userData.cabHide = true;

        // ---------- mirrors ----------
        [-1, 1].forEach((s) => {
            box(jcbGroup, 0.5, 0.3, 0.3, blackPlastic, s * 1.15, 2.5, 0.15);
            rbox(jcbGroup, 0.3, 0.6, 0.35, 0.1, blackPlastic, s * 1.35, 2.4, 0.2);
        });

        // ---------- rear: counterweight, hazard band, tail lights ----------
        rbox(jcbGroup, 2.3, 0.9, 0.9, 0.2, darkSteel, 0, 0.5, -2.1);
        for (let i = 0; i < 6; i++) {
            box(jcbGroup, 0.34, 0.3, 0.3, i % 2 === 0 ? hazardYellow : hazardBlack, -0.85 + i * 0.34, 0.3, -2.6);
        }
        [-1, 1].forEach((s) => {
            box(jcbGroup, 0.3, 0.4, 0.3, taillightMat, s * 0.9, 0.75, -2.55);
            // rear stabiliser legs
            box(jcbGroup, 0.4, 1.0, 0.4, steel, s * 1.35, 0.15, -1.95);
            rbox(jcbGroup, 0.8, 0.3, 0.8, 0.1, darkSteel, s * 1.35, -0.45, -1.95);
        });

        // ---------- boom (two thick beams, pins, cross tube, hydraulics) ----------
        this.boomPivot = new THREE.Group(); this.boomPivot.position.set(0, 1.0, 2.0); this.boomPivot.rotation.x = this.targetBoomAngle; jcbGroup.add(this.boomPivot);
        [-1, 1].forEach((s) => {
            rbox(this.boomPivot, 0.4, 0.55, 3.3, 0.15, paint, s * 0.75, 0, 1.25);
            cyl(this.boomPivot, 0.2, 1.1, 'z', paintDark, s * 0.75, 0.5, 0.7, 14);   // cylinder barrel
            cyl(this.boomPivot, 0.15, 1.1, 'z', steel, s * 0.75, 0.5, 1.7, 12);      // cylinder rod
        });
        cyl(this.boomPivot, 0.2, 2.3, 'x', steel, 0, 0, 0, 14);                        // boom pivot pin
        cyl(this.boomPivot, 0.2, 1.1, 'x', darkSteel, 0, 0, 1.6, 14);                  // cross tube

        // ---------- bucket (thick walls, edge, teeth) ----------
        this.bucketPivot = new THREE.Group(); this.bucketPivot.position.set(0, -0.2, 2.8); this.bucketPivot.rotation.x = this.targetBucketAngle; this.boomPivot.add(this.bucketPivot);
        cyl(this.bucketPivot, 0.22, 2.2, 'x', steel, 0, 0, 0, 14);                     // bucket pivot pin
        rbox(this.bucketPivot, 1.8, 0.4, 0.4, 0.1, darkSteel, 0, 0.7, -0.65);          // top bracket
        rbox(this.bucketPivot, 2.6, 0.3, 1.5, 0.1, darkSteel, 0, -0.25, 0.05);         // floor
        const backPlate = rbox(this.bucketPivot, 2.6, 1.2, 0.3, 0.1, darkSteel, 0, 0.25, -0.6);
        backPlate.rotation.x = -0.25;
        [-1, 1].forEach((s) => {
            rbox(this.bucketPivot, 0.3, 1.1, 1.5, 0.1, darkSteel, s * 1.15, 0.2, 0.05);
        });
        rbox(this.bucketPivot, 2.7, 0.3, 0.4, 0.05, wornSteel, 0, -0.3, 0.85);         // cutting edge
        const toothGeo = new THREE.ConeGeometry(0.15, 0.4, 5); toothGeo.rotateX(Math.PI / 2);
        for (let i = 0; i < 6; i++) {
            put(this.bucketPivot, new THREE.Mesh(toothGeo, wornSteel), -1.1 + i * 0.44, -0.3, 1.15);
        }

        // Bucket dirt (hidden until scooped)
        this.bucketDirtGroup = new THREE.Group(); this.bucketDirtGroup.position.set(0, 0.2, 0);
        const clodGeo = new THREE.DodecahedronGeometry(0.35, 0); const clodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 1.0 });
        for(let i = 0; i < 8; i++) { const clod = new THREE.Mesh(clodGeo, clodMat); clod.position.set((Math.random()-0.5)*2.0, (Math.random()-0.5)*0.4, (Math.random()-0.5)*1.0); clod.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0); clod.visible = false; this.bucketDirtGroup.add(clod); }
        this.bucketPivot.add(this.bucketDirtGroup);

        // ---------- wheels: tyre, tread blocks, rim, hub ----------
        this.wheelMeshes = [];
        const wheelData = [{ x: -0.9, y: -0.2, z: 1.2, r: 0.35, w: 0.3 }, { x: 0.9, y: -0.2, z: 1.2, r: 0.35, w: 0.3 }, { x: -1.0, y: -0.1, z: -1.1, r: 0.55, w: 0.5 }, { x: 1.0, y: -0.1, z: -1.1, r: 0.55, w: 0.5 }];
        wheelData.forEach((pos) => {
            const wheelGroup = new THREE.Group();
            const tire = new THREE.Mesh(new THREE.CylinderGeometry(pos.r, pos.r, pos.w, 24).rotateZ(Math.PI / 2), tireRubber);
            tire.castShadow = true; wheelGroup.add(tire);
            // tread blocks around the tyre
            const lugCount = pos.r > 0.4 ? 16 : 12;
            const lugGeo = new THREE.BoxGeometry(pos.w * 0.9, 0.16, 0.22);
            for (let i = 0; i < lugCount; i++) {
                const a = (i / lugCount) * Math.PI * 2;
                const lug = new THREE.Mesh(lugGeo, tireRubber);
                lug.position.set(0, Math.cos(a) * pos.r, Math.sin(a) * pos.r);
                lug.rotation.x = a;
                wheelGroup.add(lug);
            }
            cyl(wheelGroup, pos.r * 0.58, pos.w + 0.16, 'x', paintDark, 0, 0, 0, 20);   // rim sticks out 0.08 each side
            cyl(wheelGroup, 0.15, pos.w + 0.3, 'x', steel, 0, 0, 0, 10);                // hub nut
            wheelGroup.position.set(pos.x, pos.y, pos.z); visualGroup.add(wheelGroup); this.wheelMeshes.push({ group: wheelGroup, baseY: pos.y });
        });

        return group;
    }

    spawnParticle(pos, velocity, color, life, scale) {
        let particle;
        if (this.particlePool.length > 0) { particle = this.particlePool.pop(); particle.mesh.visible = true; } 
        else { const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8 }); const mesh = new THREE.Mesh(this.particleGeo, mat); this.scene.add(mesh); particle = { mesh: mesh, velocity: new THREE.Vector3(), life: 0, maxLife: 0, scale: 1 }; }
        particle.mesh.position.copy(pos); particle.mesh.material.color.setHex(color); particle.mesh.scale.set(scale, scale, scale);
        particle.velocity.copy(velocity); particle.life = life; particle.maxLife = life; particle.scale = scale;
        this.particles.push(particle);
    }

    spawnExhaust() { const pos = new THREE.Vector3(); this.exhaustTip.getWorldPosition(pos); const vel = new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 2 + 1, (Math.random() - 0.5) * 1.5); const k = this._smokePower || 0; const g = Math.round(154 - k * 70); this.spawnPuff(pos, vel.multiplyScalar(0.55), g * 65793, 1.4 + Math.random() * 0.8, 0.3, 1.7 + k * 1.0, 0.5 + k * 0.25); }
    spawnTireDust(wheelIndex) { const pos = new THREE.Vector3(); this.wheelMeshes[wheelIndex].group.getWorldPosition(pos); pos.y = 0.2; const vel = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2); this.spawnPuff(pos, vel.multiplyScalar(0.4), 0xb5a58a, 0.8 + Math.random() * 0.5, 0.4, 1.8, 0.32); }
    spawnDirtBurst() { if (!this.hasDirt) return; const pos = new THREE.Vector3(); this.bucketPivot.getWorldPosition(pos); for (let i = 0; i < 15; i++) { const vel = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6); this.spawnParticle(pos, vel, 0x5c3a21, 0.8 + Math.random() * 0.4, 2.0); } }

    _makePuffTexture() {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    spawnPuff(pos, vel, color, life, startScale, endScale, opacity) {
        let p = this.puffPool.pop();
        if (!p) {
            const mat = new THREE.SpriteMaterial({ map: this.puffTex, color: color, transparent: true, depthWrite: false, opacity: 0 });
            const sprite = new THREE.Sprite(mat);
            sprite.renderOrder = 5;
            this.scene.add(sprite);
            p = { sprite: sprite, velocity: new THREE.Vector3(), life: 0, maxLife: 1, s0: 1, s1: 1, op: 1, spin: 0 };
        }
        p.sprite.visible = true;
        p.sprite.position.copy(pos);
        p.sprite.material.color.setHex(color);
        p.sprite.material.rotation = Math.random() * 6.28;
        p.sprite.scale.set(startScale, startScale, 1);
        p.velocity.copy(vel);
        p.life = life; p.maxLife = life;
        p.s0 = startScale; p.s1 = endScale; p.op = opacity;
        p.spin = (Math.random() - 0.5) * 0.8;
        this.puffs.push(p);
        if (this.puffs.length > 160) {
            const old = this.puffs.shift();
            old.sprite.visible = false;
            this.puffPool.push(old);
        }
    }

    updatePuffs(dt) {
        const drag = Math.exp(-1.6 * dt);
        for (let i = this.puffs.length - 1; i >= 0; i--) {
            const p = this.puffs[i];
            p.life -= dt;
            if (p.life <= 0) {
                p.sprite.visible = false;
                this.puffPool.push(p);
                this.puffs.splice(i, 1);
                continue;
            }
            const age = 1 - p.life / p.maxLife;           // 0 -> 1
            p.velocity.multiplyScalar(drag);
            p.velocity.y += 0.9 * dt;                      // warm air carries it up
            p.sprite.position.addScaledVector(p.velocity, dt);
            const s = p.s0 + (p.s1 - p.s0) * Math.sqrt(age);
            p.sprite.scale.set(s, s, 1);
            p.sprite.material.rotation += p.spin * dt;
            p.sprite.material.opacity = p.op * Math.min(1, age * 6) * (1 - age);
        }
    }

    updateParticles(dt) {
        this.updatePuffs(dt);
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i]; p.life -= dt;
            if (p.life <= 0) { p.mesh.visible = false; this.particlePool.push(p); this.particles.splice(i, 1); continue; }
            p.velocity.y -= 9.81 * dt * 0.5; p.mesh.position.addScaledVector(p.velocity, dt);
            const progress = p.life / p.maxLife; const currentScale = p.scale * progress;
            p.mesh.scale.set(currentScale, currentScale, currentScale); p.mesh.material.opacity = progress;
        }
    }

    scoopDirt() { if (!this.hasDirt) { this.hasDirt = true; this.bucketDirtGroup.children.forEach(c => c.visible = true); return true; } return false; }
    dropDirt() { if (this.hasDirt) { this.hasDirt = false; this.bucketDirtGroup.children.forEach(c => c.visible = false); return true; } return false; }

    capturePhysicsState() {
        const t = this.chassisBody.translation(), r = this.chassisBody.rotation();
        if (!this._currPos) {
            this._prevPos = new THREE.Vector3(t.x, t.y, t.z);
            this._currPos = new THREE.Vector3(t.x, t.y, t.z);
            this._prevQuat = new THREE.Quaternion(r.x, r.y, r.z, r.w);
            this._currQuat = new THREE.Quaternion(r.x, r.y, r.z, r.w);
            this._interpQuat = new THREE.Quaternion();
        } else {
            this._prevPos.copy(this._currPos); this._prevQuat.copy(this._currQuat);
            this._currPos.set(t.x, t.y, t.z); this._currQuat.set(r.x, r.y, r.z, r.w);
        }
    }

    resetInterpolation() { this._currPos = null; }

    getForwardSpeedMps() {
        const vel = this.chassisBody.linvel();
        const rot = this.chassisBody.rotation();
        this._tempQuat.set(rot.x, rot.y, rot.z, rot.w);
        this._tempForward.set(0, 0, 1).applyQuaternion(this._tempQuat);
        return vel.x * this._tempForward.x + vel.z * this._tempForward.z;
    }

    getSpeedKmh() {
        return this.smoothedSpeed;
    }

    resetToSafe() {
        if (!this.lastSafePosition || !this.lastSafeQuaternion) return;
        this.chassisBody.setTranslation(this.lastSafePosition, true);
        this.resetInterpolation();
        this.chassisBody.setRotation(this.lastSafeQuaternion, true);
        this.chassisBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.chassisBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.tipTimer = 0;
        this.throttleState = 0;
        this.smoothedSpeed = 0;
        this.currentSpeed = 0;
    }

    updateController(input, deltaTime) {
        if (input.forward || input.backward || input.left || input.right || input.brake) this.chassisBody.wakeUp();
        
        // === Throttle ramp ===
        const throttleRampRate = 1 / 0.35; // 0 -> full in 0.6s
        const targetThrottle = input.forward ? 1 : (input.backward ? -1 : 0);
        
        if (targetThrottle !== 0) {
            if (this.throttleState * targetThrottle < 0) this.throttleState = 0;
            const sign = Math.sign(targetThrottle - this.throttleState);
            this.throttleState += sign * throttleRampRate * deltaTime;
            if (Math.abs(this.throttleState) > 1) this.throttleState = Math.sign(this.throttleState);
        } else {
            const decay = 2.5 * deltaTime;
            if (Math.abs(this.throttleState) <= decay) this.throttleState = 0;
            else this.throttleState -= Math.sign(this.throttleState) * decay;
        }
        
        // === Governor (top speed caps) ===
        const maxForwardSpeed = Math.min(32 + (this.engineMultiplier - 1) * 10, 60) / 3.6;
        const maxReverseSpeed = Math.min(14 + (this.engineMultiplier - 1) * 2.0, 28) / 3.6;
        
        const currentFwdSpeed = this.getForwardSpeedMps();
        
        const baseEngineForce = 6500 * this.engineMultiplier;
        let forceMultiplier = 1;
        
        if (this.throttleState > 0.01) {
            if (currentFwdSpeed > maxForwardSpeed * 0.95) forceMultiplier = 0;
            else if (currentFwdSpeed > maxForwardSpeed * 0.85) forceMultiplier = 0.4;
        } else if (this.throttleState < -0.01) {
            if (currentFwdSpeed < -maxReverseSpeed * 0.95) forceMultiplier = 0;
            else if (currentFwdSpeed < -maxReverseSpeed * 0.85) forceMultiplier = 0.4;
        }
        
        const appliedForce = baseEngineForce * this.throttleState * forceMultiplier;
        
        // === RWD: rear wheels are 2,3 ===
        this.vehicleController.setWheelEngineForce(0, 0);
        this.vehicleController.setWheelEngineForce(1, 0);
        this.vehicleController.setWheelEngineForce(2, appliedForce);
        this.vehicleController.setWheelEngineForce(3, appliedForce);
        
        // === Brakes: strong user brake, light engine braking when coasting ===
        if (input.brake) {
            for (let i = 0; i < 4; i++) this.vehicleController.setWheelBrake(i, 100.0);
        } else if (targetThrottle === 0 && Math.abs(currentFwdSpeed) > 0.3) {
            for (let i = 0; i < 4; i++) this.vehicleController.setWheelBrake(i, 2.0);
        } else {
            for (let i = 0; i < 4; i++) this.vehicleController.setWheelBrake(i, 0);
        }
        
        // === Speed-sensitive steering ===
        const speedAbs = Math.abs(currentFwdSpeed);
        const speedFactor = Math.max(0.25, 1 - speedAbs / 12);
        const maxSteerAngle = 0.55 * speedFactor;
        let steerInput = 0;
        if (input.left) steerInput = 1;
        else if (input.right) steerInput = -1;
        
        this.currentSteerAngle = steerInput * maxSteerAngle;
        
        this.vehicleController.setWheelSteering(0, this.currentSteerAngle);
        this.vehicleController.setWheelSteering(1, this.currentSteerAngle);
        this.vehicleController.setWheelSteering(2, 0);
        this.vehicleController.setWheelSteering(3, 0);
        
        this.vehicleController.updateVehicle(deltaTime);
    }

    updateVisuals(audio, dt) {
        // === Safety check (before sync, so a reset is reflected this frame) ===
        const rotPre = this.chassisBody.rotation();
        const transPre = this.chassisBody.translation();
        
        if (transPre.y < -5) {
            this.resetToSafe();
        } else {
            this._tempQuat.set(rotPre.x, rotPre.y, rotPre.z, rotPre.w);
            this._tempUp.set(0, 1, 0).applyQuaternion(this._tempQuat);
            const upDot = this._tempUp.y;
            
            if (upDot < Math.cos(70 * Math.PI / 180)) {
                this.tipTimer += dt;
                if (this.tipTimer > 2.0) this.resetToSafe();
            } else {
                this.tipTimer = 0;
                if (upDot > Math.cos(25 * Math.PI / 180) && transPre.y > 0.1 && transPre.y < 3.0) {
                    this.lastSafePosition = { x: transPre.x, y: transPre.y, z: transPre.z };
                    this.lastSafeQuaternion = { x: rotPre.x, y: rotPre.y, z: rotPre.z, w: rotPre.w };
                }
            }
        }
        
        // === Sync mesh from physics ===
        const translation = this.chassisBody.translation(); const rotation = this.chassisBody.rotation();
        if (this._currPos) {
            const al = Math.max(0, Math.min(1, this.renderAlpha === undefined ? 1 : this.renderAlpha));
            this.mesh.position.lerpVectors(this._prevPos, this._currPos, al);
            this._interpQuat.copy(this._prevQuat).slerp(this._currQuat, al);
            this.mesh.quaternion.copy(this._interpQuat);
        } else {
            this.mesh.position.set(translation.x, translation.y, translation.z);
            this.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
        }
        
        // === Wheels: suspension + spin + (front) steer ===
        for (let i = 0; i < this.wheelMeshes.length; i++) {
            const wheelData = this.wheelMeshes[i]; 
            const suspensionLength = this.vehicleController.wheelSuspensionLength(i);
            wheelData.group.position.y = wheelData.baseY - suspensionLength; 
            wheelData.group.rotation.x = this.vehicleController.wheelRotation(i);
            if (i < 2) wheelData.group.rotation.y = this.currentSteerAngle;
        }
        
        // === Hydraulics ===
        if (this.mode === 'jcb') {
            const hydraulicSpeed = 1 - Math.pow(1 - Math.min(0.25, 0.09 * this.hydraulicMultiplier), Math.min(dt, 0.05) * 60); this._autoStep(dt);
            this.boomPivot.rotation.x = THREE.MathUtils.lerp(this.boomPivot.rotation.x, this.targetBoomAngle, hydraulicSpeed);
            this.bucketPivot.rotation.x = THREE.MathUtils.lerp(this.bucketPivot.rotation.x, this.targetBucketAngle, hydraulicSpeed);
        }
        
        // === Smoothed speed (km/h) ===
        const vel = this.chassisBody.linvel();
        const speedKmh = Math.sqrt(vel.x * vel.x + vel.z * vel.z) * 3.6;
        this.smoothedSpeed = this.smoothedSpeed * 0.85 + speedKmh * 0.15;
        this.currentSpeed = Math.round(this.smoothedSpeed);
        
        // exhaust smoke is counted by time (same at 60 and 144 fps): a little at idle, more when working
        this._smokePower = Math.min(1, Math.abs(this.throttleState)); this._smokeAcc += Math.min(dt, 0.05) * (7 + this._smokePower * 15);
        while (this._smokeAcc >= 1) { this._smokeAcc -= 1; this.spawnExhaust(); }
        if (this.currentSpeed > 5) {
            // (exhaust smoke is spawned above)
            this._dustAcc += Math.min(dt, 0.05) * 6; while (this._dustAcc >= 1) { this._dustAcc -= 1; this.spawnTireDust(2); this.spawnTireDust(3); }
        }
        this.updateParticles(dt);
    }
}
