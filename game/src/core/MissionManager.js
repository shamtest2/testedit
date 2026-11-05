import * as THREE from 'three';

export class MissionManager {
    constructor(scene, world, RAPIER, audio) {
        this.scene = scene;
        this.world = world;
        this.RAPIER = RAPIER;
        this.audio = audio;
        this.activeMission = null;
        this.coins = 0;
        this.dirtInTruck = 0;
        this.maxDirt = 3; 
        
        this.timerPanel = document.getElementById('timer-panel');
        this.timerVal = document.getElementById('timer-val');
        this.dispatchDesc = document.getElementById('dispatch-desc');
        this.coinEl = document.getElementById('coin-count');
        this.speedEl = document.getElementById('speed-val');

        this.collectibleCoins = [];
        this.timeLeft = 120; 
        this.timerInterval = null;

        this.createTruck();
        this.spawnCollectibleCoins(15);
        this.startMissionTimer();
    }

    createTruck() {
        this.truckGroup = new THREE.Group();
        this.truckGroup.position.set(-15, 0, -5); 
        
        const truckBlue = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.4, metalness: 0.3 });
        const bedMetal = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.7, metalness: 0.6 });
        const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1a202c, roughness: 0.8 });
        const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

        const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.4, 8.0), darkMetal);
        chassis.position.set(0, 0.8, 0); chassis.castShadow = true; this.truckGroup.add(chassis);

        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 2.4), truckBlue);
        cab.position.set(0, 2.0, 2.8); cab.castShadow = true; this.truckGroup.add(cab);

        const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 5.0), bedMetal);
        bedFloor.position.set(0, 1.2, -1.4); bedFloor.castShadow = true; this.truckGroup.add(bedFloor);
        
        const bedWallL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.8, 5.0), bedMetal);
        bedWallL.position.set(-1.3, 2.1, -1.4); this.truckGroup.add(bedWallL);
        const bedWallR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.8, 5.0), bedMetal);
        bedWallR.position.set(1.3, 2.1, -1.4); this.truckGroup.add(bedWallR);
        
        const wheelGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.5, 16);
        wheelGeo.rotateZ(Math.PI / 2);
        const wheelPositions = [
            { x: -1.4, y: 0.7, z: 2.8 }, { x: 1.4, y: 0.7, z: 2.8 },
            { x: -1.4, y: 0.7, z: -1.0 }, { x: 1.4, y: 0.7, z: -1.0 },
            { x: -1.4, y: 0.7, z: -2.8 }, { x: 1.4, y: 0.7, z: -2.8 }
        ];
        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeo, tireMat);
            wheel.position.set(pos.x, pos.y, pos.z);
            wheel.castShadow = true; this.truckGroup.add(wheel);
        });

        this.scene.add(this.truckGroup);

        const R = this.RAPIER;
        const truckBodyDesc = R.RigidBodyDesc.fixed().setTranslation(-15, 0, -5);
        const truckBody = this.world.createRigidBody(truckBodyDesc);
        this.world.createCollider(R.ColliderDesc.cuboid(1.3, 1.2, 1.2).setTranslation(0, 2.0, 2.8), truckBody);
        this.world.createCollider(R.ColliderDesc.cuboid(1.4, 0.1, 2.5).setTranslation(0, 1.2, -1.4), truckBody);
    }

    spawnCollectibleCoins(count) {
        const coinGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16);
        coinGeo.rotateX(Math.PI / 2);
        const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1.0, roughness: 0.2, emissive: 0x553300 });

        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * 200;
            const z = (Math.random() - 0.5) * 200;
            if (Math.hypot(x, z) < 15) continue;

            const coin = new THREE.Mesh(coinGeo, coinMat);
            coin.position.set(x, 1.0, z);
            coin.castShadow = true;
            this.scene.add(coin);
            this.collectibleCoins.push(coin);
        }
    }

    startMissionTimer() {
        setTimeout(() => {
            this.triggerFarmerCall();
        }, 3000); 
    }

    triggerFarmerCall() {
        // Place mission far away on the grid
        const x = (Math.random() > 0.5 ? 1 : -1) * (50 + Math.random() * 50); 
        const z = (Math.random() > 0.5 ? 1 : -1) * (50 + Math.random() * 50);
        
        this.activeMission = {
            position: new THREE.Vector3(x, 0, z),
            cleared: false,
            mesh: new THREE.Group()
        };

        this.activeMission.mesh.position.set(x, 0, z);
        
        const moundMat = new THREE.MeshStandardMaterial({ color: 0x4a3627, roughness: 1.0 });
        const moundGeo = new THREE.SphereGeometry(4, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const mound = new THREE.Mesh(moundGeo, moundMat);
        mound.scale.set(1.5, 0.8, 1.5);
        mound.castShadow = true;
        this.activeMission.mesh.add(mound);

        const rockMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.8 });
        for (let i = 0; i < 6; i++) {
            const size = 0.8 + Math.random() * 1.0;
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size), rockMat);
            rock.position.set((Math.random() - 0.5) * 4, size / 2, (Math.random() - 0.5) * 4);
            rock.castShadow = true;
            this.activeMission.mesh.add(rock);
        }
        this.scene.add(this.activeMission.mesh);

        const beaconGeo = new THREE.CylinderGeometry(0.5, 0.5, 50, 16, 1, true);
        const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff5b6e, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.set(x, 25, z);
        this.scene.add(beacon);
        this.activeMission.beacon = beacon;

        this.dirtInTruck = 0;
        this.dispatchDesc.textContent = "Landslide on the highway! Drive down the road and clear it.";
        this.dispatchDesc.classList.add('active');
        this.timerPanel.classList.add('active');
        this.timerPanel.classList.remove('danger');
        
        this.timeLeft = 120; 
        this.startTimerLoop();
    }

    startTimerLoop() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        this.updateTimerUI();
        this.timerInterval = setInterval(() => {
            this.timeLeft--;
            this.updateTimerUI();
            
            if (this.timeLeft <= 10 && this.timeLeft > 0) {
                if (this.audio) this.audio.playWarningBeep();
                this.timerPanel.classList.add('danger');
            }

            if (this.timeLeft <= 0) {
                this.failMission();
            }
        }, 1000);
    }

    updateTimerUI() {
        const mins = Math.floor(this.timeLeft / 60);
        const secs = this.timeLeft % 60;
        this.timerVal.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    failMission() {
        clearInterval(this.timerInterval);
        this.dispatchDesc.textContent = "Mission Failed. The road remains blocked.";
        this.timerPanel.classList.remove('active');
        
        if (this.activeMission.beacon) this.scene.remove(this.activeMission.beacon);
        if (this.activeMission.mesh) this.scene.remove(this.activeMission.mesh);
        this.activeMission.cleared = true;

        setTimeout(() => {
            this.dispatchDesc.classList.remove('active');
            this.triggerFarmerCall();
        }, 4000);
    }

    update(vehicle) {
        if (vehicle) {
            this.speedEl.textContent = vehicle.currentSpeed || 0;
        }

        this.collectibleCoins.forEach((coin, index) => {
            if (!coin.visible) return;
            coin.rotation.y += 0.05;
            coin.position.y = 1.0 + Math.sin(Date.now() * 0.003 + index) * 0.2;

            if (vehicle && vehicle.mesh) {
                const dist = vehicle.mesh.position.distanceTo(coin.position);
                if (dist < 3.5) {
                    coin.visible = false;
                    this.coins += 10;
                    this.coinEl.textContent = this.coins;
                }
            }
        });

        if (!this.activeMission || this.activeMission.cleared) return;

        if (this.activeMission.beacon) {
            this.activeMission.beacon.material.opacity = 0.2 + Math.sin(Date.now() / 200) * 0.2;
            this.activeMission.beacon.rotation.y += 0.05;
        }

        if (vehicle && vehicle.bucketPivot) {
            const bucketWorldPos = new THREE.Vector3();
            vehicle.bucketPivot.getWorldPosition(bucketWorldPos);
            
            const truckBedPos = new THREE.Vector3(-15, 2.5, -6.4); 
            const distToTruck = bucketWorldPos.distanceTo(truckBedPos);

            if (distToTruck < 7 && vehicle.hasDirt) {
                if (vehicle.targetBoomAngle < -0.1) {
                    vehicle.dropDirt();
                    this.dirtInTruck++;
                    this.dispatchDesc.textContent = `Dirt delivered: ${this.dirtInTruck} / ${this.maxDirt}`;
                    
                    if (this.dirtInTruck >= this.maxDirt) {
                        this.completeMission();
                    }
                }
            }
        }
    }

    completeMission() {
        this.activeMission.cleared = true;
        clearInterval(this.timerInterval);
        
        this.scene.remove(this.activeMission.mesh);
        this.scene.remove(this.activeMission.beacon);
        
        this.coins += 100;
        this.coinEl.textContent = this.coins;

        this.dispatchDesc.textContent = "Mission Successful! +100 Coins";
        this.timerPanel.classList.remove('active', 'danger');
        
        try {
            if (window.CrazyGames && window.CrazyGames.SDK) {
                window.CrazyGames.SDK.game.happytime();
            }
        } catch (e) {}

        setTimeout(() => {
            this.dispatchDesc.classList.remove('active');
            this.triggerFarmerCall();
        }, 5000);
    }
}
