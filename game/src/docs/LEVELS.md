# LEVELS - the six sites (M8)

Every job now happens in a **different place in the city and looks different**.
This file explains what was built, where it is, and how to add a seventh site.

The two files that make it work:

| File | Job |
|---|---|
| `src/gameplay/Jobs.js` | job table (loads, time, reward, story), economy, ranks, daily bonus, star rating, site finder |
| `src/gameplay/SiteSystem.js` | builds the 3D venue of a job: ground, structures, props, lights, weather, colliders |

`src/gameplay/JobManager.js` and `src/gameplay/LevelSystem.js` are **old** and no longer used.
They can be deleted in the final clean-up.

---

## 1. The six jobs

| # | Job | Venue | Loads | Time | Reward | Sky / mood |
|---|---|---|---|---|---|---|
| 1 | Clear the Highway | Harbour Highway | 3 | 3:00 | 150 | clear blue day |
| 2 | Park Clean-up | Riverside Park | 4 | 3:30 | 220 | bright day, green |
| 3 | Bridge Repair | Old Iron Bridge | 5 | 4:30 | 300 | blue-grey, hazy |
| 4 | Night Shift | Night Shift Depot | 5 | 4:10 | 380 | night, floodlights |
| 5 | Storm Rescue | Storm Rescue Zone | 6 | 5:20 | 480 | storm, rain, thick fog |
| 6 | Skyline Foundation | Skyline Foundation | 8 | 7:30 | 600 | golden morning |

Job 6 also needs **Engine level 2**. Every job after the first needs the one before it finished.
Rewards: first clear = 100% of the reward, replay = 40%. Stars add 0 / 15 / 30 %.
Tips per load come from the Big Bucket upgrade: 10 / 16 / 24 / 34 coins.

## 2. What you see at each site

**1 - Harbour Highway** (default site, 0 / -120)
Closed lanes with painted markings, jersey barriers both sides, a real `ROAD CLOSED` gantry
sign over the road, guardrail, traffic drums with reflective bands, and a broken-down red
car with flashing hazard lights.

**2 - Riverside Park**
Grass ground, a pond with a stone rim, 14 trees, two long hedges, three wooden benches,
two glowing park lamps, a gravel path, a low fence and a landslide scar with a rubble fan.

**3 - Old Iron Bridge**
A canal with water under a raised steel deck, railings with X bracing on both sides, truss
arches, expansion joints, orange safety netting, a scaffolding tower and warning flags that
move in the wind.

**4 - Night Shift Depot**
Two 13 m floodlight masts with real spotlights on the work pad, a flickering `NIGHT CREW`
neon sign, a generator trailer, a parked dump truck with tail lights, glow lamps along the
fence line and hazard chevrons painted on the ground.

**5 - Storm Rescue Zone**
1400 animated rain drops, six mirror-like puddles, a collapsed retaining wall with bent
rebar, a sandbag line, a rescue van with a flashing blue beacon, warning tape in the wind
and thick grey fog.

**6 - Skyline Foundation**
A 34 m tower crane with a swinging hook, a foundation pit with formwork walls and a rebar
grid, a half-built concrete tower with floor slabs and column stubs, scaffolding, a cement
mixer, a portacabin with a lit window and pallets of blocks.

Every site also gets: its own ground texture, an apron ring, a name board at the entrance,
cones on the approach lanes, marker posts, scattered spoil, a fence run, a site office
container, fuel drums, a work light, and a painted truck pad with arrows.

## 3. Where the sites are

`Jobs.js` searches the real city for free ground for each job (it reads the same building
data the physics uses). With the current city the six sites are:

| Job | Pile (x, z) | Truck (x, z) |
|---|---|---|
| 1 | 0, -120 | 15, -120 |
| 2 | 186, -2 | 186, -20 |
| 3 | -190, -2 | -214, -2 |
| 4 | -2, 134 | 18, 134 |
| 5 | -54, -214 | -54, -188 |
| 6 | 266, -34 | 266, -4 |

The finder runs once per session (about 25 ms) and never puts a site on a road, inside a
building, or on top of another site. If it cannot find free ground it falls back to the
highway site, so a job can never break.

`World.moveJobSite(pileX, pileZ, truckX, truckZ)` moves the dirt pile, the dirt patch, the
cone ring and the blue truck, and it also moves the truck's physics collider so you can not
drive through it.

## 4. Sky, sun and fog per site

`SiteSystem.js` exports `VENUES`. Each entry sets the sky shader (top / bottom / sun colour
and sun direction), the sun light, the hemisphere light, the fog colour and density, and the
tone-mapping exposure. `main.js` applies it in `applyVenue(job)` every time a job starts.
Fog must be changed by editing `scene.fog.color` / `scene.fog.density` because `World.js`
locks the `scene.fog` property on purpose.

## 5. How to add site number 7

1. Add a job to `JOBS` in `src/gameplay/Jobs.js` (`site: { bearing, dist, spread, gap }`).
2. Add a `VENUES[7]` entry in `src/gameplay/SiteSystem.js` with `key: 'quarry'` (any new name).
3. Write `_venue_quarry()` inside the `SiteSystem` class. Everything is built in local
   space: the pile is at `0, 0, 0` and local `+Z` points back toward the garage.
   Use the helpers `_box`, `_cyl`, `_inst`, `_std`, `_board`, `_collider`, `_sign`.
4. Nothing else needs to change - `build()` finds `_venue_<key>` by name.

Rules kept by every venue (so the game stays playable):
- keep the area around `0,0` (the pile) and around `info.localTruck` (the truck) free,
- never block local `+Z` (that is the way in),
- add `_collider(...)` for anything the player can crash into,
- use `_inst` for anything repeated more than four times,
- everything is disposed automatically, so no `dispose()` code is needed in a venue.
