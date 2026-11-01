# Stingray Swarm — Polimaxx Interactive Env

Interactive 3D environment featuring an animated swarm of manta-ray–style stingrays
with Polimaxx branding on their wings. Built with **Three.js**, **TypeScript**, and
**Vite**.

> Self-contained: the entire app is bundled locally — **no CDN links required**.

---

## Features

- Procedurally generated stingray bodies with animated flapping wings, eyes, and a segmented tail
- Boid-style steering (random heading changes + separation from neighbours + soft bounds)
- Polimaxx / PP / POLYETHYLENE logo texture applied to both wing faces (mirrored)
- **Dark** and **Daylight** presets (background, lighting, fog, bloom, and grid colour)
- UnrealBloom post-processing for the glow effect
- lil-gui debug panel for live tuning (flap speed/strength, body structure, colors)
- Touch controls: 1-finger orbit, 2-finger pinch zoom, wheel zoom on desktop

---

## Quick start

```bash
npm install       # downloads Three.js, lil-gui and tooling into node_modules
npm run dev       # start dev server at http://localhost:5173
```

### Scripts

| Command             | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Vite dev server with HMR                             |
| `npm run typecheck` | `tsc --noEmit` (strict)                              |
| `npm run build`     | typecheck, then build a static bundle into `dist/`  |
| `npm run preview`   | Serve the built `dist/` locally at `:4173`          |

---

## Deploy → Ubuntu stand-alone

The `dist/` build is fully static (relative paths). Any HTTP server will do —
**Node.js is only needed to build, not to run.**

```bash
# 1. Build on the dev machine
npm install
npm run build

# 2. Copy the dist/ folder to the Ubuntu host
scp -r dist/ user@ubuntu-host:/var/www/stingray/

# 3. Serve it (simplest: Python 3, preinstalled on Ubuntu)
cd /var/www/stingray
python3 -m http.server 8000
# open http://<ubuntu-ip>:8000
```

Alternatively, serve the same folder with **Nginx** / **Apache** / `npx serve dist`.

---

## Deploy → Vercel + GitHub

1. Push this repository to GitHub.
2. Import the repo in Vercel — Vercel auto-detects Vite (or uses `vercel.json`).
3. Every push to `main` builds and deploys `dist/` automatically.
4. Pull requests get preview deployments.

`vercel.json` pins the build command and output directory to the same values Vite uses,
so both platforms produce identical artifacts.

---

## Project structure

```
├─ index.html               # Vite entry (no CDN links)
├─ vite.config.ts           # base './', manual chunks, dev server bind
├─ vercel.json              # Vercel build config
├─ tsconfig.json            # strict TypeScript
├─ legacy.html              # Original single-file version (reference only)
└─ src/
   ├─ main.ts               # App class — wires everything together
   ├─ config.ts             # Tunable config + env settings
   ├─ types.ts              # Shared type definitions
   ├─ scene/
   │   ├─ setupScene.ts     # Scene, camera, renderer, lights, bloom composer
   │   ├─ materials.ts      # Shared body/eye/tail materials
   │   ├─ Stingray.ts       # Stingray mesh + boid steering
   │   └─ Environment.ts    # Dark/Daylight presets + grid management
   ├─ controls/
   │   └─ OrbitInput.ts     # Pointer / touch / wheel camera controls
   ├─ ui/
   │   ├─ GUI.ts            # lil-gui panel
   │   └─ ModeToggle.ts     # Floating Dark/Daylight button
   ├─ utils/
   │   └─ texture.ts        # Polimaxx logo canvas texture
   └─ styles/
       └─ main.css          # Global styles + mode-toggle button
```

---

## Notes on differences from the legacy build

The legacy `legacy.html` remains available for reference. During the refactor a few
behavioural fixes were applied:

- **Heading changes** are now driven by real elapsed time, so lowering
  `flapSpeed` no longer freezes steering.
- **Device pixel ratio** is capped at 2 (previously the raw DPR was used, which
  could cause GPU strain on high-DPI phones).
- **Frame delta** is clamped to 50 ms so switching tabs does not make the swarm
  leap across the scene on return.
- **Textures and geometries** are disposed of when replaced or rebuilt, avoiding
  GPU memory leaks.
- The ray's direction vector now tracks the smoothed heading instead of the
  previous long-standing initial value.

All visual behavior, controls, keyboard/touch interactions, and the debug GUI work
the same as before.
