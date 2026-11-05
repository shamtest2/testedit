# testedit

This repository has two independent projects:

| Folder | What it is |
|---|---|
| `index.html` (root) | EpicFlowz Max Studio - the browser video editor that was already in this repository |
| `game/` | **TerraForm 3D** - the three.js + Rapier backhoe loader game for CrazyGames (source mirrored from `testsharm/gameprotype`, branch `clean-v1`) |

## The game

```bash
cd game
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in game/dist/
```

What changed in this branch (M8, the deep level build):

- every job is a **different location** with its own 3D venue, sky, sun, fog and weather
  (highway, park, bridge, night depot, storm zone, skyline construction);
- the full job system is wired in: loads, timers, stars, XP, ranks, tips, daily bonus,
  job picker, result and fail windows;
- CrazyGames SDK integration (loading, gameplay start/stop, happytime, midgame and
  rewarded ads, portal mute setting);
- Big Bucket upgrade, rank display, skippable onboarding, live minimap.

Read `game/src/docs/LEVELS.md` for the six sites and `game/src/docs/STATE.md` for the
current status.

## Getting this back into your game repo

`terraform-m8-vs-clean-v1.patch` at the root of this repository is a plain `git` patch
against `testsharm/gameprotype` branch `clean-v1` (verified: it applies to a fresh clone
and the patched clone builds).

In your Codespace:

```bash
cd "$(git rev-parse --show-toplevel)"
git checkout clean-v1
git apply --check terraform-m8-vs-clean-v1.patch   # dry run, must print nothing
git apply terraform-m8-vs-clean-v1.patch
npm run build                                      # must end with "built in ..."
```

Then reload the game tab (Vite picks the change up on its own).
