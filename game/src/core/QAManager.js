import * as THREE from 'three';

export class QAManager {
    constructor(scene, camera, renderer, vehicle, worldBuilder) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.vehicle = vehicle;
        this.worldBuilder = worldBuilder;
        
        this.isVisible = true; // Press Shift+Q to toggle
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 60;
        this.frameTimeHistory = [];
        
        this.createUI();
        this.setupInputs();
        
        // Start the check loop
        this.checkLoop();
    }

    createUI() {
        this.container = document.createElement('div');
        this.container.id = 'qa-overlay';
        this.container.style.cssText = `
            position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.85); border: 2px solid #333;
            border-radius: 8px; padding: 15px; color: #fff;
            font-family: 'Courier New', monospace; font-size: 12px;
            z-index: 9999; pointer-events: none; display: none;
            width: 400px; backdrop-filter: blur(5px);
        `;
        
        this.container.innerHTML = `
            <div style="font-weight:bold; color:#4de1c1; margin-bottom:8px; border-bottom:1px solid #444; padding-bottom:4px;">🔍 QA DIAGNOSTIC INSPECTOR</div>
            <div style="display:flex; justify-content:space-between;"><span>FPS & Frame Time:</span> <span id="qa-fps">...</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Draw Calls (Max 1000):</span> <span id="qa-drawcalls">...</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Polygons:</span> <span id="qa-polygons">...</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Physics Stability:</span> <span id="qa-physics">...</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Camera Clipping:</span> <span id="qa-camera">...</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Memory Leaks:</span> <span id="qa-memory">...</span></div>
            <div style="margin-top:8px; font-size:10px; color:#888; text-align:center;">Press [Shift + Q] to toggle this inspector</div>
        `;
        document.body.appendChild(this.container);
    }

    setupInputs() {
        window.addEventListener('keydown', (e) => {
            if (e.shiftKey && e.key.toLowerCase() === 'q') {
                this.isVisible = !this.isVisible;
                this.container.style.display = this.isVisible ? 'block' : 'none';
            }
        });
    }

    checkLoop() {
        requestAnimationFrame(() => this.checkLoop());
        
        this.frameCount++;
        const now = performance.now();
        const delta = now - this.lastTime;
        
        // Calculate FPS every 10 frames
        if (this.frameCount % 10 === 0) {
            this.fps = Math.round(1000 / (delta / 10 || 16.6));
            
            // Track frame times for stutter detection
            this.frameTimeHistory.push(delta / 10);
            if (this.frameTimeHistory.length > 10) this.frameTimeHistory.shift();
            
            this.lastTime = now;
            this.updateUI();
        }
    }

    updateUI() {
        if (!this.isVisible) return;

        // 1. Check FPS & Stuttering
        const fpsEl = document.getElementById('qa-fps');
        const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length;
        let fpsStatus = 'GOOD';
        let fpsColor = '#4de1c1'; // Green
        
        if (this.fps < 50) { fpsStatus = 'LOW'; fpsColor = '#ffcc00'; } // Yellow
        if (this.fps < 30) { fpsStatus = 'CRITICAL'; fpsColor = '#ff3333'; } // Red
        if (avgFrameTime > 30) { fpsStatus += ' (STUTTERING)'; fpsColor = '#ff3333'; }
        
        fpsEl.textContent = `${this.fps} FPS | ${avgFrameTime.toFixed(1)}ms`;
        fpsEl.style.color = fpsColor;

        // 2. Check Draw Calls (Render performance)
        const drawCallsEl = document.getElementById('qa-drawcalls');
        const drawCalls = this.renderer.info.render.calls;
        drawCallsEl.textContent = drawCalls;
        drawCallsEl.style.color = drawCalls > 1000 ? '#ffcc00' : (drawCalls > 2000 ? '#ff3333' : '#4de1c1');

        // 3. Check Polygons
        const polyEl = document.getElementById('qa-polygons');
        const polys = this.renderer.info.render.triangles;
        polyEl.textContent = polys.toLocaleString();
        polyEl.style.color = polys > 500000 ? '#ffcc00' : '#4de1c1';

        // 4. Physics Stability (Is the JCB doing something weird?)
        const physEl = document.getElementById('qa-physics');
        const vel = this.vehicle.chassisBody.linvel();
        const angVel = this.vehicle.chassisBody.angvel();
        const pos = this.vehicle.chassisBody.translation();
        
        let physStatus = 'STABLE';
        let physColor = '#4de1c1';
        
        // Check if falling into void (Z check depends on map, Y check is absolute)
        if (pos.y < -10) { physStatus = 'FALLING THROUGH FLOOR'; physColor = '#ff3333'; }
        // Check if physics velocity exploded (glitch)
        else if (Math.abs(vel.x) > 50 || Math.abs(vel.y) > 50 || Math.abs(vel.z) > 50) { physStatus = 'VELOCITY SPIKE'; physColor = '#ff3333'; }
        // Check if spinning out of control
        else if (Math.abs(angVel.y) > 10) { physStatus = 'SPIN GLITCH'; physColor = '#ffcc00'; }
        
        physEl.textContent = physStatus;
        physEl.style.color = physColor;

        // 5. Camera Clipping (Is the camera inside a wall?)
        const camEl = document.getElementById('qa-camera');
        // In main.js we set near plane to 0.5. If distance is too close, it clips.
        const distToVehicle = this.camera.position.distanceTo(this.vehicle.mesh.position);
        if (distToVehicle < 1.0) {
            camEl.textContent = 'CLIPPING (TOO CLOSE)';
            camEl.style.color = '#ff3333';
        } else {
            camEl.textContent = 'CLEAR';
            camEl.style.color = '#4de1c1';
        }

        // 6. Memory Leaks
        const memEl = document.getElementById('qa-memory');
        const geometries = this.renderer.info.memory.geometries;
        const textures = this.renderer.info.memory.textures;
        memEl.textContent = `${geometries} Geo | ${textures} Tex`;
        memEl.style.color = geometries > 1000 ? '#ffcc00' : '#4de1c1';
    }
}
