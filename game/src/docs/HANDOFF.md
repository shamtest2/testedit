# HANDOFF - TerraForm 3D (backhoe simulator for CrazyGames)

THE master document. One file, written to be handed to any AI. Version 2, written 2026-11-02. It replaces the first version.
The second file, `STATE.md` (same folder), is the live status. Read this file first, then STATE.md.
Tags used: VERIFIED = read from the source on 2026-11-01/02. UNVERIFIED = not checked. DECISION = chosen on purpose, the user may change it.

---

## 0. What you (the AI reading this) must do

You are being asked to help finish a browser game. The user is not technical. The user copies, pastes, clicks, plays the game, and reports what they see. The user cannot read code and cannot debug.

Rules for you, whichever AI you are:
1. Read sections 1 to 3 completely before writing anything.
2. Never guess about files you have not seen. Ask for a recon command (section 9) or for a specific file through the Executor Files tab.
3. Deliver code only as Executor blocks (section 9). Never as terminal scripts.
4. Do not claim "done" without evidence (section 11). Say "applied, awaiting your test".
5. After every answer that changes anything, give the user a STATE.md update block (section 12) and a REPORT (section 12.2).
6. If you can write long answers (1500+ lines in one reply), use the big milestones in section 10. If you can only write short answers, use the small steps listed under each milestone.
7. Keep the number of source files low. Every new file is a new place for a connection mistake.
8. YOU write the code yourself, in complete milestone-sized Executor blocks (decision 2026-11-02). DeepSeek is no longer the default writer. Use it only if the user asks, and only for small, fully specified tasks.

Test any AI before trusting it with a big milestone (the canary test):
- In the Executor Files tab tick 3 large files, click Copy selected, paste into the AI, and add this as the very last line: `CANARY: purple-giraffe-42`.
- Ask: "Quote my last line exactly and tell me how many files I pasted." If it cannot, it dropped part of the input. Do not use it for big tasks.
- Then ask: "Write a FILE block for src/test.js containing numbered comment lines 1 to 400. Stop only at the END line." If it stops early, its output limit is small. Use small steps.

Start message for a new AI chat (the user pastes this, then the two files):

    You are the lead engineer and QA for my browser game. I am not technical. I paste two files below:
    HANDOFF.md (rules, game definition, plan) and STATE.md (current status). Read them fully, then tell me
    in 6 lines: where we are, what is verified, what is not, the next milestone, and what you need from me.
    Deliver code only as Executor blocks. After each answer give a REPORT and a STATE.md update block.

---

## 1. Situation report (2026-11-02)

What the game is today (the "baseline"):
- A working prototype: a backhoe loader drives in a low-poly city, scoops dirt from a pile, dumps it into a blue truck, earns coins, buys engine and hydraulic upgrades. Rapier physics, Three.js rendering, Vite build.
- Baseline code = GitHub commit titled "first full backup" (28 files, 2026-10-31), later checked on 2026-11-01: `main.js` 658 lines, 22 JS files, 8385 lines total, "Check project" found no syntax errors and no broken imports, Executor Status showed 16 of 21 features connected. VERIFIED.
- The user judges the look and feel as not good enough: flicker in the distance, blocky art, bad sounds, jerky dig animation, confusing HUD. VERIFIED from the user's own reports and screenshots.

What went wrong on 2026-11-01 evening:
- Work was moved to another AI plus DeepSeek and many changes were applied at once. The result broke the game: Vite error `Failed to parse source for import analysis ... src/main.js:2158` (a stray closing brace; main.js had grown from 658 to more than 2158 lines). The user judged those changes "all useless". VERIFIED (screenshot).
- Decision: throw those changes away and return to the baseline. The revert procedure is in section 13. Nothing is deleted: the broken state is kept on a snapshot branch for reference.

Git facts (revert DONE on 2026-11-02, verified by the user's pasted output: baseline commit 4495a5e, main.js 658 lines, snapshot branch snapshot-1102-0420, working branch clean-v1, game loads again):
- Branch `clean-v1` = baseline plus these docs plus the newest Executor. This is the working branch.
- Branch `snapshot-MMDD-HHMM` = everything as it was before the revert (reference only).
- Branch `main` on GitHub still points at the older state. Do not force-push it. CrazyGames receives the built `dist` folder, not the git history, so the branch name does not matter.

---

## 2. Lessons learned (do not repeat)

| # | What happened | Rule now |
|---|---|---|
| L1 | Chats ran out of room ("Length limit reached") because a whole project, long thinking and a long answer shared one chat. | One task per chat. Attach only the needed files. No long thinking for code writing. |
| L2 | One task was split into many new small files. Connections broke. | At most the files listed in section 6. New files only when this document says so. |
| L3 | DeepSeek without exact guidance wrote weak code. With exact guidance it writes decent code. | Every task needs the card in section 9.3. The spec in sections 3 to 5 is the guidance. |
| L4 | Big rewrites shrank files (2000 lines became 300). | The Executor refuses a file under 50% of its old size. Prefer EDIT blocks. |
| L5 | Wrong libraries and styles (cannon-es instead of Rapier, named vs default exports). | Section 6 lists the stack and the export style per file. "Check project" tests imports. |
| L6 | Changing many things at once made problems impossible to locate. | One milestone at a time. Apply, check, play, save, then the next. |
| L7 | Features were added before the basics were stable. | Stability and CrazyGames Basic checks come first (milestone M1). |
| L8 | Claims of "fixed" were made without proof. | Section 11. Evidence or it is not done. |
| L9 | The Executor cannot see the browser, so black screens and red console errors are invisible to it. | The user reports console text or screenshots. The report template asks for it. |
| L10 | Arena (arena.ai): its help page (updated 2026-02-25) says TXT, CSV and other document types are not currently supported for upload. Upload limits for code files on other chat sites are UNVERIFIED. | Do not assume file upload. Use the Executor Copy button and paste text. Run the canary test. |

---

## 3. The finished game (final game definition)

Everything in this section is a DECISION. If the user changes any of it, record the change in section 14 and update this section.

### 3.1 Pitch and pillars
"Drive a heavy yellow backhoe through a living city, dig, dump, and upgrade."
Pillars: (1) satisfying dig and dump, (2) clear goal every second, (3) quick progression, (4) clean polished look, (5) works on phone and desktop.
CrazyGames targets this game must serve: average session 10+ minutes, day-1 return 10 to 15%, 80%+ of visitors playing at least a minute, load under 10 seconds, build under 20 MB. VERIFIED (section 5).

### 3.2 Core loop (30 to 60 seconds)
1. Drive to the glowing dirt pile (follow the small orange arrow and the ground ring).
2. Press ACTION when the bucket is over the pile. A 3-second eased sequence plays: arm lowers, bucket curls, dirt grows in the bucket, arm lifts. The pile shrinks smoothly.
3. Drive to the blue truck. Press ACTION when the bucket is over the open truck bed. A 3-second sequence: arm lifts, bucket tips, dirt pours, last chunks shake out, thud, bed heap rises.
4. Coins pop up. Repeat until the job's loads are done. Stars depend on time left.
Rules: ACTION too far from a target gives a toast like "Move the bucket over the dirt pile". No loading from a distance. One action at a time.

### 3.3 Content
Five jobs plus one challenge. The truck and the garage stay fixed (the truck's physics collider is created once). Only the pile position, props and environment change.

| Job | Name | Loads | Time | Reward | Environment | Twist |
|---|---|---|---|---|---|---|
| 1 | Clear the Highway | 3 | 180 s | 150 | day | Guided tutorial, no obstacles |
| 2 | Sunset Rubble | 4 | 200 s | 250 | sunset | Parked cars narrow the road |
| 3 | Night Shift | 5 | 210 s | 400 | night, headlights on | Cone slalom |
| 4 | Foggy Morning | 6 | 230 s | 600 | fog | Narrow barrier gate |
| 5 | Mega Site | 8 | 260 s | 1000 | dawn | Two piles, cones and barriers |
| C | Skill Course | - | timed | medals | day | Checkpoints, cones, a low beam (arm must be raised), speed gates |

Stars: 3 if more than 50% of the time is left, 2 if more than 20%, else 1. First completion of a job gives the full reward, repeats give 40%. Jobs unlock in order. The game boots directly into Job 1 (no menu click). A jobs menu is reachable from the pause menu.
Daily bonus: +100 coins on the first visit of each calendar day, shown as a toast.

### 3.4 Upgrades and economy (DECISION, tune after play tests)
| Upgrade | Levels | Prices | Effect |
|---|---|---|---|
| Engine | 3 | 100, 250, 500 | Top speed +5 km/h per level, faster acceleration |
| Hydraulics | 3 | 100, 250, 500 | Dig and dump sequence 15% faster per level |
| Bucket | 3 | 150, 300, 600 | One load counts as 1, 1.25, 1.5, 2 loads (fewer trips) |
Total to max everything: 2,700 coins. First-pass rewards for the 5 jobs: 2,400 coins, plus repeats. Target: a player maxes the machine after about 15 to 20 minutes.
Optional unlock (cheap, good for return visits): 3 paint colors for the machine, unlocked by total stars (3, 8, 13).

### 3.5 Vehicle feel
- Heavy but fun, never slow. Base top speed 32 km/h, +5 per engine level (50 at max), reverse 14 km/h. Governor so it never exceeds the cap.
- 0 to top speed in about 4 seconds on level 1. Throttle ramps in 0.3 s. Engine braking when no key is pressed. Brake is strong.
- Steering angle shrinks with speed (0.55 rad at standstill). Tight at low speed, stable at high speed.
- It never flips on normal driving, never flies, never sinks. If tilted over 70 degrees for 2 seconds or below y = -5, it resets upright at the last safe position.
- Bumping traffic cars gives a small bounce and a thud, never a dead stop.
- Wheels spin and the front wheels steer. Body leans slightly when braking and turning (visual only).

### 3.6 Controls
| Action | Desktop | Mobile |
|---|---|---|
| Drive | W A S D and arrow keys (by key position, so AZERTY works) | Floating joystick, left thumb |
| Brake | Space | BRAKE button |
| ACTION (dig or dump) | F or E | Large DIG/DUMP button |
| Camera cycle | C | Camera button |
| Pause | P | Pause button |
| Restart job | R | In the pause menu |
| Mute | M | In the pause menu |
Never use Escape (it closes fullscreen) or Ctrl+W. No custom fullscreen button (the portal provides it). Show a keyboard overlay in the first-minute tutorial only.

### 3.7 Cameras
Chase (default): about 9 units behind and 4 up, smooth follow, never inside a building. Orbit: drag to rotate. Cab: inside view. The bucket view is used automatically for 3 seconds during dig and dump.

### 3.8 Screens and HUD (all text English, 16 px minimum, readable at 800x450 and device pixel ratio 1)
1. **Loading:** game title, real progress bar (steps: physics, city, vehicle, audio), one tip line, under 10 seconds. Shows within the first frame, no external fonts.
2. **Tap to start:** one overlay with a Play button (needed to unlock audio). Also shows the control hints.
3. **HUD:** top-center job card (title, objective, step text "Scoop dirt 1/3", thin progress bar), timer pill under it (amber under 30 s, red under 10 s), coin pill top-left, minimap top-right (target marker), small speed gauge bottom-center, one context hint line above it, small orange arrow at the screen edge pointing to the target, ground ring at the target.
4. **Mobile HUD:** same, but joystick bottom-left, big ACTION and BRAKE bottom-right, camera and pause top-right under the minimap. No keyboard hints.
5. **Pause menu:** Resume, Restart job, Jobs, Upgrades, Sound on/off.
6. **Jobs menu:** 5 cards with number, name, reward, time, stars, padlock if locked.
7. **Upgrades shop:** 3 cards with level pips, price, buy button disabled when too poor.
8. **Job complete:** stars animate in one by one, coin count-up, buttons Next, Retry, Jobs.
9. **Toasts:** bottom-center, 2.5 seconds, queued.
Style: dark navy glass panels rgba(15,23,42,0.75), 14 px radius, amber #fbbf24 accent, white text, system-ui font, no neon, no glow. Panels never cover the screen center. Buttons respond instantly (no artificial delay). The old duplicate HUD in index.html is removed.

### 3.9 Art direction (consistency is a CrazyGames quality rule)
Stylized low-poly, flat-shaded, soft light. One look everywhere. Never mix realistic textures with cartoon shapes.
- Palette: asphalt #2b2f36, sidewalk #8b8f97, grass #3f6b2f to #5a8a3a, machine yellow #f5b301, truck blue #1d4ed8, buildings muted blue-grey and warm brown tones, 6 palettes, sky gradient light blue to pale horizon, warm sun.
- **Anti-flicker rules (the user's main visual complaint):** (a) no geometry thinner than 0.3 world units; (b) road lines, crosswalks and edge lines are painted into one tiled canvas texture on the road mesh, NOT separate thin planes; (c) building windows come from one texture atlas (4 variants, lit and dark) with mipmaps and anisotropy 8, applied on all four sides; (d) layers at different heights (0.02 apart) plus polygonOffset where decals are needed; (e) fog hides the far distance; (f) antialiasing stays on in post-processing; (g) logarithmicDepthBuffer is OFF unless a test proves it helps.
- Lights: one directional sun with a shadow camera that follows the machine (about 80 units wide, snapped to texel size), hemisphere light, ACES filmic tone mapping, sRGB output.
- The machine: glossy yellow, black tires with tread, steel pistons, tinted glass, working headlights, a blinking amber beacon, mudguards, exhaust, hoses, hazard stripe on the counterweight. Under 120 meshes.
- Props: streetlights, traffic lights, benches, bins, hydrants, trees (trunk plus two-tier canopy, 3 greens), parked cars, jersey barriers, cones, containers, readable signs ("DIG SITE", "GARAGE", street names) drawn on canvas at 2x resolution.
- Skyline ring of dark blue silhouettes fading in fog. Roads never end at a wall.

### 3.10 Audio direction
- One audio system (one AudioContext, one master gain through a compressor). It is created or resumed on the first click, key or touch, and on `touchend` after the app was in the background (iOS requirement).
- Sounds, all synthesized (no audio files): engine loop (pitch and volume follow speed and load), hydraulic whine on arm movement, scoop (low strain, gravel scrape, crunch ticks, fill thump), dump (creak, gravel pour, bed thud with metal clank), coin ding, job-complete jingle, UI tick, soft low-volume ambience (distant traffic), calm music loop (about 100 BPM) 12 dB below effects.
- Music ducks 50% during dump. Mute button saved in settings. No sound before the first input. No sound while the page is hidden.
- Sound and picture are synced to the 3-second dig and dump timelines (events: start, dig, fill, lift, tip, drop, thud, end).

### 3.11 World layout (kept from the baseline, VERIFIED in the code at the time)
- Roads 24 units wide on x and z = -240, -160, -80, 80, 160, 240. The central block (about -68 to 68) is the garage hub at (0,0) and stays open.
- Job site at (0, 0, -120): dirt pile, blue open-bed dump truck at x +15, 16 orange cones.
- About 20 traffic cars (reduce from 40 for performance), correct lanes, slow down behind the car ahead, wrap at the map edge, kinematic colliders so the machine bumps them.
- Buildings are instanced, with box colliders pushed into `buildingData` for Rapier.

---

## 4. Technical specification

### 4.1 Stack and conventions
Three.js, `@dimforge/rapier3d-compat` (NOT cannon-es), Vite, plain JavaScript ES modules, no TypeScript, no frameworks, no extra packages. `import * as THREE from 'three'` in every file that uses THREE. Relative paths only. Vite config `base: './'`. No external fonts, images or scripts, except the CrazyGames SDK script.

### 4.2 Game loop (this fixes a rejection risk)
Physics runs at a fixed 60 Hz regardless of screen refresh rate. Accumulate frame time (clamped to 0.1 s), step physics while the accumulator holds at least 1/60 s (at most 6 steps per frame), render once per frame. Interpolate the machine's visual position between the last two physics states so 144 Hz screens look smooth. Verified math: this gives exactly 60 steps per second at 30, 60, 75, 120, 144, 165 and 240 Hz. The baseline calls the physics step once per frame, so on a 144 Hz screen it runs 2.4 times too fast. VERIFIED (`main.js` lines 576 to 578 on 2026-11-01).
Debug aid: a hidden overlay (toggle with the backquote key, active only in dev or with `?debug`) showing physics steps per second and FPS, and a console function `__testTimestep()` that prints steps per second for 7 refresh rates.

### 4.3 Rendering
Renderer antialias on, sRGB output, ACES filmic tone mapping, soft shadows, pixel ratio capped at 2 (1.5 on weak devices). Post-processing: very subtle bloom and vignette created after the first frame. Quality tiers Low, Medium, High, chosen at start from hardware hints and a 2-second FPS test; if FPS stays under 40 for 3 seconds, step down one tier (shadow size, then post effects, then pixel ratio). `window.setQuality('low'|'medium'|'high')` for debugging.

### 4.4 Save data (one object, versioned)
`{ v:1, coins, engine, hydraulics, bucket, jobs:{ "1":{stars,best} ... }, settings:{muted,quality}, daily:{last}, tutorialDone, paint }`
Stored through the CrazyGames SDK data module when present, otherwise `localStorage`, always inside try/catch, and the game must run correctly when storage is empty or blocked.

### 4.5 Performance budgets
60 FPS on the developer laptop. At least 30 FPS with Chrome CPU throttled 4x. Under 300 draw calls. First frame under 5 s, playable under 10 s. Build under 20 MB, under 1500 files. No per-frame allocations in hot loops. Smooth on a 4 GB Chromebook (CrazyGames disables games that are not).

### 4.6 Event names (so modules stay decoupled)
`game:ready`, `job:start`, `job:progress`, `job:complete`, `job:fail`, `dig:start`, `dig:dig`, `dig:fill`, `dig:lift`, `dig:tip`, `dig:drop`, `dig:thud`, `dig:end`, `coins:change`, `ui:toast`, `pause`, `resume`. A tiny event emitter (about 20 lines) in `core/Events.js` replaces window CustomEvents.

---

## 5. CrazyGames requirements (VERIFIED 2026-11-01, docs.crazygames.com)

Sources read: /requirements/intro, /technical, /gameplay, /quality, /resources/basic-launch-metrics.
NOT yet read: /requirements/ads, /game-covers, /account-integration, /sdk/game, /sdk/user, /sdk/data, /resources/getting-to-the-first-frame, /resources/html5/common-fixes. Read the right page before the milestone that needs it.

**Two-step launch.** Basic Launch first: the SDK is optional, monetization is not available, ads are disabled even if the SDK is integrated. It lasts until at least 7 days live and 500 plays (ends after 21 days if 500 plays are not reached). Strong results can move to Full Launch, which requires the SDK and ads through the SDK. So ads are not part of the current work.
**KPIs for success:** average play time 10+ minutes, day-1 retention 10 to 15%, 80%+ of plays last at least a minute, load under 10 s, build under 20 MB.
**Technical:** initial download at most 50 MB (20 MB for the mobile homepage), total at most 250 MB (50 MB if no SDK), at most 1500 files. With the SDK, initial size counts until the first `gameplayStart`. Externally loaded games reach gameplay within 20 s. Relative paths only. Chrome and Edge must work; a game that is poor on Safari is disabled there; one that is not smooth on a 4 GB Chromebook is disabled on Chromium OS. Mouse, keyboard and touch. Landscape on desktop.
**Mobile:** orientation is set at submission and the site asks the player to rotate, so write no orientation-lock code and no "rotate your phone" overlay. Add `user-select:none` (plus `-webkit-`, `-moz-`, `-ms-`) to `body`. Respect device safe areas. On iOS call `audioContext.resume()` inside a `touchend` or click handler.
**Gameplay:** readable at device pixel ratio 1 at these sizes: desktop windowed 907x510, 1216x684, 1077x606, 821x462; desktop fullscreen 1366x768, 1920x1080, 1536x864, 1280x720; mobile 800x450; tablet 1080x607. **Physics must be consistent across monitor refresh rates (144 Hz, 165 Hz).** English is required (use the SDK locale if other languages exist). Intuitive controls, avoid restricted keys, adapt to AZERTY. No errors or crashes. Original names and assets. **No custom fullscreen button. No cross-promotion** (privacy and terms links are allowed). PEGI 12 content.
**Quality guidelines:** onboarding inside gameplay, skippable and mostly visual; no artificial delays on buttons; consistent art style (do not switch between realistic and cartoony); consistent audio levels; no graphical defects such as flicker or compression artifacts; Full Launch needs new players in gameplay immediately or after at most one click.
**Name caution (DECISION):** "JCB" is very likely a trademark. Do not show it anywhere a player or reviewer sees it. Say "backhoe loader". Also check that "TerraForm 3D: City Rescue" is not already used; the working name can change.

---

## 6. Architecture: target files

Fewer files, clear jobs. All exports listed so imports never guess. "Reuse" means the baseline file is the starting point and is edited, "Replace" means rewrite it to the contract here.

| File | Export | Contract | Baseline |
|---|---|---|---|
| `index.html` | - | Canvas, one HUD container, loading screen, minimal CSS, `body{user-select:none}`, safe-area padding | Replace (remove old duplicate HUD) |
| `src/main.js` | none | Bootstrap only: create Game, start loop | Reuse then slim down |
| `src/core/Game.js` | `export class Game` | Scene, camera, renderer, composer, fixed-timestep loop, quality tiers, pause, restart | New (code moves out of main.js) |
| `src/core/Events.js` | `export const events` | `on`, `off`, `emit` | New, 20 lines |
| `src/core/Input.js` | `export class Input` | Keyboard by `event.code`, touch controller, one `state` object (forward, backward, left, right, brake, action edge) | New (replaces key code in main.js and MobileControls.js) |
| `src/core/Audio.js` | `export class AudioHub` | One context, `engine(speed,load)`, `play(name)`, `duck(ms)`, `setMuted`, `resume()` | New (replaces AudioManager, SoundFX, Sfx2, DigSound, Music) |
| `src/core/Portal.js` | `export class Portal`, `export class LoadingScreen` | SDK wrapper with safe no-op, loading, gameplay events, data save | Reuse (exists, not connected) |
| `src/core/World.js` | `export class World` | City, roads, props, sky, lights, traffic, colliders, job site API: `shrinkDirtPile`, `resetDirtPile`, `addDirtToTruck`, `buildingData`, `createPhysicsColliders` | Replace rendering parts, keep layout and public API |
| `src/vehicle/Vehicle.js` | `export class Vehicle` | Model, Rapier controller, hydraulics, particles, `autoAction`, `getSpeedKmh`, interpolation | Reuse and improve |
| `src/vehicle/DigAnimator.js` | `export default class DigAnimator` | 3-second timelines with events | Reuse |
| `src/core/CameraManager.js` | `export class CameraManager` | Chase, orbit, cab, bucket assist | Reuse |
| `src/gameplay/Jobs.js` | `export class Jobs` | Job data, state machine, timer, stars, economy, save | Replace JobManager and LevelSystem logic |
| `src/gameplay/Effects.js` | `export default class Effects` | Dust, dirt arc, coin popups, banners, guide arrow and ring | Reuse JobEffects and Guidance |
| `src/ui/Hud.js` | `export class Hud` | All screens in section 3.8 | Replace GameUI |
| `src/gameplay/SkillCourse.js` | `export default class SkillCourse` | Challenge course | Reuse (not connected) |
| `src/core/TrafficPhysics.js` | `export default class TrafficPhysics` | Kinematic colliders for traffic | Reuse |
| `src/core/QAManager.js` | `export class QAManager` | Hidden diagnostics | Reuse |
| `src/docs/` | - | HANDOFF.md, STATE.md | Keep |
Delete when replaced: AudioManager.js, SoundFX.js, Sfx2.js, DigSound.js, Music.js, MissionManager.js (dead code, UNVERIFIED), WorldPolish.js (its ideas move into World.js), MobileControls.js (moves into Input.js and Hud.js), JobManager.js, LevelSystem.js, GameUI.js, JobEffects.js and Guidance.js after Effects.js exists. The Executor cannot delete files, so the user deletes them in the terminal at the end of each milestone with a command the AI provides.
Export style: classes use named exports except where the table says default. "Check project" tests every relative import.

---

## 7. Known issues in the baseline

| ID | Sev | Issue | Evidence | Fixed by |
|---|---|---|---|---|
| R1 | High | Physics speed depends on frame rate | `main.js` 576-578 | M1 |
| R2 | High | Distant flicker (roads, windows), cause unconfirmed; logarithmicDepthBuffer, camera near 1, MSAA 4 and anisotropy were tried without success | User reports | M3 (art rules in 3.9) |
| R3 | High | Five audio systems, no single hub, no iOS resume, sounds judged poor | Code | M2 |
| R4 | High | Portal, MobileControls, LevelSystem, SkillCourse, WorldPolish not connected | Executor Status | M5 to M7 |
| R5 | Med | Old HUD duplicates the new HUD | Screenshots | M4 |
| R6 | Med | Keys read `e.key`, AZERTY fails | `main.js` 356, 376 | M1 |
| R7 | Med | Dig and dump animation judged jerky | User | M3 |
| R8 | Med | Performance on a 4 GB Chromebook unknown, build size unknown | Not measured | M8 |
| R9 | Low | Executor is blind to the browser | Design | Report template |
| R10 | Low | `MissionManager.js` possibly dead | File list | M2 |

---

## 8. Quality bar and definition of done

Premium means: clean consistent look, instant responses, satisfying sound synced to action, no errors, steady frame rate, readable on a phone. A milestone is DONE only when all of these hold:
1. The Executor applied the blocks and "Syntax check passed".
2. Executor "Check project" says all files OK.
3. The game loads on the live page (port 5173) with no red errors in the F12 console.
4. The user confirmed every acceptance line with a screenshot, console text or a clear yes or no.
5. For performance or size items: the numbers are pasted (FPS, build MB, file count).
6. STATE.md is updated and the user clicked Save to GitHub.

---

## 9. Working protocol with the Executor

### 9.1 What the Executor is
A small local web page (port 3002) that takes pasted text blocks, checks them, writes them into the project with a backup, and runs checks, builds and git saves. The live game is on port 5173 (`npm run dev -- --host`), the production preview on 4173 (`npm run build && npx vite preview --host --port 4173`). Keep ports Private.
The version in use on 2026-11-02 (screenshot) has tabs 1 Apply, 2 Check/Build/Save, 3 Files, 4 Status, 5 Help; buttons Paste from clipboard, Preview, Apply, Undo last apply, Copy rules for DeepSeek, Clear, Check project, Build check, Save to GitHub, What changed?, Install packages, Test connection, Show server log, Copy error report, Copy error + related files; and a checkbox "run Check automatically after Apply". The Help tab (VERIFIED from a screenshot on 2026-11-02) gives the start command, says to run it again after replacing the Executor file and then reload the page, says a red dot means the Executor is not running, and says "Copy error report" and "Copy error + related files" copy the failure (and the content of the files named in it) so it can be pasted to DeepSeek or Claude. It also has Test connection and Show server log. The other newer buttons (What changed?, Install packages) are UNVERIFIED.
Start command (also in section 15): `cd "$(git rev-parse --show-toplevel)"; pkill -f executor.cjs; nohup node tools/executor.cjs > .executor.log 2>&1 & sleep 2; cat .executor.log`
It cannot: delete or rename files, see the browser, run the game, write images or sounds, detect a missing `import * as THREE`.

### 9.2 Block formats (marker lines start at the very start of a line)

    @@@ FILE path/to/file.js @@@
    (complete file)
    @@@ END @@@

    @@@ EDIT path/to/file.js @@@
    --- FIND ---
    (exact old text, must appear exactly once)
    --- REPLACE ---
    (new text)
    @@@ END @@@

Rules: all blocks in a paste apply or none do. Syntax is checked for .js, .mjs, .cjs, .json (not HTML or CSS). A file that would shrink under 50% is refused unless the user ticks "allow a file to shrink a lot". A cut-off answer (more starts than ENDs) is refused. In documents, write examples with 4 spaces of indentation so they are not mistaken for real blocks.

### 9.3 Task card (for any AI)
Fill every field. Never leave a decision open.

    TASK ID / TITLE:
    GOAL (one sentence):
    FILES ATTACHED (from the Files tab):
    CHANGE EXACTLY: numbered list, each with file, location, and what to put there
    INTERFACE THAT MUST NOT CHANGE: exports, function names, element ids
    DO NOT: touch other files, add packages, add files, use other libraries, load external assets, add a fullscreen button, write JCB in visible text
    ACCEPTANCE: 3 to 6 things the user can see or paste
    OUTPUT: blocks only, EDIT where possible, stop at a finished block and write CONTINUE if long

Failures to check in any output: "rest of code" placeholders, shrunken files, other physics library, changed export style, missing `import * as THREE`, invented files, new globals clashing with old names, `localStorage` without try/catch, absolute URLs, the word JCB in visible text.

### 9.4 Recon commands (learn the files cheaply; the user pastes the output)

    find src -name "*.js" -exec wc -l {} + | sort -k2
    grep -nE "^\s*(export )?(async )?(function|class) \w+|^\s{2,4}(async )?\w+\(.*\)\s*\{" src/FILE.js | head -60
    sed -n 'A,Bp' src/FILE.js
    grep -rn "NAME" src index.html | cut -c1-140 | head -30
    grep -n "^import" src/FILE.js | cut -c1-120
    grep -nE "^export" src/FILE.js
    git status --short | head; git log --oneline -3
    git branch --show-current

---

## 10. Build plan (milestones)

Order matters. Each milestone ends with: Apply, Check project, play, report, Save to GitHub. A "big" AI does a whole milestone in one chat. A "small" AI (for example DeepSeek web chat) does the numbered steps one per chat.
Before each milestone the AI reads the baseline files it will change, through the Files tab.

**M0 - Baseline restored.** Revert, keep docs and Executor, game loads, 658-line `main.js`. (Section 13.) Acceptance: page loads with no error overlay; Check project OK; Save to GitHub on `clean-v1`.

**M1 - Stability pack (about 150 lines, all in main.js and Vehicle.js).**
Steps: (1) fixed 60 Hz timestep with accumulator, debug overlay and `__testTimestep()`; (2) interpolation of the machine's visual transform; (3) keys by `event.code` (KeyW KeyA KeyS KeyD, arrows, Space, KeyF, KeyE, KeyC, KeyP, KeyR, KeyM) and no Escape use; (4) rename the custom events `jcb-dig` and `jcb-hint`; (5) `body{user-select:none}`.
Acceptance: `__testTimestep()` shows 60.0 on all rows; backquote overlay shows 60 steps per second at any FPS (also with CPU throttled 4x); game plays as before; WASD works by position.

**M2 - Audio hub (about 500 lines).** New `core/Audio.js` to section 3.10. Replace all old sound calls. Delete the five old sound files and MissionManager. Acceptance: one AudioContext (console: no duplicate), levels balanced (user judgment), dig and dump synced, nothing plays before the first input, mute works, no sound when the tab is hidden.

**M3 - World and machine visuals v2 (about 1500 lines, the biggest).** Roads as one textured mesh, windows atlas, props, sky, lights, shadows that follow the player, anti-flicker rules of section 3.9; improved machine model; eased dig and dump with the grow and shrink dirt; remove the garage roof that blocks the orbit camera. Acceptance: still screenshots of distant roads and windows show no shimmer, also while driving; draw calls under 300 (QA tool); the look matches the palette.

**M4 - HUD and screens (about 900 lines).** `ui/Hud.js` plus a slim `index.html`: every screen in 3.8, responsive at the 10 sizes in section 5. Acceptance: screenshots at 800x450 and 1920x1080; no duplicate HUD; text readable at DPR 1; no fullscreen button, no external links.

**M5 - Input and mobile (about 500 lines).** `core/Input.js` with the touch joystick and buttons; no orientation overlay; safe areas. Acceptance: phone emulator and a real phone: drive, dig, dump, camera, pause all work with thumbs.

**M6 - Portal minimal (about 450 lines).** Reuse `Portal.js`: safe SDK load with a 3 s timeout, loading bar tied to real steps, `loadingStart/Stop`, `gameplayStart` when the player first has control, `gameplayStop` on pause or hidden tab, saves through SDK data with the localStorage fallback. The loop in Portal must stop after loading. No ads. Read /sdk/game and /sdk/data first. Acceptance: game runs identically with the SDK blocked; the console shows the events when the SDK is present.

**M7 - Jobs, economy, save (about 800 lines).** `gameplay/Jobs.js`, shop, stars, daily bonus, tutorial (3 visual steps, skippable). Acceptance: all 5 jobs play, locks work, progress survives a reload, shop prices as in 3.4.

**M8 - Skill course, polish, performance (about 600 lines).** Connect `SkillCourse.js`, quality tiers, throttled-CPU test, build size. Acceptance: 30 FPS at 4x CPU throttle, build under 20 MB, under 1500 files, first frame under 5 s.

**M9 - Submission pack.** Read /requirements/game-covers and /resources/getting-to-the-first-frame. Covers and a short video, description, controls text, test in Chrome, Edge, Safari, the 10 iframe sizes, the Developer Portal QA tool.

**Phase 4 (only after selection for Full Launch):** full SDK events, midgame and rewarded ads with ad-block fallback, mute during ads, account integration if applicable. Read /requirements/ads first.

Optional Executor upgrades (nice to have, never required): runtime telemetry that sends `window.onerror` and FPS samples to the Executor in dev builds, and a DELETE block.

---

## 11. Evidence rules

Never write "fixed", "works" or "done" for something you have not seen proof of. Use "applied, awaiting your test". Accept as proof: a screenshot, pasted console text, pasted Executor output, a numeric measurement the user read from the screen. Never invent file contents, line numbers or console output. If two sources disagree, say so and test.

---

## 12. Keeping the documents current

### 12.1 STATE.md update block
STATE.md is under 5 KB and is rewritten completely, or changed with a small EDIT block. After every answer that changes status, risks or plans, end with:

    STATE.md UPDATE (paste into Executor tab 1, then Preview, then Apply)
    @@@ FILE src/docs/STATE.md @@@
    ...complete new STATE.md...
    @@@ END @@@

(Indented here so this document stays safe to apply. In a real message the marker lines start at the beginning of the line.) If nothing changed, write "No state change". Change HANDOFF.md only with EDIT blocks and note the change in section 14.

### 12.2 REPORT (the AI gives this after every delivery)
    DONE: what was applied (files and line counts)
    VERIFIED: what has evidence, and what the evidence is
    NOT VERIFIED: what the user still has to test, in order
    RISKS: anything that might break
    NEXT: the next step and what is needed from the user

### 12.3 When an AI context is nearly full
Output a final STATE.md and the start message from section 0, so the next AI can continue. The user can also copy both files from the Executor Files tab at any time.

---

## 13. Revert procedure (the user runs one command; it changes no code that is not already bad)

It finds the commit titled "first full backup", saves everything now on disk onto a snapshot branch (nothing lost), creates the branch `clean-v1` from the baseline, and copies back only `src/docs`, `tools/executor.cjs` and `.gitignore` from the snapshot. RUN by the user on 2026-11-02. Result: baseline 4495a5e, main.js 658 lines (it was 2165 before), branches `snapshot-1102-0420` and `clean-v1`, game loads. Leftovers: many `*.bak*` files inside `src/` (local backups from earlier patches; git-ignored and harmless; safe to delete with `find src -name "*.bak*" -delete`). The revert is NOT yet on GitHub until the user clicks Save to GitHub (the push may need `git push -u origin clean-v1` once).
To go back to the broken state for reference: `git switch snapshot-MMDD-HHMM`.

---

## 14. Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-11-02 | Discard the evening changes, return to the baseline, branch `clean-v1` (DONE, verified) | Game did not load, changes judged useless |
| 2026-11-02 | The lead AI (a strong model on Arena or similar) writes the code itself; DeepSeek is optional and small-tasks-only | DeepSeek output quality was poor and it broke the game |
| 2026-11-02 | Add a recovery and Plan B section so work continues without the Executor, the Codespace or this AI | The user asked what happens if they lose any of them |
| 2026-11-02 | One master document and one live status file | The user wants any AI able to continue |
| 2026-11-02 | Final game defined in section 3 | Other AIs must build exactly one agreed game |
| 2026-11-02 | Rebuild weak modules per the file table, keep the verified ones | Quality, fewer files, fewer connections |
| 2026-11-02 | Do not rely on Arena file upload | Its help page lists TXT and CSV as unsupported |
| 2026-11-01 | Basic Launch first, ads last | CrazyGames docs |
| 2026-11-01 | No orientation overlay in the game | CrazyGames handles it |
| 2026-11-01 | Avoid the word JCB in visible text | Probable trademark |
| 2026-11-01 | Executor blocks instead of terminal scripts | The user cannot copy long commands reliably |
| Earlier | Truck stays fixed | Its collider is created once |
| Earlier | Rapier, not cannon-es | The project uses Rapier |

---

## 15. Recovery and Plan B

Where everything lives (keep all three up to date):
1. **GitHub**, repository `testsharm/gameprotype`, branch `clean-v1`: the game, the docs in `src/docs/`, and the Executor in `tools/executor.cjs`. Only true after the user clicks Save to GitHub.
2. **The Codespace disk.** It can be stopped or deleted.
3. **An emailed or downloaded copy of HANDOFF.md and STATE.md.** After each milestone the user downloads or emails these two files to themselves (20 seconds). Without them the decisions in section 3 are lost, because code alone does not record why.

| Level | Situation | What to do |
|---|---|---|
| 1 | Normal | Codespace running, Executor on port 3002, game on 5173 |
| 2 | Red dot in the Executor, or the page will not open | Run the start command from the Executor Help tab (VERIFIED), then open port 3002 in the Ports tab, then reload: `cd "$(git rev-parse --show-toplevel)"; pkill -f executor.cjs; nohup node tools/executor.cjs > .executor.log 2>&1 & sleep 2; cat .executor.log` |
| 3 | The Executor file is broken or lost | Restore it from GitHub or a branch: `git checkout clean-v1 -- tools/executor.cjs` (or from the `snapshot-*` branch). If no copy exists, ask any AI to write a new one from section 9.2 (about 300 lines: parse blocks, apply all or nothing, syntax check with `node --check`, backups, small web page). Test it on a copy of the project first |
| 4 | The Codespace is gone | On GitHub open the repository, switch to `clean-v1`, create a new Codespace on that branch. In its terminal run `npm install`, then `npm run dev -- --host` (game, port 5173), then the Executor start command (port 3002). Open both from the Ports tab. UNVERIFIED steps: the AI confirms each with the user |
| 5 | Executor not available at all (Plan B, by hand) | The AI sends only complete files (FILE blocks, never partial edits). The user opens the file in the editor, selects all (Ctrl+A), pastes, saves (Ctrl+S). Before each paste run `git add -A && git commit -m "before change"` so one command can undo it: `git checkout -- path/to/file`. Syntax mistakes show in the game page's red error overlay or in `npm run build`. Keep each file under about 1500 lines |
| 6 | No Codespace, using a computer | Install Node.js, then `git clone`, switch to `clean-v1`, `npm install`, `npm run dev`; the Executor starts the same way with `node tools/executor.cjs` |
| 7 | This AI is full, gone, or limited | Open a new chat with any AI, paste the start message from section 0 and the two files. The state lives in STATE.md, not in any AI's memory |
| 8 | Even the docs are lost | The repo and its git history remain. A new AI runs the recon commands in section 9.4 to learn the code, and the user re-confirms the game decisions from memory. This is the expensive case, which is why the emailed copy matters |

Safe habits: click Save to GitHub after every working milestone; never work on the same files in two AIs at once; never apply more than one milestone between saves; after any strange result, click Undo last apply first and investigate second.

---

## 16. Sources

CrazyGames docs read on 2026-11-01: docs.crazygames.com/requirements/intro, /technical, /gameplay, /quality and /resources/basic-launch-metrics.
Arena file upload help: help.arena.ai/articles/5595418316-arena-how-to-file-upload (updated 2026-02-25; the supported list in the text I could read was incomplete).
DeepSeek limits: sources disagree (third-party pages dated June to October 2026 mention 1M token context and 384K output on the V4 API; web chat limits unknown). Verify at api-docs.deepseek.com before relying on any number. The user's own experience of "Length limit reached" is the ground truth for the web chat.
