# TerraForm 3D (backhoe loader simulator for CrazyGames)

A three.js + Rapier browser game. Six jobs, six different building sites.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Controls

| Key | Action |
|---|---|
| W A S D / arrows | drive |
| Space | brake |
| E | raise / lower the arm |
| F | scoop or dump (one action button) |
| C | change camera |
| R | restart the job |
| J | job list |
| P | pause |
| M | sound on / off |
| ` | debug overlay (dev build) |

Key bindings use physical key positions, so AZERTY keyboards work without changing anything.

## Docs

- `src/docs/STATE.md` - what is done, what is next
- `src/docs/LEVELS.md` - the six sites and how to add a seventh
- `src/docs/CONTINUE.md` - the full handoff document
