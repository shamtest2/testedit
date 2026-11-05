# CONTINUE.md - FULL HANDOFF FOR A NEW AI CHAT (zero context needed)

Written at the end of a very long chat, after M3e was saved (commit bac5f1c).
If this file and HANDOFF.md disagree, ask the user. The opening master prompt wins over both
(the user may paste it again; if the user does not have it, HANDOFF.md sections 3 to 6 are the spec).

======================================================================
## 0. READ THIS FIRST (instructions for the new AI)
======================================================================
You are the LEAD ENGINEER AND QA of the browser game "TerraForm 3D" (a backhoe-loader simulator
for the CrazyGames portal). You write ALL code. The user cannot code.

Your first reply in a new chat must be SHORT:
 1. Say you read this file.
 2. Say in 3 lines what the state is (section 3).
 3. Ask the user to send ONE file: src/docs/HANDOFF.md (Executor Files tab -> tick it -> Copy selected -> paste).
 4. Wait. Do not write code until you know which task the user wants. Default next task: section 12.

Never guess about code you have not seen. If you need a file, ask for exactly ONE file at a time.
Files you have NOT seen in detail (ask when needed): src/main.js (about 795 lines), index.html (about 704 lines),
src/gameplay/* (GameUI, Guidance, JobManager, JobEffects, LevelSystem, MissionManager, QAManager), src/core/Portal.js.

======================================================================
## 1. THE USER (very important)
======================================================================
- Non-technical. He only copies, pastes, clicks, plays and reports. He cannot read code or debug.
- English is poor, typos are normal (example: "yrah not abl eot to walk thorugh tress"). Read for meaning.
  Answer in SIMPLE, SHORT English. Give a short numbered list of clicks. Give a summary first.
- Uses Brave on Windows, QWERTY keyboard, about 1910x900 window, 144 Hz screen. No phone.
  Mobile layout is tested in F12 device mode (Ctrl+Shift+M).
- Works in a GitHub Codespace (repo testsharm/gameprotype, branch clean-v1).
- Chats are on a website that limits attachments: pasting 4 files at once or a PDF failed.
  RULE: ask for ONE file per message. Work on ONE task at a time.
- He wants: more depth, HD quality, a rich 3D city, all buttons and sounds working, no conflicts,
  mobile friendly, a heavy and solid backhoe (not a balloon). He wants you to be fast and not repeat mistakes.
- He complained when: code was split in several boxes; some code was outside the box; a reply had no code when he
  expected code; code files got shorter than before; too many small terminal commands were requested.
- Never ask him to run terminal commands to inspect things. To see a file: ask him to tick it in the Executor
  Files tab and click "Copy selected". ONE terminal command is allowed only at the very end for deleting old files.
- He wants keys explained visually (emoji or ASCII art). The backquote ` key is left of the number 1.
  He must click the game first, then press it. It toggles the green debug text under the coin box.
- He removed the word "jcb" from visible text (copyright). NEVER show "JCB" to players. Say "backhoe loader".
  Internal names (this.mode = 'jcb', jcbGroup, if (this.mode === 'jcb')) still exist in Vehicle.js. Do not use them
  in FIND strings if you can avoid it. Clean at the end.

======================================================================
## 2. HOW WE WORK (the protocol)
======================================================================
Tools:
- "Executor" = a small local web tool (tools/executor.cjs, port 3002) in the Codespace. Tabs: Apply (tab 1), Files, etc.
  The user pastes your reply into the Apply tab, clicks Preview, then Apply, then runs "Check project".
  Buttons: Undo last apply, Save to GitHub (commits and pushes to branch clean-v1), Copy selected (Files tab).
- Ports: 3002 Executor, 5173 live game (Vite dev), 4173 preview.
- If the Executor shows a red dot, the user runs this ONE command in the Codespace terminal:
  cd "$(git rev-parse --show-toplevel)"; pkill -f executor.cjs; nohup node tools/executor.cjs > .executor.log 2>&1 & sleep 2; cat .executor.log

HOW YOU DELIVER CODE (strict):
- Put EVERYTHING the user must paste inside EXACTLY ONE fenced code block. Use a FOUR-backtick fence
  (the content may contain triple backticks). Put explanations OUTSIDE the box. Tell him to use the Copy button.
- Inside the box, marker lines must start at the very first character of a line:
    Full file: a line "@@@ FILE path @@@", then the whole file, then a line "@@@ END @@@".
    Small change: a line "@@@ EDIT path @@@", a line "--- FIND ---", the old text, a line "--- REPLACE ---",
    the new text, then "@@@ END @@@". The FIND text must appear EXACTLY ONCE in the file. Multi-line FIND works.
- All blocks in one paste apply, or none do. The Executor refuses a file that would shrink under 50%,
  and refuses cut-off answers. It checks syntax only for .js, .mjs, .cjs, .json.
- It cannot delete files.
- NEVER write a line that starts with those marker words inside a document or file body (it would be parsed as a marker).
- Prefer EDIT blocks for small changes. Milestone-sized answers (500 to 2000 lines) are fine. Do NOT shrink files.
- After every answer that changes anything, include in the same box: an updated "@@@ FILE src/docs/STATE.md @@@" block,
  and an EDIT that appends to the session log in THIS file (section 17, find the line SESSION LOG END MARKER).
  Change HANDOFF.md only with EDIT blocks and note it in its section 14.
- After the box, write a REPORT: DONE, VERIFIED, NOT VERIFIED, RISKS, NEXT.
- Never say "fixed" or "done" without evidence (screenshot, console text, pasted output, a number on screen).
  Say "applied, awaiting your test".
- One milestone at a time. After each: Apply, Check project, user plays and reports, user clicks Save to GitHub.
- Safe habit: after any strange result, tell him to click "Undo last apply" first and investigate second.

The user's test loop: Preview -> Apply -> Check project -> reload game with Ctrl+Shift+R -> play -> send the Apply
result, the Check result, answers and screenshots (1 or 2) -> Save to GitHub.

======================================================================
## 3. PROJECT IN ONE PAGE
======================================================================
Game: TerraForm 3D. Browser backhoe-loader simulator for CrazyGames (Basic Launch first, ads off, SDK optional).
Stack: Three.js, @dimforge/rapier3d-compat (NOT cannon-es), Vite 8, plain JS ES modules. No new packages.
Every file that uses THREE must have: import * as THREE from 'three';
three/examples/jsm/geometries/RoundedBoxGeometry.js is part of three and works.
No external fonts, images or scripts (except the CrazyGames SDK script). Relative paths only. localStorage in try/catch.
No orientation-lock code, no "rotate your phone" overlay. No custom fullscreen button. Never use Escape or Ctrl+W.
Do not force-push main.

Core loop: drive to the dirt pile, press ACTION for a 3 second eased scoop, drive to the blue truck, press ACTION
for a 3 second dump, earn coins. 5 jobs plus a Skill Course. The game boots straight into Job 1.
Stars: 3 if over 50% of the time is left, 2 if over 20%, else 1. Repeat rewards are 40%.
Upgrades: Engine, Hydraulics, Bucket, 3 levels each. Prices 100/250/500, 100/250/500, 150/300/600.
Base top speed 32 km/h, +5 per engine level, reverse 14 km/h.
Controls: W A S D and arrows, Space = brake, F or E = action, C = camera, P = pause, R = restart, M = mute.
HUD style: dark navy glass panels rgba(15,23,42,0.75), amber #fbbf24, system-ui font, min 16 px text,
readable at 800x450 and DPR 1.
Audio: ONE AudioContext, all sounds synthesized, resume on first input and on touchend, music ducks 50% during a dump,
no sound before first input or while the page is hidden.
Anti-flicker rules: no geometry thinner than 0.3 units; road lines painted in ONE canvas texture; window atlas with
mipmaps and anisotropy 8; layers 0.02 apart plus polygonOffset; fog on; antialiasing on;
logarithmicDepthBuffer OFF unless a test proves it helps.
CrazyGames facts (docs read earlier): initial download max 50 MB (20 MB mobile), max 1500 files; physics must be
consistent at 144 and 165 Hz; add user-select:none to body; audioContext.resume() inside a click or touchend handler;
the portal handles the rotate prompt and fullscreen; no flicker or graphical defects; consistent art style.
Not yet read (read BEFORE the milestone): /sdk/game and /sdk/data (M6), /requirements/game-covers and
/resources/getting-to-the-first-frame (M9), /requirements/ads (later).

Target file list (HANDOFF sec 6): core/Game.js, Events.js, Input.js, Audio.js (export class AudioHub), Portal.js,
World.js, Vehicle.js, DigAnimator.js, CameraManager.js; gameplay/Jobs.js, Effects.js; ui/Hud.js, SkillCourse.js,
TrafficPhysics.js (really at src/core/TrafficPhysics.js), QAManager.js. Keep the number of source files low.

======================================================================
## 4. MILESTONE STATUS
======================================================================
SAVED TO GITHUB (verified by the user's screenshots or reports):
- M0 baseline.
- M1 (commit ba986e2): fixed physics timestep 60 Hz, keys read by event.code (works on AZERTY), blur clears keys,
  debug overlay (backquote key), user-select:none.
- M2: audio hub (v2 accepted with notes).
- M3a: city, roads, garage, job site, props, traffic.
- M3b-1: machine model. M3b-2: camera. M3b-2b / M3b-2c: cab fixes and smoke redesign.
- M3c: far skyline (about 260 windowed buildings). Commit 6109b67.
- M3d (commit f3f7173): solid props, traffic collider fix, slower traffic. User confirmed: trees, poles and parked cars
  stop the machine; moving cars do not bounce it like a balloon; cars slower.
- M3e (commit bac5f1c): 5 new building styles, bluer sky, own fog, stronger smoke and dust.
  User screenshots show different building styles and colours, bluer sky, far view, visible dust.

APPLIED, AWAITING TEST (this answer): top speed 32 km/h forward, reverse 14 km/h (Vehicle.js, 2 edits), CONTINUE.md.
 Acceptance: the dial stops near 32 on a straight road; reverse stops near 14.

REMAINING (in order, see section 12 for details):
- M3f optional: car variety (vans, trucks), garage/yard detail, driver seat.
- M3b-3: dig animation tweaks (only if the user asks; DigAnimator is already eased).
- M4: HUD and screens, slim index.html, mobile layout.
- M5: Input and mobile touch controls.
- M6: Portal minimal.
- M7: Jobs, economy, shop, daily bonus, tutorial.
- M8: Skill course, quality tiers, performance and size, engine sound polish.
- M9: submission pack.
Files to delete at the end: see section 14.

======================================================================
## 5. ENVIRONMENT FACTS
======================================================================
- Repo testsharm/gameprotype, branch clean-v1. Broken old state kept on branch snapshot-1102-0420 (do not use).
- 24 JS files (before new ones). vite build OK in about 1 s, dist about 4.95 MB (main chunk 834 KB, rapier chunk 4.3 MB).
- Warnings that are low priority: vite.config.js ESM in a CommonJS file; "chunks over 500 kB".
- Console red lines that are fine: favicon.ico 404 (fix in M9); "Could not establish connection. Receiving end does not
  exist" (a Brave extension); "CrazySDK is not initialized yet" (expected outside the portal).
- Debug box (backquote key) shows e.g. "physics 60.0 steps/s | render 144 fps", "audio running",
  "contexts 1 | duck 1.00", "rpm 0.36 | muted no".
- Last apply backups: M3d 2026-11-03T14-44-32-903Z-xj0, M3e 2026-11-03T14-54-06-044Z-me6.

======================================================================
## 6. FILE-BY-FILE FACTS
======================================================================

### src/core/World.js (about 1601 lines after M3e)
Seeded RNG makeRng(20241102) so the city is the same every load (but any change in the number of random calls
shifts the layout - this is normal).
Constants: FLOOR_H = 3.5, BAY_W = 3, Y0 = 0.05, ROAD_POS = [-240,-160,-80,80,160,240], ROAD_HALF = 12,
WORLD_EDGE = 1000, ANISO = 8.
Helpers: makeCanvas, finishTexture (mipmaps, anisotropy), class GeoBuf (merged geometry), upQuad, wallQuad, boxWalls.
class World constructor order: createLighting, createTerrain, generateCityGrid (calls createRoads), createCentralGarageHub,
createJobSite, createOptimizedTraffic, createProps (calls createFarSkyline at its end), startTrafficAI.
- Lighting/sky: HemisphereLight, DirectionalLight with 2048 shadow map (range +-150). Sky dome radius 1000 with a shader
  (blue top 0x2f77c8, horizon 0xcfe2f3, fbm clouds, sun disc). main.js moves world.sky to the camera each frame.
  FOG: World creates FogExp2(0xcfe2f3, 0.0011) and LOCKS scene.fog with Object.defineProperty (setter does nothing),
  so main.js cannot change it. main.js also tries FogExp2 0.0020 - that is ignored now. Tidy in M4 (remove from main.js,
  remove the lock).
- Roads: two merged meshes at y = 0.02 (straight pieces, junctions) with painted textures (edge lines, yellow dashes,
  crosswalks). Ground polygonOffset +1, roads -1. Visual-only edge barriers at +-998.
- Facade styles (variants): 0 and 1 and 3 in makeFacadeTexture (plain window grids), 2 = glass curtain wall,
  4 = brick, 5 = concrete with window strips, 6 = sandstone with arched windows, 7 = vertical glass fins
  (2, 4, 5, 6, 7 are drawn in _facadeTexB). _pickTint(variant, R, list) gives colour sets per style.
  _facadeTex(v) caches one texture per variant. City uses 8 merged window meshes (winG), skyline uses 8 (G).
- City: blocks between roads (14% are parks), 2x2 lots per block, 1 to 3 tiers per building, store-front texture on the
  ground floor, roof mesh, instanced AC units, tanks and antennas. Instanced pavement plates (top at 0.12).
  Every tier is pushed into this.buildingData as a solid box {x,y,z,w,h,d}.
- Garage hub at (0,0): 5 m walls (back z=20, left x=-20, right x=20), no roof, sign gantry at z=-20 with a "GARAGE" sign,
  flat textured yard 100x100 and driveway at y = 0.03, workshop props.
- Job site at (0,-120): dirt patch, 45-clod cone pile (this._masterClods, this.allDirtClods), blue truck at (15,0,-120)
  with 2 solid boxes, 16 cones.
- Traffic: 70 cars, one body shape (box 2 x 0.8 x 4.5 + cabin). Each car has its own requestAnimationFrame loop
  (startTrafficAI) and follows lanes with gap logic. baseSpeed = 7 + R()*6 world units per second (25 to 47 km/h).
  Cars wrap at +-300. Fields: mesh, wheels, isXAxis, dir, speed, baseSpeed, roadPos, laneOffset.
- Props: street lights (instanced), traffic light poles, benches, bins, hydrants, trees (street trees and park trees),
  70 parked cars. All these push solid boxes into this.propColliders (about 1000 boxes).
- Far skyline: createFarSkyline places about 260 buildings between r 280 and 900 m, never on a road, never inside the
  city square. Each tier is a solid box in buildingData.
- createPhysicsColliders(world, RAPIER): ground cuboid (1000, 0.1, 1000), one fixed body with one cuboid collider per
  propColliders entry (friction 0.8, restitution 0), and one fixed body per buildingData box.
- Public fields: buildingData, buildingMeshes (empty), treeMeshes (empty), propColliders, dirtPileGroup, allDirtClods,
  _masterClods, trafficCars, truckGroup, truckDirtLevel, truckDirtMeshes, sunLight, hemiLight, blocks, sky,
  farBuildingCount. Methods: shrinkDirtPile, resetDirtPile, addDirtToTruck, createPhysicsColliders.

### src/vehicle/Vehicle.js (about 608 lines)
Rapier dynamic chassis, 7000 kg, cuboid collider (0.9, 0.3, 1.5), CCD on. 4 wheels (front r 0.35, rear r 0.55),
rear wheel drive (wheels 2 and 3), Rapier vehicle controller, stiff suspension.
Throttle ramp 0.35 s. Governor: top speed Math.min(32 + (engineMultiplier-1)*10, 60) km/h (engineMultiplier =
1 + (level-1)*0.5, so +5 km/h per level), reverse Math.min(14 + (engineMultiplier-1)*2, 28).
setUpgrades(saveData): engine multiplier 1 + (engineLevel-1)*0.5, hydraulics 1 + (hydraulicLevel-1)*0.6.
Model: createMesh with helpers put, box, rbox (RoundedBoxGeometry), cyl; standard materials; glass transparent.
Marked userData.cabHide = true: glass box, roof, roof gear, roof lights, exhaust stack and cap (CameraManager hides
them in CAB view only).
Public names: mesh, chassisBody, boomPivot, bucketPivot, bucketDirtGroup, wheelMeshes, exhaustTip (0.9, 3.55, 1.15),
beaconMesh, pilePos, truckPos, hasDirt, currentSpeed (rounded, non negative), scoopDirt, dropDirt, spawnDirtBurst,
autoAction, toggleArm, toggleBucket, capturePhysicsState, resetToSafe, updateController, updateVisuals.
Smoke: soft sprite puffs (spawnPuff, updatePuffs, pool max 160). Exhaust: rate (7 + power*15) per second, grey, scale
0.3 to 1.7+k, opacity 0.5+0.25k. Tyre dust: spawned from rear wheels while speed > 5, colour 0xb5a58a.
Dirt burst still uses small cubes.
Events sent: window CustomEvent 'bh-dig' (detail 'scoop' or 'dump') and 'bh-hint' (detail text).
Internal names mode = 'jcb', jcbGroup remain (see section 1).

### src/core/TrafficPhysics.js (about 87 lines)
export default class TrafficPhysics, constructor (world, RAPIER, trafficCars). init() makes one kinematicPositionBased body
per car. Collider half-size { x: 1, y: 0.8, z: 2.25 } centred at y = 1.0, friction 0.5, restitution 0.
update() sets the next kinematic translation and rotation from car.mesh. dispose() removes bodies.

### src/core/CameraManager.js (213 lines, v2)
new CameraManager(camera, canvas). Methods: setCollidables, setMode, currentMode, update(vehicleMesh, dt, speed).
Modes: orbit, chase, cab, bucket. CAB_EYE (0,2.4,-0.2), CAB_LOOK (0,1.4,20), CAB near 0.3.
Bucket mode offset (0,5,-12). Time based smoothing. FOV bonus max 12 at 40 km/h.
It binds .cam-btn clicks itself (duplicate with main.js - remove in M4).
Its building collision does nothing because main.js passes empty arrays to setCollidables.
main.js has keepCameraClear(dt) as a workaround (ray vs buildingData boxes).

### src/core/Audio.js (971 lines) - export class AudioHub
LEVELS = { master: 0.9, music: 0.3, ambience: 0.22, engine: 0.7, sfx: 0.8, reverb: 0.4 }.
Mute saved in localStorage key terraform_muted_v1. Own green debug box at left 8, top 104.
API: start, startAmbience, unlock, stop, setIntensity, setEngine(speedKmh, throttle), setMuted, toggleMute, toggle,
isMuted, duck(sec), dig(type, name), coin, complete, click, debugText.
No-op compatibility methods: init, playEngine, playScoop, playDumpThud, playDirtCrunch; playSuccess calls complete().
Engine: diesel knock, clatter, exhaust rumble, turbo whistle; reverse beeper when speed < -1.5; birds; gravel layer.
Known: engine is too loud and tractor-like (M8).
Dig events from DigAnimator: scoop: start, dig (1.3 s), fill (1.9), lift (1.9), end (3.0); dump: start, tip (0.8), drop (1.3),
thud (1.9), end (3.0).

### src/core/DigAnimator.js
export default class DigAnimator, constructor (vehicle, THREE), 3.0 s, eased (easeInOutCubic, easeOutCubic).
Methods onEvent, busy, start(type), update(dt). Sets boom and bucket rotation and window.__digBusy.

### src/main.js (about 795 lines, partly seen)
Imports Vehicle, AudioHub, CameraManager, World, QAManager, JobEffects, Guidance, DigAnimator, GameUI, TrafficPhysics,
JobManager and postprocessing passes. Contains the old HUD code and loose systems.
Facts: CODE_TO_KEY map and normKey(ev); FIXED_DT = 1/60, MAX_STEPS = 6, advanceAccumulator; window.__testTimestep();
debug overlay; const hub = new AudioHub(); const audio = hub; toggleMute with a toast; hub.dig(...) first line of
dig.onEvent; hub.setEngine(vehicle.currentSpeed, 1 or 0) every frame (currentSpeed is non-negative, so the reverse
beeper probably never fires); save key terraform_city_save_v6 = { coins, engineLevel, hydraulicLevel } (HUD shows 850);
MAX_LOADS = 3; 150 coins hardcoded on job complete; job title "Clear the Highway"; objective
"Load the blue truck with dirt"; window.restartJob respawns at (-35, 1.2, 10) and calls worldBuilder.resetDirtPile();
quality presets low/medium/high (bloom, vignette, MSAA 4); camera starts in 'bucket' mode; camera near 0.5, far 1400,
logarithmicDepthBuffer false; keepCameraClear(dt); sky follows the camera.
Old DOM ids: #shop-btn, #buy-engine-btn, #buy-hydraulic-btn, #coin-count, #speed-val, #speed-bar, #job-status-val,
#victory-overlay, #loading-screen, #minimap-canvas, #game-container, .cam-btn, .key[data-mobile].
UNVERIFIED: whether main.js calls trafficPhysics.update() every physics step (the balloon bounce is fixed, so it likely does).
JobEffects.js has its own CSS and DOM: .je-counter coin counter at bottom-left, .je-popup, .je-banner "JOB COMPLETE" with a
Next job button (+10 per dump). WorldPolish.js is unused dead code.

### index.html (about 704 lines, not fully seen)
Old HUD, a Google Fonts @import (REMOVE in M4: no external fonts), and a CrazyGames SDK script tag.

======================================================================
## 7. WHAT THE USER SEES TODAY (from the last screenshots)
======================================================================
Good: varied city skyline, blue sky, far view, trees, lamps, traffic lights, crosswalks, readable machine, dust trail,
dial works (showed 35 km/h before the 32 limit), minimap works, camera buttons work.
Bad / open:
- Stray "Clear" and "truck." text beside the mission card (duplicate HUD).
- Two coin counters: top-left 850 and bottom-left 0 (JobEffects, partly hidden by text).
- Speed dial (bottom centre) overlaps the W A S D key hints and a second speed readout.
- Camera buttons ORBIT / CHASE / CAB / BUCKET at the right edge are hard to read on light backgrounds.
- RESTART JOB button bottom-right touches the Windows watermark area (cosmetic).
- Garage and yard look plain (flat grey, two thin walls). Pavement is a big flat grey area.
- All 70 traffic cars look the same shape. Driver seat is plain.
- Dust behind the machine can look like dark smudges (judge again; may need a lighter colour).
- Machine from the orbit camera is small.

======================================================================
## 8. KNOWN ISSUES AND DEAD ENDS (do not repeat)
======================================================================
- Evening of 2026-11-01: many changes were applied at once with another AI plus DeepSeek; Vite failed (parse error at
  src/main.js:2158, a stray brace after main.js grew from 658 to about 2165 lines). User reverted. Lessons:
  do not apply many changes at once; do not split a task into many small new files; do not shrink files with big rewrites.
- Flicker: failed fixes were logarithmicDepthBuffer, camera near 1, MSAA 4, anisotropy alone. M3a applied the rules
  (painted roads, polygonOffset, merged geometry, no thin strips) and the user confirmed no flicker.
  Near plane lesson: CAB near 0.15 made far roads flicker, so it is 0.3.
- Before M1 physics stepped once per frame (2.4x too fast at 144 Hz) and keys used e.key. Fixed in M1.
- CameraManager v1 hid parts by height, so the exhaust pipe blocked CAB view. v2 uses explicit userData.cabHide.
- Old garage had 15 m walls and a roof that blocked the Bucket camera. Fixed in M3a.
- Old shrinkDirtPile removed clods permanently so the pile stayed empty. Fixed with _masterClods.
- Smoke history: dark blob (looked like a smudge) -> light and faint (invisible) -> M3d stronger -> M3e much stronger.
- Traffic history: cars were 72 to 126 km/h and vanished; the kinematic collider was centred at ground level so the machine
  rode up and bounced; props had no colliders. All fixed in M3d.
- The "vanishing machine": explained by fast traffic cars, not by the camera. If it recurs, suspect keepCameraClear in main.js.
- Reverse beeper and the duck 0.50 check from M2 were never reported by the user (see section 11).

======================================================================
## 9. DESIGN RULES FOR NEW CODE
======================================================================
- Time based effects (use dt), never per frame counts. Physics is a fixed 60 Hz step; render interpolates.
- Merge static geometry (GeoBuf or InstancedMesh). Keep draw calls low. Target 60 fps or more at 144 Hz.
- Painted canvas textures instead of thin geometry. Layers 0.02 apart with polygonOffset.
- Keep one AudioContext (AudioHub). All sounds synthesized.
- Keep files few; follow section 3 target file list.
- Text in the HUD at least 16 px, dark navy glass panels, amber accents, system-ui font.
- localStorage in try/catch. Relative paths only.
- Use 4 (or 8) physics-safe boxes for solid things; sizes must match the visual.

======================================================================
## 10. OPEN DECISIONS FOR THE USER (defaults from HANDOFF sec 3)
======================================================================
- Keep the game name TerraForm 3D? (default: keep)
- Keep or drop the daily bonus and paint colours? (default: keep daily bonus, drop paint colours if time is short)

======================================================================
## 11. M2 ACCEPTANCE STILL NOT REPORTED (ask the user to test once)
======================================================================
1. During a dump the debug box should show duck about 0.50 (idle shows duck 1.00).
2. Silence while the browser tab is hidden.
3. Reverse beeper beeps ONLY when driving backwards. Likely never fires because main.js passes vehicle.currentSpeed
   (rounded, non negative). Fix idea: pass a signed speed (vehicle.getForwardSpeedMps() * 3.6) to hub.setEngine.
4. Dig and dump sounds follow the arm movement.

======================================================================
## 12. ROADMAP IN DETAIL (what to build, how to test)
======================================================================
Always: ask for the ONE file you need first; deliver one box; STATE.md plus this file's log; REPORT.

### M3f (optional polish, ask the user first)
- Car variety: vans, pickups, trucks, small cars (different box sizes and colours); the collider in TrafficPhysics must
  match each car (store half-size on the car object). Needs World.createOptimizedTraffic + TrafficPhysics edits.
- Garage and yard detail: roof canopy for a workshop corner (keep walls low so the camera is not blocked), line markings,
  tool racks, lights.
- Driver seat detail. Dust colour lighter if it looks like a smudge.

### M4 - HUD, screens, mobile layout (BIG; needs index.html and main.js seen, one file at a time)
Goals: remove the duplicate HUD, the Google Fonts import, the double camera-button binding, JobEffects' second coin counter,
the stray "Clear"/"truck." text. One clean HUD: coins (top-left), mission card and timer (top-centre), minimap (top-right),
speed and action hints (bottom), camera buttons and mute/restart/pause (small, readable, not overlapping).
Add an on-screen mute button. Layout must work at 800x450 and DPR 1 and in a phone portrait/landscape (F12 device mode).
Use src/ui/Hud.js (new) and slim index.html. Remove the fog override from main.js and the fog lock in World.js.
Acceptance: no overlap or clipped text at 800x450, 1280x720, 1920x900 and a phone size; all buttons work.

### M5 - Input and touch controls
core/Input.js: keyboard (event.code), on-screen joystick or buttons for touch (pointer events, multi touch), action button,
camera button, brake. Resume audio on touchend. Test in F12 device mode (user has no phone).

### M6 - Portal (minimal)
Read docs.crazygames.com /sdk/game and /sdk/data FIRST. Add core/Portal.js: init in try/catch, gameplayStart/Stop,
happytime on job complete (already wrapped in try/catch in main.js), data save through the SDK with a localStorage fallback.
Game must run outside the portal (expected message "CrazySDK is not initialized yet").

### M7 - Jobs, economy, shop, daily bonus, tutorial
gameplay/Jobs.js: 5 jobs plus a Skill Course (M8). Stars by time left (over 50% = 3, over 20% = 2, else 1). Repeat reward 40%.
Shop: Engine/Hydraulics/Bucket 3 levels each, prices 100/250/500, 100/250/500, 150/300/600. Daily bonus. Short tutorial
(drive, scoop, dump). Replace hardcoded MAX_LOADS = 3 and 150 coins. Save under a new key with try/catch.
Top speed is already 32 + 5 per engine level (done in the answer that created this file; confirm by test).

### M8 - Skill course, quality tiers, performance, size, engine sound
ui/SkillCourse.js: a timed cone course. Quality tiers low/medium/high (shadow map size, bloom, antialias, traffic count,
far skyline on or off). Check fps and bundle size (50 MB limit, 1500 files; currently about 5 MB). Engine sound softer and
less tractor-like (lower LEVELS.engine, smoother knock). Delete old files (section 14).

### M9 - Submission pack
Read /requirements/game-covers and /resources/getting-to-the-first-frame first. Covers/thumbnails, favicon, loading screen,
final QA checklist (no flicker, no console errors, fps, mobile, audio), final HANDOFF and STATE.

======================================================================
## 13. QA CHECKLIST (run before M9, and quickly after each milestone)
======================================================================
- Apply and Check project OK, no red errors in F12 except the known ones (section 5).
- fps about 60 or more at 144 Hz; physics 60.0 steps/s in the debug box.
- No flicker on roads and windows while driving fast in all four camera modes.
- Machine stops at trees, poles, parked cars, buildings; no balloon bounce on moving cars.
- Scoop and dump work (3 s each), coins and job progress update, restart works (R and button), pause (P), mute (M).
- Audio: starts after first input, one context, silent when tab hidden, music ducks during dump.
- Layout at 800x450, no overlap; buttons readable on light backgrounds.
- Camera: CAB shows no pipe or black bar; BUCKET not blocked by walls.

======================================================================
## 14. FILES TO DELETE AT THE VERY END (give ONE terminal command then, not before)
======================================================================
Unused already: src/audio/AudioManager.js, SoundFX.js, Sfx2.js, DigSound.js, Music.js, and src/core/WorldPolish.js.
To delete when replaced (M4 to M8): MissionManager.js, MobileControls.js, JobManager.js, LevelSystem.js, GameUI.js,
JobEffects.js, Guidance.js. The Executor cannot delete files. Before deleting, make sure no import points to them
(the Check project button reports broken imports). Give the user ONE command and say exactly where to run it.

======================================================================
## 15. COMMIT LOG (GitHub, branch clean-v1)
======================================================================
- ba986e2  M1 timestep and input
- 6109b67  M3b-2 camera, M3b-2b, M3c skyline, M3b-2c smoke
- f3f7173  M3d solid props, traffic fix
- bac5f1c  M3e building styles, sky, fog, smoke
(next commit: top speed 32 plus CONTINUE.md, after the user clicks Save to GitHub)

======================================================================
## 16. STARTER MESSAGE THE USER CAN SEND TO A NEW AI (copy this)
======================================================================
Hello. I am a non-technical user. My English is poor. You are the lead engineer of my browser game TerraForm 3D.
I pasted CONTINUE.md. Read it fully and follow it exactly (ONE code box per answer, EDIT/FILE blocks, simple English,
ask for ONE file at a time). Start with the short first reply described in section 0.

======================================================================
## 17. SESSION LOG (newest at the bottom; append with an EDIT before the marker line)
======================================================================
- 2026-11-03: M3d saved (f3f7173). M3e saved (bac5f1c): user screenshots confirm varied buildings, bluer sky, far view, dust.
  Top speed lowered to 32 forward and 14 reverse (applied, awaiting test). This file created because the chat site warned
  about file size and the user wants a zero-context restart.
2026-11-03 (later): top speed 32/14 applied and saved as 1dcde4d (user has not yet reported the dial number). CONTINUE.md is now on GitHub.
2026-11-03 (later): user wants this order: UI first (M4), then more jobs, economy and shop, CrazyGames connection, submit soon. The game was rejected 10 times earlier, so ask the user to paste the rejection reasons once. The user wants rewarded ads that the player chooses to watch, never forced. Build an ads wrapper in M6 that hides the buttons when the SDK has no ad ready.
2026-11-03 (later): M4a delivered, only index.html. New layout: left column with coin pill and buttons Upgrades, Restart, Sound, Pause. Top centre mission card. Right column with minimap and the 4 camera buttons, or one camera cycle button on short or narrow screens. Bottom bar with Drive keys, speed dial and Dig keys. The Sound, Pause and camera cycle buttons send fake keydown events for M, P and C on document. The sound button reads localStorage key terraform_muted_v1 and treats 1 or true as muted. JobEffects .je-counter is hidden by CSS. The Google font import is removed. An inline SVG favicon is added. Buttons lose focus after a click so Space stays the brake. The stray Clear and truck. text is NOT fixed yet (M4b, likely needs Guidance.js or GameUI.js). Status: applied? awaiting your test.
2026-11-03 (night): M4a applied (index.html layout). User screenshots show: (1) the stray Clear and truck. text is my own old #mission-desc card in index.html, covered in the middle by a mission card made by game JS (title Clear the Highway, a progress bar and a timer pill like 2:54). (2) A second speed gauge made by game JS (dial ticks, small KM/H, a bar with a knob) sits on top of my .speedometer-ui and doubles the number; it overlaps the keys on the phone layout too. Probably GameUI.js, not yet seen. (3) Pause button does nothing; the user says Sound, Restart, camera buttons and Space brake work. main.js not yet checked for KeyP. The user's save has Engine MAX so the top speed is 42, not 32 (32 + 10). The user thinks emojis and boxes look cheap and AI-made.
2026-11-03 (night): M4a-fix delivered: .top-hud hidden by CSS, emoji replaced by inline SVG icons (the mute button toggles the class muted), MAX_REF set to 42. Status: applied? awaiting your test. Next: ask for GameUI.js, then main.js, then build one clean HUD in src/ui/Hud.js with an own style (dark steel panels, amber hazard stripe, heavy letters, own icons, no emoji) and remove the duplicate JS cards. Then M6 portal plus optional rewarded ads, midgame ad only at the Next job button. Ask the user once to paste a CrazyGames rejection email.
2026-11-03 (night): M4a was applied (index.html layout). The user's screenshots showed: the stray Clear and truck. text was my own old #mission-desc card; a second speed gauge made by GameUI.js doubled the number and overlapped keys; Pause did nothing because main.js had no KeyP; the emojis looked cheap. The first fix paste FAILED (an EDIT FIND on index.html was found 0 times, the cause is unknown). Lesson: for index.html and GameUI.js use full FILE blocks, not EDIT. The user's save has Engine MAX so top speed is 42. The user pasted 2 CrazyGames rejection emails: generic text, other games, no reason given, nothing to learn from them.
2026-11-03 (night): M4b delivered. index.html fully rewritten: steel panels, amber hazard stripes, key caps with a 3D edge, segmented speed bar, SVG icons, pause overlay (#pause-overlay, #resume-btn), loading screen with title. All GameUI styles now live in index.html (classes gui-jobcard, gui-timer, gui-toasts...). GameUI.js rewritten: mission card with the timer inside it, setCoins counts up inside #coin-count (main.js needs that id, it is not null-checked), setSpeed is a no-op, no injected CSS. main.js: 4 small EDITs: KeyP in CODE_TO_KEY, togglePause(), bh-mute event sent from toggleMute and once at start (the Sound button listens for bh-mute). The .top-hud element is hidden but kept because main.js writes to its ids. Status: applied? awaiting your test.
- M4b applied and tested by user: Pause (P key + button) works, one mission card, no stray text. User said: Pause did not silence all sound (tick sound stayed), speed box looked flat, HUD still boring.
- M4c applied (awaiting test): main.js P key now mutes all audio while paused and restores the old mute state on resume (window.__muteBeforePause). GameUI.js rewritten again: it injects its own CSS (prefix tf-), builds mission card, a round SVG speedometer (needle, ticks, 0-50 km/h, reads the number from #speed-val), toasts, hint, locked message. Old .speedometer-ui box is hidden with visibility:hidden (keeps layout). index.html NOT changed. GameUI exports both named and default.
- NEXT: restyle side buttons (need index.html from user), then M7 (jobs, shop), then M6.
- M4c saved to GitHub as commit 91065ab (clean-v1). User confirmed: Pause (P + button) works, pause silences all sound, job timer stops with pause. User said HUD still looks generic/low quality, dial blended into the dark road and covered the machine, dial number overlapped its labels.
- M4d applied (awaiting test): index.html and GameUI.js both fully rewritten. New look = solid steel panels (thick dark edge, 4px lower shoulder, top shine), one big amber Upgrades button + 3 square icon buttons (Restart, Sound, Pause, with title tooltips), camera buttons joined as one segmented control, mission card in the same style. Round dial moved to bottom right: GameUI mounts it into <div id="dial-slot"> inside .dash-right (next to the Dig/Dump card); falls back to a fixed corner if the slot is missing. Dial scale 0-45 km/h, bright steel bezel, labels at r44, number at y152. Old .speedometer-ui box is display:none but kept in the DOM (main.js writes #speed-val, inline script smooths it, GameUI reads it). Desktop key cards fade to 60% after the first game key (.dashboard.dim). Dead .gui-* CSS removed from index.html. main.js NOT changed.
- NEXT: user tests M4d (normal, 800x450, phone) then Save to GitHub. Then M7 (needs JobManager.js from the user), then M6.
- M4d saved to GitHub as commit 5072948 (clean-v1). User tested M4d at 1910x900, 800x450 and phone (440x956): no overlaps, steel panels OK. User feedback: the dial number sat low-right next to a "0" label (not centred), wants a more colourful, deeper dial with the number in the middle and no extra text. User also noticed: after Job complete the card still says Clear the Highway / Scoop dirt = jobs are only a card, there are no real levels yet. User saw max speed 36 km/h (expected up to 42 at engine level 3): cause unknown, check Vehicle.js governor and drag in M7.
- User pasted src/main.js (about 823 lines). Plan: M7 does NOT need JobManager.js. Write new src/gameplay/Jobs.js (job table, timer, stars, rewards, unlock, save) and wire it into main.js with EDIT blocks (replace JOB_TITLE/JOB_OBJ/MAX_LOADS/150 coins, restartJob positions, minimap target, truck and pile moved per job).
- M4e applied (awaiting test): GameUI.js rewritten dial v3. Needle removed; glowing dot runs on the ring; ring and ticks go green -> yellow -> orange -> red with speed; number at exact centre (y116, 56px) inside a sunken well; "km/h" small under it (hidden on small screens); numbers 0/10/20 around the dial removed; stronger steel rim, groove, glass shine. At max-height 520px the mission card hides its objective line to be smaller. index.html and main.js NOT changed.
- NEXT: user tests M4e (normal + 800x450) then Save to GitHub. Then M7a: real jobs and levels (Jobs.js).
- 2026-11-03 M4e applied (dial v3, smaller mission card); user said the dial is OK (no screenshot). Backup 2026-11-03T16-25-27-581Z-vhc.
- 2026-11-03 M7a part 1 delivered: NEW src/gameplay/Jobs.js (about 560 lines), NOT wired yet. Exports JOBS (6 jobs, theme City Rescue), RANKS, UPGRADES (levels 1..4, prices 100/250/500, 100/250/500, 150/300/600), TIPS (bucket tip per load 10/16/24/34), DAILY (7-day bonus), START (garage start pose), rankInfo, tipFor, upgradeCost, class JobSystem (start, update, addLoad, complete, addTime, lockReason, nextId, dailyStatus, claimDaily, layout/siteFor = finds free ground for jobs 2-6 using World.buildingData, job 1 keeps the old site), class JobPanels (briefing, showResult, showFail, showPicker). Own save key terraform_jobs_v1. Coins stay in main.js saveData.coins. NEXT: user sends src/main.js, then part 2 wires it (replace JobManager, MAX_LOADS, 150 coins, restartJob positions, minimap target, move pile and truck per job, check vehicle.pilePos and truckPos cache, env per job). Need to check pile and truck colliders in World.js createJobSite before moving them.
- 2026-11-05 M8 delivered (THIS IS THE BIG ONE, read STATE.md and LEVELS.md too). Jobs.js is now wired into main.js: real loads, time, reward, stars, XP, ranks, tips, daily bonus, job picker, briefing, result window, fail window with a REWARDED ad for +60 s. JobManager is no longer imported. NEW src/gameplay/SiteSystem.js builds six different venues (highway / park / bridge / night depot / storm zone / skyline construction) with own ground texture, structures, props, lights, rain and physics colliders; everything is disposed on job change. NEW src/core/CrazySDK.js wraps the portal (init, loadingStart/Stop, gameplayStart/Stop, happytime, midgame ad at Next, rewarded ad on fail, muteAudio). World.js got moveJobSite() plus references to the dirt patch, the cone ring and the truck colliders, so a job site can really move. main.js got applyVenue() (sky shader colours, sun, hemi, fog colour+density, exposure per job), the minimap now points at the real pile and marks the truck, the shop has a Big Bucket upgrade and a rank line, index.html has a Jobs button, and Guidance has a Skip tutorial button. Verified with npm run build, a headless venue test (6 venues, 43-83 drawables, 100 colliders created and all removed) and a headless job test (3 stars, 195 coins, 220 XP, unlock job 2). The site finder was run against the real World data: all six sites found in 23 ms. NOTE: the old files (JobManager.js, LevelSystem.js, AudioManager.js, SoundFX.js, Sfx2.js, DigSound.js, Music.js) are unused but still on disk - delete them at the very end, after the user has played the six sites.
SESSION LOG END MARKER (do not remove this line)
