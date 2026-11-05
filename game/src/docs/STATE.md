# STATE (live status)

## Saved on GitHub (branch clean-v1)
M0, M1, M2 audio, M3a to M3e, M4a to M4d, M4e dial v3, M7a part 1 (Jobs.js logic).

## M8 - DONE IN THIS CHANGE (the big one)
The game is no longer one highway repeated. It is a real level system now.

1. **Jobs are wired into the game.** `Jobs.js` is live in `main.js`: real load counts,
   per-job time limit, per-job reward, stars, XP, ranks, tips per load, daily bonus,
   job picker, briefing card, result window and fail window with "watch ad for +60 s".
   The old `JobManager` is gone from `main.js` (file still on disk, unused).
2. **Six different sites.** New file `src/gameplay/SiteSystem.js` (about 1000 lines)
   builds a completely different venue for every job: highway / park / bridge / night
   depot / storm zone / skyline construction. See `LEVELS.md`.
3. **Per-site sky, sun, fog and exposure.** `applyVenue()` in `main.js` moves the sky
   shader, sun light, hemisphere light, fog colour, fog density and tone mapping.
4. **Real movement of the job site.** New `World.moveJobSite()` moves the pile, the dirt
   patch, the cone ring and the blue truck (including its physics collider).
5. **Minimap fixed.** It now points at the real pile and shows the truck marker, instead
   of the old hardcoded 0,-100.
6. **CrazyGames SDK.** New file `src/core/CrazySDK.js`: `init`, `loadingStart/Stop`,
   `gameplayStart/Stop`, `happytime`, midgame ad on "Next", rewarded ad on fail,
   `muteAudio` portal setting. Silent no-op outside the portal (`?sdk=1` forces it on,
   `?nosdk=1` forces it off).
7. **Shop upgraded.** Engine / Hydraulics / Big Bucket with 4 levels each, prices from
   `Jobs.UPGRADES`, plus the rank line. Bucket level changes the tip per load.
8. **Onboarding is skippable** (CrazyGames quality guideline): a real "Skip tutorial"
   button on the tutorial card.
9. **Jobs HUD button** (`Jobs`, key `J`) opens the job picker from the game.

## Verified
- `npm run build` passes (33 modules).
- Headless smoke test: all 6 venues build 43-83 drawables each, night/storm add real
  lights, 100 physics bodies created and all removed on site change (no leaks).
- Headless logic test: job 1 completes with 3 stars, 195 coins + 30 tips + 220 XP,
  unlocks job 2; fail path + "add 60 s" now really gives 60 seconds.
- Site finder against the real `World.buildingData` (491 boxes, 978 props): all six
  sites found in 23 ms, no site on a road or inside a building.

## Next (in order)
1. Watch the six sites in the browser and note anything ugly (Screenshots help).
2. M7b: the shop window should use the same look as the new job windows.
3. M6: banners + adblock handling (needs the CrazyGames banner page from the user).
4. M8 polish: driver seat, garage and yard detail, different traffic cars.
5. Final clean-up: delete `JobManager.js`, `LevelSystem.js`, `AudioManager.js`,
   `SoundFX.js`, `Sfx2.js`, `DigSound.js`, `Music.js` (all replaced or unused), and the
   `jcb` names inside `Vehicle.js`.

## Open issues (known)
- Max speed seen 36 instead of 42 (Vehicle.js governor). Not touched in M8.
- Loud engine; reverse beeper probably never fires.
- Double camera button binding; empty `setCollidables` arrays in some paths.
- Traffic cars look similar.
- `scene.fog` is locked by `World.js` - always change `scene.fog.color/density`, never
  assign a new fog object.
