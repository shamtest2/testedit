import * as THREE from 'three';
import { Vehicle } from './vehicle/Vehicle.js';
import { AudioHub } from './core/Audio.js';
import { CameraManager } from './core/CameraManager.js';
import { World } from './core/World.js';
import { QAManager } from './core/QAManager.js';
import JobEffects from './gameplay/JobEffects.js';
import Guidance from './gameplay/Guidance.js';
// (SoundFX removed in M2: all sound is in core/Audio.js)
// (Sfx2 removed in M2)
import DigAnimator from './vehicle/DigAnimator.js';
// (DigSound removed in M2)
import GameUI from './ui/GameUI.js';
// (Music removed in M2)
import TrafficPhysics from './core/TrafficPhysics.js';
// M8: JobManager (old, temporary) is replaced by the real job system in Jobs.js
import { JobSystem, JobPanels, START, upgradeCost, MAX_LEVEL } from './gameplay/Jobs.js';
import SiteSystem, { venueFor } from './gameplay/SiteSystem.js';
import Portal from './core/CrazySDK.js';

const portal = new Portal();

let fx = null, guide = null, sfx = null, tutStep = 0, lastTarget = 'none';
function safe(f) { try { return f(); } catch (e) { console.warn('[fx]', e); } }
let ui = null, music = null, trafficPhys = null, lastLoads = 0, lastCoinsShown = -1;
let jobs = null, panels = null, siteSys = null;
let currentJobId = 1, maxLoads = 3, jobStarted = false, inAd = false, _muteBeforeAd = false;
// QA shortcuts: ?job=4 starts on job 4, ?unlock=1 ignores the unlock rules
const URLQ = new URLSearchParams(location.search);
const FORCE_UNLOCK = URLQ.has('unlock');
const START_JOB = parseInt(URLQ.get('job') || '', 10);
function jobCtx() {
    return {
        engineLevel: saveData.engineLevel,
        hydraulicLevel: saveData.hydraulicLevel,
        bucketLevel: saveData.bucketLevel || 1
    };
}
let dig = null, digSound = null;
const dm = { fill: 1, drop: -1, b: 0, k: 0, was: false };
function updateDig(dt) {
    safe(() => {
        if (!dig && vehicle) {
            dig = new DigAnimator(vehicle, THREE);
            window.addEventListener('bh-dig', e => { if (!dig.busy) { dig.start(e.detail); } });
            dig.onEvent = (n) => {
                hub.dig(dig._type, n);
                if (n === 'dig') { cameraShake = 0.06; const p = new THREE.Vector3(); vehicle.bucketPivot.getWorldPosition(p); if (fx) fx.onScoop(p); }
                if (n === 'fill') { vehicle.scoopDirt(); vehicle.spawnDirtBurst(); cameraShake = 0.1; vehicle.bucketDirtGroup.scale.setScalar(0.15); dm.fill = 0; }
                if (n === 'drop') { vehicle.spawnDirtBurst(); dm.drop = 0; }
                if (n === 'thud') cameraShake = 0.2;
            };
        }
        if (dig) {
            const bp = vehicle.boomPivot, kp = vehicle.bucketPivot;
            if (!dm.was && dig.busy) { dm.b = bp.rotation.x; dm.k = kp.rotation.x; }
            dig.update(dt);
            if (dig.busy) {
                const f = 1 - Math.exp(-16 * dt);
                dm.b += (bp.rotation.x - dm.b) * f; dm.k += (kp.rotation.x - dm.k) * f;
                bp.rotation.x = dm.b; kp.rotation.x = dm.k;
            }
            dm.was = dig.busy;
            const g = vehicle.bucketDirtGroup;
            if (dm.fill < 1) { dm.fill = Math.min(1, dm.fill + dt / 0.6); const e = 1 - Math.pow(1 - dm.fill, 3); g.scale.setScalar(0.15 + 0.85 * e); }
            if (dm.drop >= 0) {
                dm.drop += dt / 0.8; g.scale.setScalar(Math.max(0.05, 1 - dm.drop));
                if (dm.drop >= 1) { vehicle.dropDirt(); g.scale.setScalar(1); dm.drop = -1; }
            }
        }
    });
}
function initUi() {
    safe(() => {
        ui = new GameUI();
        music = hub;
        jobs = new JobSystem();
        panels = new JobPanels();
        if (world && RAPIER) siteSys = new SiteSystem(scene, world);
        jobs.onTick = (t) => { if (ui) ui.setTimer(Math.ceil(t)); };
        jobs.onFail = () => { onJobFail(); };
        ui.setCoins(saveData.coins);
        music.start(); music.startAmbience();
        window.addEventListener('bh-hint', e => { if (ui) ui.toast(e.detail, 'warn'); });
    });
}
function updateUi(dt) {
    if (!ui) initUi();
    safe(() => {
        if (!trafficPhys && world && RAPIER) { trafficPhys = new TrafficPhysics(world, RAPIER, worldBuilder.trafficCars); trafficPhys.init(); }
        if (trafficPhys) trafficPhys.update();
        // the very first job starts once physics and the UI both exist
        if (!jobStarted && physReady && jobs && worldBuilder && worldBuilder.truckGroup) {
            jobStarted = true;
            const first = Number.isFinite(START_JOB) && jobs.get(START_JOB) ? START_JOB : jobs.lastPlayed();
            beginJob(first);
        }
        if (ui) {
            ui.setSpeed(vehicle.currentSpeed);
            if (saveData.coins !== lastCoinsShown) { lastCoinsShown = saveData.coins; ui.setCoins(saveData.coins); }
        }
        if (jobs && !jobCompleted && !(panels && panels.isOpen())) jobs.update(dt);
        if (music) music.setIntensity(Math.min(1, vehicle.currentSpeed / 40));
    });
}
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const SAVE_KEY = 'terraform_city_save_v6';
let saveData = { coins: 0, engineLevel: 1, hydraulicLevel: 1, bucketLevel: 1 };

const canvas = document.getElementById('game-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe9f3);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 1400);
const cameraManager = new CameraManager(camera, canvas);
const worldBuilder = new World(scene);
cameraManager.setCollidables([...worldBuilder.buildingMeshes, ...worldBuilder.treeMeshes]);

cameraManager.setMode('bucket');
document.querySelectorAll('.cam-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'bucket'));

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// ---- Balanced lighting + fog (overrides World's defaults) ----
if (worldBuilder.sunLight) {
    worldBuilder.sunLight.intensity = 2.2;
    const sc = worldBuilder.sunLight.shadow.camera;
    sc.left = -40;
    sc.right = 40;
    sc.top = 40;
    sc.bottom = -40;
    sc.near = 1;
    sc.far = 400;
    sc.updateProjectionMatrix();
    worldBuilder.sunLight.shadow.mapSize.width = 2048;
    worldBuilder.sunLight.shadow.mapSize.height = 2048;
    scene.add(worldBuilder.sunLight.target);
}
if (worldBuilder.hemiLight) {
    worldBuilder.hemiLight.intensity = 0.8;
    worldBuilder.hemiLight.color.set(0xbfd4ff);
    worldBuilder.hemiLight.groundColor.set(0x7a8a66);
}
scene.fog = new THREE.FogExp2(0xdfe9f3, 0.0020);
scene.background = new THREE.Color(0xdfe9f3);

// ---- Quality system ----
const QUALITY_PRESETS = {
    low:    { shadowMapSize: 0,    pixelRatio: 1,   bloom: false },
    medium: { shadowMapSize: 1024, pixelRatio: 1.5, bloom: true  },
    high:   { shadowMapSize: 2048, pixelRatio: 2,   bloom: true  }
};
let currentQuality = 'high';
let composer = null;
let bloomPass = null;
let vignettePass = null;
let firstFrameRendered = false;

function applyQualitySettings(q) {
    const preset = QUALITY_PRESETS[q];
    if (!preset) return;
    currentQuality = q;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatio));

    if (preset.shadowMapSize === 0) {
        renderer.shadowMap.enabled = false;
    } else {
        renderer.shadowMap.enabled = true;
        if (worldBuilder.sunLight) {
            worldBuilder.sunLight.shadow.mapSize.width = preset.shadowMapSize;
            worldBuilder.sunLight.shadow.mapSize.height = preset.shadowMapSize;
            if (worldBuilder.sunLight.shadow.map) {
                worldBuilder.sunLight.shadow.map.dispose();
                worldBuilder.sunLight.shadow.map = null;
            }
        }
    }

    if (bloomPass) bloomPass.enabled = preset.bloom;
    if (composer) {
        composer.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatio));
        composer.setSize(window.innerWidth, window.innerHeight);
    }

    renderer.setSize(window.innerWidth, window.innerHeight);
}

function stepDownQuality() {
    if (currentQuality === 'high') applyQualitySettings('medium');
    else if (currentQuality === 'medium') applyQualitySettings('low');
}

function setupPostProcessing() {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY_PRESETS[currentQuality].pixelRatio));
    composer.setSize(window.innerWidth, window.innerHeight);

    composer.addPass(new RenderPass(scene, camera));

    bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.22,  // strength (subtle)
        0.45,  // radius
        0.85   // threshold
    );
    bloomPass.enabled = QUALITY_PRESETS[currentQuality].bloom;
    composer.addPass(bloomPass);
    if (currentQuality !== 'low') { composer.renderTarget1.samples = 4; composer.renderTarget2.samples = 4; }

    vignettePass = new ShaderPass({
        uniforms: {
            tDiffuse: { value: null },
            strength: { value: 0.32 },
            offset: { value: 0.85 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform float strength;
            uniform float offset;
            varying vec2 vUv;
            void main() {
                vec4 color = texture2D(tDiffuse, vUv);
                vec2 uv = vUv - 0.5;
                float d = length(uv) * offset * 2.0;
                float v = smoothstep(1.0, 0.35, d);
                color.rgb *= mix(1.0, v, strength);
                gl_FragColor = color;
            }
        `
    });
    composer.addPass(vignettePass);

    composer.addPass(new OutputPass());
}

function renderFrame() {
    if (!firstFrameRendered) {
        firstFrameRendered = true;
        setupPostProcessing();
        startFpsTest();
    }
    if (composer) composer.render();
    else renderer.render(scene, camera);
}

window.setQuality = (q) => {
    if (QUALITY_PRESETS[q]) applyQualitySettings(q);
};

// Initial quick hardware-based quality detection
(function quickQualityDetect() {
    let level = 'high';
    const cores = navigator.hardwareConcurrency || 4;
    const pxr = window.devicePixelRatio || 1;
    if (cores <= 4 || pxr >= 2.5) level = 'medium';
    if (cores <= 2) level = 'low';
    applyQualitySettings(level);
})();

// ---- Shadow-camera follow + texel snapping ----
const _sunOffset = new THREE.Vector3(80, 150, 80);
function updateSunShadow() {
    const sun = worldBuilder.sunLight;
    if (!sun || !vehicle) return;
    const vx = vehicle.mesh.position.x;
    const vz = vehicle.mesh.position.z;
    const texel = 80 / (sun.shadow.mapSize.width || 2048);
    const sx = Math.round(vx / texel) * texel;
    const sz = Math.round(vz / texel) * texel;
    sun.target.position.set(sx, 0, sz);
    sun.target.updateMatrixWorld();
    sun.position.set(sx + _sunOffset.x, _sunOffset.y, sz + _sunOffset.z);
    sun.updateMatrixWorld();
}

// ---- Sustained FPS monitor (step down if <40fps for 3s) ----
let fpsCheckAccum = 0;
let fpsFrameCount = 0;
let lowFpsAccum = 0;
function trackFPS(dt) {
    fpsCheckAccum += dt;
    fpsFrameCount++;
    if (fpsCheckAccum >= 1.0) {
        const fps = fpsFrameCount / fpsCheckAccum;
        if (fps < 40) lowFpsAccum += fpsCheckAccum;
        else lowFpsAccum = 0;
        if (lowFpsAccum >= 3.0 && currentQuality !== 'low') {
            stepDownQuality();
            lowFpsAccum = 0;
        }
        fpsCheckAccum = 0;
        fpsFrameCount = 0;
    }
}

function startFpsTest() {
    let frames = 0;
    const start = performance.now();
    function test() {
        frames++;
        const elapsed = performance.now() - start;
        if (elapsed < 2000) {
            requestAnimationFrame(test);
        } else {
            const fps = frames / (elapsed / 1000);
            if (fps < 40 && currentQuality !== 'low') stepDownQuality();
        }
    }
    requestAnimationFrame(test);
}

const miniCanvas = document.getElementById('minimap-canvas');
const miniCtx = miniCanvas.getContext('2d');

let world, vehicle, RAPIER;
let physReady = false;
let isGameRunning = true;
let hasScoopedDirt = false;
let jobCompleted = false;
let cameraShake = 0; 
// loads per job now come from Jobs.js (job.loads)
const hub = new AudioHub();
const audio = hub; // old name kept: Vehicle.updateVisuals(audio, dt) still receives it
function toggleMute() {
    const m = hub.toggleMute();
    window.dispatchEvent(new CustomEvent('bh-mute', { detail: !!m }));
    safe(() => { if (ui) ui.toast(m ? 'Sound off (press M to turn on)' : 'Sound on', m ? 'warn' : 'success'); });
}
// (Sfx2 removed in M2)
audio.playDirtCrunch = () => {};
audio.playScoop = () => {};
audio.playDumpThud = () => {};
audio.playSuccess = () => hub.complete();
let qaManager = null;

function loadSave() {
    const defaults = { coins: 0, engineLevel: 1, hydraulicLevel: 1, bucketLevel: 1 };
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) saveData = Object.assign(defaults, JSON.parse(raw)); } catch(e) { saveData = defaults; }
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(saveData)); } catch(e) {} }
loadSave();
document.getElementById('coin-count').textContent = saveData.coins;

function shopBtnText(kind, level) {
    const cost = upgradeCost(kind, level, 0);
    if (cost === null) return { text: 'MAX', off: true };
    return { text: `Level ${level}/${MAX_LEVEL}  -  ${cost} coins`, off: saveData.coins < cost };
}
function updateShopUI() {
    const pairs = [['engine', 'buy-engine-btn'], ['hydraulic', 'buy-hydraulic-btn'], ['bucket', 'buy-bucket-btn']];
    for (let i = 0; i < pairs.length; i++) {
        const kind = pairs[i][0], id = pairs[i][1];
        const el = document.getElementById(id);
        if (!el) continue;
        const lvl = saveData[kind + 'Level'] || 1;
        const st = shopBtnText(kind, lvl);
        el.textContent = st.text;
        el.disabled = st.off;
    }
    const rankEl = document.getElementById('shop-rank');
    if (rankEl && jobs) {
        const r = jobs.rankInfo();
        rankEl.textContent = 'Rank: ' + r.name + (r.next ? '  (' + r.into + '/' + r.need + ' XP to ' + r.next + ')' : '  (top rank)');
    }
}
function buyUpgrade(kind) {
    const key = kind + 'Level';
    const lvl = saveData[key] || 1;
    const cost = upgradeCost(kind, lvl, 0);
    if (cost === null || saveData.coins < cost) return;
    saveData.coins -= cost;
    saveData[key] = lvl + 1;
    writeSave();
    const cc = document.getElementById('coin-count'); if (cc) cc.textContent = saveData.coins;
    if (vehicle) vehicle.setUpgrades(saveData);
    updateShopUI();
    safe(() => { if (ui) ui.setCoins(saveData.coins); });
    safe(() => hub.coin());
}

const shopBtn = document.getElementById('shop-btn'); if(shopBtn) shopBtn.addEventListener('click', () => { document.getElementById('shop-overlay').classList.add('active'); isGameRunning = false; portal.gameplayStop(); updateShopUI(); });
const closeShopBtn = document.getElementById('close-shop-btn'); if(closeShopBtn) closeShopBtn.addEventListener('click', () => { document.getElementById('shop-overlay').classList.remove('active'); isGameRunning = true; portal.gameplayStart(); });

const buyEngBtn = document.getElementById('buy-engine-btn'); if(buyEngBtn) buyEngBtn.addEventListener('click', () => buyUpgrade('engine'));
const buyHydBtn = document.getElementById('buy-hydraulic-btn'); if(buyHydBtn) buyHydBtn.addEventListener('click', () => buyUpgrade('hydraulic'));
const buyBucketBtn = document.getElementById('buy-bucket-btn'); if(buyBucketBtn) buyBucketBtn.addEventListener('click', () => buyUpgrade('bucket'));

const input = { forward: false, backward: false, left: false, right: false, brake: false };

// ---- Pause (P key and the Pause / Resume buttons). The shop has its own pause. ----
let paused = false;
function togglePause() {
    const shop = document.getElementById('shop-overlay');
    if (shop && shop.classList.contains('active')) return;
    paused = !paused;
    isGameRunning = !paused;
    const ov = document.getElementById('pause-overlay');
    if (ov) ov.classList.toggle('active', paused);
    if (paused) {
        input.forward = false; input.backward = false; input.left = false; input.right = false; input.brake = false;
        safe(() => hub.setEngine(0, 0));
    }
    if (paused) portal.gameplayStop(); else portal.gameplayStart();
}
// tell the Sound button the saved mute state at start
safe(() => window.dispatchEvent(new CustomEvent('bh-mute', { detail: !!hub.isMuted() })));

// ---- Keys by physical position (event.code), so AZERTY and other layouts work ----
const CODE_TO_KEY = {
    KeyW: 'w', ArrowUp: 'arrowup', KeyS: 's', ArrowDown: 'arrowdown',
    KeyA: 'a', ArrowLeft: 'arrowleft', KeyD: 'd', ArrowRight: 'arrowright',
    Space: ' ', KeyE: 'e', KeyF: 'f', KeyC: 'c', KeyR: 'r', KeyM: 'm', KeyP: 'p', KeyJ: 'j'
};
function normKey(ev) {
    let k = CODE_TO_KEY[ev.code];
    if (k === undefined) k = (!ev.code || ev.code === 'Unidentified') ? (ev.key || '').toLowerCase() : '';
    return { key: k, repeat: ev.repeat };
}
// Release all driving keys if the window loses focus (prevents a stuck key)
window.addEventListener('blur', () => {
    input.forward = false; input.backward = false; input.left = false; input.right = false; input.brake = false;
});
const keyMap = { 'w': 'btn-w', 'arrowup': 'btn-w', 'a': 'btn-a', 'arrowleft': 'btn-a', 's': 'btn-s', 'arrowdown': 'btn-s', 'd': 'btn-d', 'arrowright': 'btn-d', 'e': 'btn-e', 'f': 'btn-f' };

window.addEventListener('keydown', (ev) => {
    if (ev.code === 'Backquote') { toggleDebugOverlay(); return; }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (isGameRunning && (ev.code === 'Space' || ev.code.startsWith('Arrow'))) ev.preventDefault();
    const e = normKey(ev);
    audio.init();
    const key = e.key.toLowerCase();
    if (e.repeat) return;
    if (key === 'w' || key === 'arrowup') input.forward = true;
    if (key === 's' || key === 'arrowdown') input.backward = true;
    if (key === 'a' || key === 'arrowleft') input.left = true;
    if (key === 'd' || key === 'arrowright') input.right = true;
    if (e.key === ' ') input.brake = true;
    if (key === 'r') window.restartJob();
    if (key === 'j') openJobPicker();
    if (key === 'm') toggleMute();
    if (key === 'p') {
      const wasPaused = paused;
      togglePause();
      if (paused !== wasPaused) {
        try {
          if (paused) { window.__muteBeforePause = hub.isMuted(); hub.setMuted(true); }
          else { hub.setMuted(!!window.__muteBeforePause); }
        } catch (e) { /* audio not ready */ }
      }
    }
    if (key === 'e' && vehicle) vehicle.toggleArm();
    if (key === 'f' && vehicle) vehicle.autoAction();
    if (key === 'c') {
        const modes = ['chase', 'orbit', 'cab', 'bucket'];
        let nextIndex = (modes.indexOf(cameraManager.currentMode) + 1) % modes.length;
        cameraManager.setMode(modes[nextIndex]);
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === modes[nextIndex]));
    }
    if (keyMap[key]) { const btn = document.querySelector(`.key[data-mobile="${keyMap[key]}"]`); if (btn) btn.classList.add('active-key'); }
});

window.addEventListener('keyup', (ev) => {
    const e = normKey(ev);
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'arrowup') input.forward = false;
    if (key === 's' || key === 'arrowdown') input.backward = false;
    if (key === 'a' || key === 'arrowleft') input.left = false;
    if (key === 'd' || key === 'arrowright') input.right = false;
    if (e.key === ' ') input.brake = false;
    if (keyMap[key]) { const btn = document.querySelector(`.key[data-mobile="${keyMap[key]}"]`); if (btn) btn.classList.remove('active-key'); }
});

document.querySelectorAll('.key').forEach(btn => {
    const action = btn.dataset.mobile;
    if(!action) return;
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault(); audio.init(); btn.classList.add('active-key');
        if (action === 'forward') input.forward = true;
        if (action === 'backward') input.backward = true;
        if (action === 'left') input.left = true;
        if (action === 'right') input.right = true;
        if (action === 'toggleArm' && vehicle) vehicle.toggleArm();
        if (action === 'toggleBucket' && vehicle) vehicle.autoAction();
    });
    const releaseBtn = (e) => {
        if(e) e.preventDefault(); btn.classList.remove('active-key');
        if (action === 'forward') input.forward = false;
        if (action === 'backward') input.backward = false;
        if (action === 'left') input.left = false;
        if (action === 'right') input.right = false;
    };
    btn.addEventListener('pointerup', releaseBtn);
    btn.addEventListener('pointerleave', releaseBtn);
});

document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        cameraManager.setMode(e.target.dataset.mode);
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
    });
});

// ============================================================
// JOBS + SITES + PORTAL (M8). One entry point: beginJob(id).
// ============================================================

// Move the sky, sun, fog and exposure to the venue of this job.
function applyVenue(job) {
    const v = venueFor(job.id);
    const sun = worldBuilder.sunLight;
    const hemi = worldBuilder.hemiLight;
    const sky = worldBuilder.sky;
    if (sun) {
        sun.color.set(v.sun.color);
        sun.intensity = v.sun.intensity;
        if (v.sky.sunDir) _sunOffset.set(v.sky.sunDir[0] * 0.55, Math.max(90, v.sky.sunDir[1]), v.sky.sunDir[2] * 0.55);
    }
    if (hemi) {
        hemi.intensity = v.hemi.intensity;
        hemi.color.set(v.hemi.sky);
        hemi.groundColor.set(v.hemi.ground);
    }
    if (sky && sky.material && sky.material.uniforms) {
        const u = sky.material.uniforms;
        u.topColor.value.set(v.sky.top);
        u.bottomColor.value.set(v.sky.bottom);
        u.sunColor.value.set(v.sky.sun);
        if (v.sky.sunDir) u.sunDirection.value.set(v.sky.sunDir[0], v.sky.sunDir[1], v.sky.sunDir[2]).normalize();
        u.exponent.value = v.key === 'storm' ? 1.1 : v.key === 'night' ? 0.9 : 0.6;
    }
    if (scene.fog) {
        if (scene.fog.color) scene.fog.color.set(v.fog.color);
        if (typeof scene.fog.density === 'number') scene.fog.density = v.fog.density;
    }
    if (scene.background && scene.background.set) scene.background.set(v.fog.color);
    renderer.toneMappingExposure = v.exposure;
}

// Mute the game while an ad plays, then restore whatever the player had.
function runAd(kind) {
    return new Promise((resolve) => {
        const req = kind === 'rewarded' ? portal.requestRewarded.bind(portal) : portal.requestMidgame.bind(portal);
        let settled = false;
        const done = (ok) => {
            if (settled) return;
            settled = true;
            inAd = false;
            safe(() => hub.setMuted(!!_muteBeforeAd));
            resolve(!!ok);
        };
        req({
            onStart: () => {
                inAd = true;
                isGameRunning = false;
                _muteBeforeAd = safe(() => hub.isMuted()) || false;
                safe(() => hub.setMuted(true));
            },
            onFinish: (ok) => done(ok)
        }).then((ok) => done(ok)).catch(() => done(false));
    });
}

function beginJob(id) {
    if (!jobs) return;
    if (panels) panels.hide();
    const ctx = jobCtx();
    let want = id;
    if (!FORCE_UNLOCK && jobs.lockReason(want, ctx)) want = jobs.lastPlayed();
    const job = jobs.start(want);

    currentJobId = job.id;
    maxLoads = job.loads;
    hasScoopedDirt = false;
    jobCompleted = false;
    lastLoads = 0;

    // ---- where does this job happen? (Jobs.js finds free ground in the city)
    jobs.layout(worldBuilder.buildingData, worldBuilder.propColliders);
    let site = jobs.siteFor(job.id);
    if (!site || !site.ok) site = { ok: true, keep: true };
    const pile = site.pile || { x: 0, z: -120 };
    const truck = site.truck || { x: pile.x + 15, z: pile.z };
    worldBuilder.moveJobSite(pile.x, pile.z, truck.x, truck.z);

    // ---- build the venue for this job
    applyVenue(job);
    if (!siteSys && world && RAPIER) siteSys = new SiteSystem(scene, world);
    if (siteSys) {
        try { siteSys.build(job.id, site, { world: world, RAPIER: RAPIER }); }
        catch (e) { console.warn('[site] build failed', e); }
    }

    // ---- reset the world state
    worldBuilder.resetDirtPile();
    if (worldBuilder.truckDirtMeshes) {
        worldBuilder.truckDirtMeshes.forEach(mesh => worldBuilder.truckGroup.remove(mesh));
    }
    worldBuilder.truckDirtMeshes = [];
    worldBuilder.truckDirtLevel = 0;

    if (vehicle && physReady) {
        vehicle.chassisBody.setTranslation({ x: START.x, y: START.y, z: START.z }, true);
        vehicle.chassisBody.setRotation({ x: 0, y: 1, z: 0, w: 0 }, true);
        vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        vehicle.chassisBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        vehicle.resetInterpolation();
        vehicle.hasDirt = false;
        vehicle.bucketDirtGroup.children.forEach(c => c.visible = false);
        vehicle.pilePos = worldBuilder.dirtPileGroup.position;
        vehicle.truckPos = worldBuilder.truckGroup.position.clone().add(new THREE.Vector3(0, 2, -1));
    }

    safe(() => { if (fx) fx.reset(); lastTarget = 'none'; });

    // ---- HUD
    if (ui) {
        ui.setJob(job.name, job.objective(), jobs.stepText());
        ui.setTimer(job.time);
        ui.setCoins(saveData.coins);
        lastCoinsShown = saveData.coins;
    }
    const missionDesc = document.getElementById('mission-desc'); if (missionDesc) missionDesc.textContent = job.story;
    const titleEl = document.querySelector('.mission-title'); if (titleEl) titleEl.textContent = job.name;
    const overlay = document.getElementById('victory-overlay'); if (overlay) overlay.classList.remove('active');

    if (panels) panels.briefing(job, 4200);

    paused = false;
    isGameRunning = true;
    const pauseOv = document.getElementById('pause-overlay'); if (pauseOv) pauseOv.classList.remove('active');
    portal.gameplayStart();
    safe(() => hub.setEngine(0, 0));
}
window.beginJob = beginJob;                 // console / debug
window.restartJob = () => beginJob(currentJobId);

function finishJob() {
    if (jobCompleted || !jobs) return;
    jobCompleted = true;
    const job = jobs.current;
    const r = jobs.complete(jobCtx());

    saveData.coins += r.coins;
    writeSave();
    lastCoinsShown = saveData.coins;
    const cc = document.getElementById('coin-count'); if (cc) cc.textContent = saveData.coins;
    if (ui) { ui.setTimer(null); ui.setJob(job.name, job.objective(), 'COMPLETE!'); ui.setCoins(saveData.coins); }

    safe(() => hub.complete());
    safe(() => { if (fx) fx.onDump(worldBuilder.truckGroup.position.clone(), worldBuilder.truckGroup.position.clone()); });
    portal.happytime();
    portal.gameplayStop();
    isGameRunning = false;
    cameraShake = 0.6;

    if (panels) {
        panels.showResult(r, {
            onNext: (nextId) => {
                const target = nextId || job.id;
                runAd('midgame').then(() => beginJob(target));
            },
            onReplay: () => beginJob(job.id),
            onJobs: () => openJobPicker()
        });
    }
}

function onJobFail() {
    if (!jobs || !panels) return;
    isGameRunning = false;
    portal.gameplayStop();
    safe(() => hub.setEngine(0, 0));
    if (ui) ui.toast('Time is up!', 'warn');
    const canAd = portal.ready;
    panels.showFail(jobs.current, jobs.state.loads, {
        onRetry: () => beginJob(currentJobId),
        onAd: canAd ? () => {
            panels.hide();
            runAd('rewarded').then((ok) => {
                if (ok) {
                    jobs.addTime(60);
                    isGameRunning = true;
                    portal.gameplayStart();
                    if (ui) ui.toast('+60 seconds. Go!', 'success');
                } else {
                    beginJob(currentJobId);
                }
            });
        } : null,
        onJobs: () => openJobPicker()
    });
}

function openJobPicker() {
    if (!jobs || !panels) return;
    panels.hide();
    isGameRunning = false;
    portal.gameplayStop();
    jobs.layout(worldBuilder.buildingData, worldBuilder.propColliders);
    panels.showPicker(jobs, jobCtx(), {
        onPick: (id) => beginJob(id),
        onCoins: (amt) => {
            saveData.coins += amt;
            writeSave();
            if (ui) ui.setCoins(saveData.coins);
            lastCoinsShown = saveData.coins;
            const cc = document.getElementById('coin-count'); if (cc) cc.textContent = saveData.coins;
            safe(() => hub.coin());
            safe(() => { if (ui) ui.toast('Daily bonus +' + amt + ' coins', 'success'); });
        },
        onClose: () => {
            isGameRunning = true;
            portal.gameplayStart();
        }
    });
}
window.openJobs = openJobPicker;

const restartBtn = document.getElementById('restart-btn');
if (restartBtn) restartBtn.addEventListener('click', () => beginJob(currentJobId));
const victoryReplayBtn = document.getElementById('victory-replay-btn');
if (victoryReplayBtn) victoryReplayBtn.addEventListener('click', () => beginJob(currentJobId));
const jobsBtn = document.getElementById('jobs-btn');
if (jobsBtn) jobsBtn.addEventListener('click', openJobPicker);

async function initPhysics() {
    try {
        const RAPIER_MODULE = await import('@dimforge/rapier3d-compat');
        RAPIER = RAPIER_MODULE.default; await RAPIER.init();
        world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); world.timestep = 1/60;
        worldBuilder.createPhysicsColliders(world, RAPIER);
        vehicle = new Vehicle(scene, world, RAPIER); vehicle.setUpgrades(saveData);
        physReady = true;

        qaManager = new QAManager(scene, camera, renderer, vehicle, worldBuilder);
        portal.loadingStop();

        document.getElementById('loading-screen').classList.add('hidden');
        // the first job starts from updateUi() once the UI exists
    } catch (e) {
        console.error(e);
        portal.loadingStop();
        document.getElementById('loading-screen').classList.add('hidden');
    }
}

// The portal is initialised while the loading screen is still up (CG requirement).
async function bootPortal() {
    try {
        portal.loadingStart();
        portal.setMuteHandler((on) => {
            if (!on) return;
            safe(() => hub.setMuted(true));
            safe(() => { if (ui) ui.toast('Sound is muted by CrazyGames', 'warn'); });
            safe(() => window.dispatchEvent(new CustomEvent('bh-mute', { detail: true })));
        });
        await portal.init();
    } catch (e) { console.warn('[portal] boot failed', e); }
}
bootPortal();
initPhysics();

// ==========================================
// ADVANCED GPS MINIMAP DRAWING
// ==========================================
function drawMinimap() {
    if (!vehicle) return;
    
    miniCtx.clearRect(0, 0, 180, 180);
    const cx = 90, cy = 90, scale = 0.4;
    const vx = vehicle.mesh.position.x, vz = vehicle.mesh.position.z;
    
    miniCtx.strokeStyle = "rgba(77, 225, 193, 0.15)"; 
    miniCtx.lineWidth = 1;
    miniCtx.beginPath();
    miniCtx.arc(cx, cy, 40, 0, Math.PI * 2); miniCtx.stroke();
    miniCtx.beginPath();
    miniCtx.moveTo(cx, 0); miniCtx.lineTo(cx, 180);
    miniCtx.moveTo(0, cy); miniCtx.lineTo(180, cy);
    miniCtx.stroke();

    // M8: the map points at the real pile / truck of the current job,
    // wherever the job site is (every job happens somewhere else now).
    const pileP = worldBuilder && worldBuilder.dirtPileGroup ? worldBuilder.dirtPileGroup.position : null;
    const truckP = worldBuilder && worldBuilder.truckGroup ? worldBuilder.truckGroup.position : null;
    const goal = (vehicle.hasDirt && truckP) ? truckP : pileP;
    const targetX = goal ? goal.x : 0;
    const targetZ = goal ? goal.z : -100;

    const mx = cx + (targetX - vx) * scale;
    const my = cy + (targetZ - vz) * scale;
    
    miniCtx.strokeStyle = "#4de1c1";
    miniCtx.lineWidth = 2;
    miniCtx.setLineDash([6, 6]);
    miniCtx.lineDashOffset = -Date.now() / 50;
    miniCtx.beginPath();
    miniCtx.moveTo(cx, cy);
    
    const distToCenter = Math.hypot(mx - cx, my - cy);
    const maxRadius = 85;

    // the blue truck is always marked, so you can line up the dump
    if (truckP && !vehicle.hasDirt) {
        const tx = cx + (truckP.x - vx) * scale;
        const ty = cy + (truckP.z - vz) * scale;
        if (Math.hypot(tx - cx, ty - cy) <= maxRadius) {
            miniCtx.fillStyle = '#2563eb';
            miniCtx.fillRect(tx - 4, ty - 4, 8, 8);
            miniCtx.strokeStyle = 'rgba(255,255,255,0.8)';
            miniCtx.lineWidth = 1;
            miniCtx.strokeRect(tx - 4, ty - 4, 8, 8);
        }
    }
    
    let drawMx = mx;
    let drawMy = my;
    
    if (distToCenter > maxRadius) {
        const angle = Math.atan2(my - cy, mx - cx);
        drawMx = cx + Math.cos(angle) * maxRadius;
        drawMy = cy + Math.sin(angle) * maxRadius;
    }
    
    miniCtx.lineTo(drawMx, drawMy);
    miniCtx.stroke();
    miniCtx.setLineDash([]);

    if (distToCenter <= maxRadius) {
        miniCtx.fillStyle = vehicle.hasDirt ? "#2563eb" : "#ff3333";
        miniCtx.beginPath();
        miniCtx.arc(mx, my, 5, 0, Math.PI * 2);
        miniCtx.fill();
    } else {
        miniCtx.fillStyle = vehicle.hasDirt ? "#2563eb" : "#ff3333";
        miniCtx.beginPath();
        miniCtx.arc(drawMx, drawMy, 4, 0, Math.PI * 2);
        miniCtx.fill();
    }

    miniCtx.save(); 
    miniCtx.translate(cx, cy);
    const euler = new THREE.Euler().setFromQuaternion(vehicle.mesh.quaternion, 'YXZ'); 
    miniCtx.rotate(-euler.y);
    
    miniCtx.fillStyle = "#ffffff"; 
    miniCtx.shadowColor = "#4de1c1";
    miniCtx.shadowBlur = 10;
    miniCtx.beginPath(); 
    miniCtx.moveTo(0, -8); 
    miniCtx.lineTo(6, 8); 
    miniCtx.lineTo(0, 4);
    miniCtx.lineTo(-6, 8); 
    miniCtx.closePath();
    miniCtx.fill(); 
    miniCtx.restore();
}

// ---- Keep the camera in front of buildings (no more wall blocking the view) ----
const _camFocus = new THREE.Vector3();
const _camDir = new THREE.Vector3();
let camClearT = 1;
function keepCameraClear(dt) {
    if (!vehicle || !worldBuilder || !worldBuilder.buildingData) return;
    if (cameraManager.currentMode === 'cab') { camClearT = 1; return; }
    _camFocus.copy(vehicle.mesh.position);
    _camFocus.y += 2.2;
    _camDir.copy(camera.position).sub(_camFocus);
    const len = _camDir.length();
    if (len < 0.5) return;
    const o = [_camFocus.x, _camFocus.y, _camFocus.z];
    const d = [_camDir.x, _camDir.y, _camDir.z];
    const margin = 0.6;
    let tHit = 1;
    const boxes = worldBuilder.buildingData;
    for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        const c = [b.x, b.y, b.z];
        const h = [b.w / 2 + margin, b.h / 2 + margin, b.d / 2 + margin];
        let tmin = 0, tmax = 1, ok = true, inside = true;
        for (let a = 0; a < 3; a++) {
            const lo = c[a] - h[a], hi = c[a] + h[a];
            if (o[a] < lo || o[a] > hi) inside = false;
            if (Math.abs(d[a]) < 1e-8) {
                if (o[a] < lo || o[a] > hi) { ok = false; break; }
            } else {
                let t1 = (lo - o[a]) / d[a], t2 = (hi - o[a]) / d[a];
                if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
                if (t1 > tmin) tmin = t1;
                if (t2 < tmax) tmax = t2;
                if (tmin > tmax) { ok = false; break; }
            }
        }
        if (!ok || inside) continue;
        if (tmin > 0 && tmin < tHit) tHit = tmin;
    }
    const want = tHit < 1 ? Math.max(0.12, tHit - 0.04) : 1;
    if (want < camClearT) camClearT = want;
    else camClearT += (want - camClearT) * Math.min(1, dt * 4);
    if (camClearT < 0.999) {
        camera.position.copy(_camFocus).addScaledVector(_camDir, camClearT);
    }
}

const clock = new THREE.Clock();

// ---- Fixed 60 Hz physics (same speed on 30, 60, 144, 165, 240 Hz screens) ----
const FIXED_DT = 1 / 60, MAX_STEPS = 6;
let physAcc = 0;
function advanceAccumulator(acc, frameDt) {
    acc += Math.min(frameDt, 0.1);
    let steps = 0;
    while (acc >= FIXED_DT - 1e-9 && steps < MAX_STEPS) { acc -= FIXED_DT; steps++; }
    if (steps === MAX_STEPS && acc >= FIXED_DT) acc = 0;
    return { acc, steps };
}

// Console test: type __testTimestep() in the F12 console. Every row must show 60.0
window.__testTimestep = function () {
    const rates = [30, 60, 75, 120, 144, 165, 240];
    const seconds = 10;
    const rows = rates.map((hz) => {
        let acc = 0, total = 0;
        const frames = hz * seconds;
        for (let i = 0; i < frames; i++) { const r = advanceAccumulator(acc, 1 / hz); acc = r.acc; total += r.steps; }
        return { refreshHz: hz, stepsPerSecond: (total / seconds).toFixed(1) };
    });
    console.table(rows);
    return rows;
};

// Debug overlay: press the Backquote key (`). Only in dev mode or with ?debug in the URL
const DEBUG_ENABLED = !!import.meta.env.DEV || new URLSearchParams(location.search).has('debug');
let dbgEl = null, dbgSteps = 0, dbgFrames = 0, dbgTime = 0;
function toggleDebugOverlay() {
    if (!DEBUG_ENABLED) return;
    if (!dbgEl) {
        dbgEl = document.createElement('div');
        dbgEl.style.cssText = 'position:fixed;left:8px;top:64px;z-index:2000;padding:4px 8px;background:rgba(0,0,0,0.65);color:#7cfc9a;font:12px/1.4 monospace;pointer-events:none;border-radius:4px;';
        dbgEl.textContent = 'physics -- steps/s | render -- fps';
        document.body.appendChild(dbgEl);
    } else {
        dbgEl.style.display = dbgEl.style.display === 'none' ? 'block' : 'none';
    }
}
function debugTick(frameDt, stepsThisFrame) {
    dbgSteps += stepsThisFrame; dbgFrames++; dbgTime += frameDt;
    if (dbgTime >= 1) {
        if (dbgEl && dbgEl.style.display !== 'none') {
            dbgEl.textContent = 'physics ' + (dbgSteps / dbgTime).toFixed(1) + ' steps/s | render ' + (dbgFrames / dbgTime).toFixed(0) + ' fps | ' + hub.debugText();
        }
        dbgSteps = 0; dbgFrames = 0; dbgTime = 0;
    }
}

function initFx() {
    safe(() => {
        fx = new JobEffects(scene, camera, worldBuilder, vehicle);
        guide = new Guidance(scene, camera, renderer);
        sfx = { scoop() {}, complete() {}, coin() { hub.coin(); } };
        guide.startTutorial(); tutStep = 1;
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 60, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        beam.visible = false; scene.add(beam); scene.userData.beam = beam;
        const maxA = renderer.capabilities.getMaxAnisotropy();
        scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { if (m.map) { m.map.anisotropy = maxA; m.map.needsUpdate = true; } }); });
    });
}
function updateFx(dt) {
    if (!fx && !guide) initFx();
    safe(() => {
        if (fx) fx.update(dt);
        if (guide) {
            let key = 'none', pos = null;
            if (!jobCompleted) {
                if (vehicle.hasDirt) { key = 'truck'; pos = worldBuilder.truckGroup.position.clone(); }
                else { key = 'pile'; pos = worldBuilder.dirtPileGroup.position.clone(); }
            }
            if (key !== lastTarget) { lastTarget = key; guide.setTarget(pos); }
            const bm = scene.userData.beam;
            if (bm) { bm.visible = false; if (pos) { bm.position.set(pos.x, 30, pos.z); bm.material.opacity = 0.16 + 0.08 * Math.sin(performance.now() / 300); } }
            if (tutStep === 1 && pos && vehicle.mesh.position.distanceTo(worldBuilder.dirtPileGroup.position) < 25) { guide.nextTutorialStep(); tutStep = 2; }
            guide.update(dt);
        }
    });
}
function animate() {
    requestAnimationFrame(animate);
    const frameDt = clock.getDelta();
    if (isGameRunning && physReady && world && vehicle) {
        const dt = Math.min(frameDt, 0.05);
        const adv = advanceAccumulator(physAcc, frameDt);
        physAcc = adv.acc;
        for (let s = 0; s < adv.steps; s++) {
            vehicle.updateController(input, FIXED_DT);
            world.step();
            vehicle.capturePhysicsState();
        }
        vehicle.renderAlpha = Math.max(0, Math.min(1, physAcc / FIXED_DT));
        debugTick(frameDt, adv.steps);
        // physics now runs in the fixed-step loop above
        // physics step moved to the fixed-step loop above
        vehicle.updateVisuals(audio, dt);
        cameraManager.update(vehicle.mesh, dt, vehicle.currentSpeed);
        keepCameraClear(dt);
        if (worldBuilder.sky) worldBuilder.sky.position.copy(camera.position);
        drawMinimap();

        const speedValEl = document.getElementById('speed-val');
        if (speedValEl) speedValEl.textContent = vehicle.currentSpeed;
        
        const speedBarEl = document.getElementById('speed-bar');
        if (speedBarEl) {
            const percentage = Math.min(100, (vehicle.currentSpeed / 120) * 100);
            speedBarEl.style.width = `${percentage}%`;
        }

        if (cameraShake > 0) {
            camera.position.x += (Math.random() - 0.5) * cameraShake;
            camera.position.y += (Math.random() - 0.5) * cameraShake;
            camera.position.z += (Math.random() - 0.5) * cameraShake;
            cameraShake -= dt * 2; 
        }

        if (input.forward || input.backward) hub.setEngine(vehicle.currentSpeed, 1);
        else hub.setEngine(vehicle.currentSpeed, 0);

        if (!jobCompleted) {
            const bucketPos = new THREE.Vector3(); vehicle.bucketPivot.getWorldPosition(bucketPos);
            
            if (!hasScoopedDirt && vehicle.hasDirt) {
                hasScoopedDirt = true;
                if (jobs) jobs.setPhase('dump');
                if (ui && jobs) ui.setJob(jobs.current.name, jobs.objective(), jobs.stepText());
                else { const statusVal = document.getElementById('job-status-val'); if (statusVal) statusVal.textContent = 'DUMP IN TRUCK'; }
                worldBuilder.shrinkDirtPile();
                safe(() => { if (fx) fx.onScoop(bucketPos.clone()); if (sfx) sfx.scoop(); if (guide && tutStep === 2) { guide.nextTutorialStep(); tutStep = 3; } }); 
                audio.playDirtCrunch(); 
            }

            if (hasScoopedDirt && !vehicle.hasDirt) {
                const truckBedPos = worldBuilder.truckGroup.position.clone().add(new THREE.Vector3(0, 2, -1));
                if (hasScoopedDirt && !vehicle.hasDirt && bucketPos.distanceTo(truckBedPos) >= 10) { hasScoopedDirt = false; safe(() => { if (ui) ui.toast('Missed the truck - scoop again', 'warn'); }); }
                if (bucketPos.distanceTo(truckBedPos) < 10) {
                    hasScoopedDirt = false;
                    worldBuilder.addDirtToTruck();
                    audio.playDumpThud();
                    safe(() => { if (fx) fx.onDump(worldBuilder.truckGroup.position.clone(), bucketPos.clone()); if (sfx) sfx.coin(); if (guide && tutStep === 3) { guide.nextTutorialStep(); tutStep = 4; } });
                    cameraShake = 0.5;
                    
                    // real load accounting comes from Jobs.js (loads, tips, stars)
                    const res = jobs ? jobs.addLoad(jobCtx()) : null;
                    if (res) {
                        if (res.tip) {
                            saveData.coins += res.tip;
                            writeSave();
                            if (ui) ui.setCoins(saveData.coins);
                            lastCoinsShown = saveData.coins;
                            const cc = document.getElementById('coin-count'); if (cc) cc.textContent = saveData.coins;
                        }
                        if (ui) ui.setJob(jobs.current.name, jobs.objective(), jobs.stepText());
                        audio.playScoop();
                        if (res.loads < res.total && ui) ui.toast('Load ' + res.loads + '/' + res.total + '  +' + res.tip + ' coins', 'success');
                    }
                    if (worldBuilder.truckDirtLevel >= maxLoads) finishJob();
                }
            }
        }
        updateSunShadow();
        trackFPS(dt);
        updateFx(dt);
        if (siteSys) safe(() => siteSys.update(dt, vehicle.mesh.position));
        vehicle.pilePos = worldBuilder.dirtPileGroup.position;
        vehicle.truckPos = worldBuilder.truckGroup.position.clone().add(new THREE.Vector3(0, 2, -1));
        updateUi(dt);
        updateDig(dt);
        renderFrame();
    }
}
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});
animate();


