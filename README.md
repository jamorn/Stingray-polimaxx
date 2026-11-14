# Stingray Swarm — Polimaxx Interactive

A browser-based 3D scene of a swarm of stylized stingrays swimming in a bounded
volume, built with **Three.js r128** and **[lil-gui](https://lil-gui.georgealways.com/)**.
Rays wander, flap their wings, roll into turns, and — in the latest version —
steer around each other using a **bat-style echolocation** model instead of
passing straight through.

No build step. Everything is a single self-contained HTML file served from a CDN.

---

## Quick start

```bash
# any static server works, e.g.
python3 -m http.server 8080
# then open http://localhost:8080/x3.html
```

> Why a server? Opening the file directly via `file://` usually works, but some
> browsers restrict local script/resource loading. A tiny static server avoids
> surprises.

The latest and recommended entry point is **`x3.html`**.

---

## Versions

| File | Lines | What it is |
| --- | --- | --- |
| `x.html` | 674 | Original swarm: wandering, wing flap, roll, separation. |
| `x2.html` | 760 | "Reviewed / hardened" build: frame-rate-independent motion, GPU-safe rebuilds, shared geometry, centralized presets, UX fixes. |
| `x3.html` | 906 | **Latest.** Everything in `x2.html` **plus bat-style echolocation** (forward-sensing avoidance + debug cones). |

Other files (`multiple-stingray*.html`, `stingray-*`, `ocean*.html`) are earlier
experiments / prototypes kept for reference. They are not part of the main line.

### Review notes (for context)

- `kimi.ai.md` — review that drove the `x2.html` hardening pass.
- `commemt1.md` — idea write-up for bat echolocation (used as a *draft*; its code
  sample contained bugs that were fixed in `x3.html`, see below).
- `fix.md` — misc fixes / notes.

---

## Features (x3.html)

### Scene & rendering
- Three.js r128 via a single CDN (jsdelivr) — core + postprocessing + `lil-gui`.
- `EffectComposer` + `RenderPass` + `UnrealBloomPass` for a soft glow.
- `Scene.fog` tied to the background colour for depth.
- Infinite-feeling cyan grid at `y = -100`.
- `pixelRatio` capped at 2 for HiDPI screens.
- **Dark** and **Daylight** environment presets (single source of truth in
  `PRESETS`), switchable from the on-screen button or the GUI.

### Stingrays
- Procedural body from a `Shape` + `ExtrudeGeometry`, tapered toward the wingtips.
- Canvas-generated **Polimaxx / PP / IRON / IRPC** texture, mirrored on both wings.
- Wing flap: per-vertex sine wave, amplitude scaling from the body outward.
- Body roll into turns (frame-rate independent smoothing).
- Two eyes that ride the wing surface and stay mirrored via `getFlapWave(|x|)`.
- Whip-like tail: per-vertex sine wave with quadratic amplitude along its length.
- Random size tiers (small / medium / large with slower speed).
- Shared geometries (`SHARED_EYE_GEO`, `SHARED_TAIL_GEO`) → one GPU allocation
  for all rays instead of one per ray.

### Motion & steering
- Wander: periodically picks a new heading **relative to the current heading**.
- Bounds: steers back toward the centre when outside `config.bounds`.
- Separation: omni-directional, close-range safety push.
- **Bat echolocation** (new in `x3.html`):
  - Forward-facing detection cone (`echolocationConeAngle`, `echolocationRange`).
  - **Reciprocal rule**: steer to the opposite side of an oncoming neighbour so
    two rays meeting head-on dodge in opposite directions.
  - Urgency scales with `(1 - dist/range)²`.
  - Optional wireframe cones to visualise what each ray "sees".
- All motion is **frame-rate independent** (uses `delta`), so it looks the same
  at 30 / 60 / 120 fps.

### Interaction
- Drag (mouse or touch) to orbit.
- Pinch to zoom (mobile); mouse wheel to zoom (desktop).
- `Space` to pause / resume — **ignored while typing in a GUI input**.
- Browser context menu suppressed on the canvas (right-drag safe).

---

## GUI reference

The panel starts closed; click the title bar to open it.

### Environment Settings
- **Mode Preset** — `Dark` / `Daylight`. Updates background, lights, fog, bloom,
  eye/tail emissive and the grid colour together.

### Camera & Fog
- **Camera Pitch / Yaw / Zoom** — orbit the camera.
- **Fog Near / Far** — clamped so `near < far` is always maintained.

### Stingray Motion
- **Flap Speed** — how fast the wing/tail animation runs.
- **Flap Strength** — flap amplitude; at ~0 the per-frame vertex upload is skipped.

### Bat Echolocation (x3.html)
| Control | Meaning |
| --- | --- |
| **Enable** | Toggle the forward-sensing avoidance layer. |
| **Cone Angle (rad)** | Half-angle of the detection cone (default `π/3` ≈ 60°). |
| **Detection Range** | How far ahead a ray can "see". |
| **Avoid Strength** | How strongly it steers away. |
| **Show Cones** | Draw each ray's detection cone (wireframe, off by default). |

### Body Structure
- **Center Thickness** — `bodyDepth`; rebuilds the swarm on drag release.
- **Wing Taper (Slope)** — `wingTaper`; rebuilds the swarm on drag release.

### Stingray Appearance
- **Body Color** — repaints the canvas texture (applied on drag release to avoid
  re-uploading a 2048×1024 texture every tick).
- **Eye Color** — live emissive colour.

### Global
- **Playback Speed** — `timeScale`.
- **Pause / Resume (Space)** — same as the `Space` key.

---

## How the bat echolocation works

For each ray, `applyEcholocation()`:

1. Builds its **forward axis** in world space (`local +Z`, matching the direction
   the body actually moves).
2. Skips neighbours that are too far or outside the cone
   (`dot(forward, toNeighbour) < cos(coneAngle)`).
3. Decides which side the neighbour is on with `cross(forward, toNeighbour).y`.
4. Steers to the **opposite** side (reciprocal rule), so head-on pairs separate.
5. Accumulates steering weighted by `strength * (1 - dist/range)²`.

All of this uses **preallocated scratch vectors** — no per-frame allocations.

### Fixed vs the `commemt1.md` draft
The draft's code had several problems; `x3.html` corrects them:

- **Forward axis** was `(0,0,-1)`; rays move along `+Z`, so the cone pointed
  backward. Fixed to `(0,0,1)`.
- **Per-frame allocations** (`new THREE.Vector3()` inside the pair loop) caused
  GC hitches. Replaced with shared scratch vectors.
- The draft **reused `_lookTarget`** for the forward vector, clobbering a value
  that bounds-steering still needed. Echolocation now uses its own scratch set.
- **Side-choice jitter** when a neighbour is dead ahead (`cross.y ≈ 0`). Added an
  epsilon guard + deterministic tie-break.
- Debug cone is **per-instance** and properly `dispose()`d on rebuild.

---

## Architecture / code map (x3.html)

| Area | Location (approx.) |
| --- | --- |
| `config` (all tunables) | top of the inline script |
| `envSettings` + `PRESETS` | after `config` |
| Scratch vectors | before `class Stingray` |
| Shared geometries | before `class Stingray` |
| `class Stingray` — construction, `initMesh`, debug cone | middle |
| `class Stingray` — `update()` (wander, separation, bounds, flap) | middle |
| `applyEcholocation()` | end of `class Stingray` |
| `applyPreset()` / `disposeRay()` / `rebuildRays()` | after the class |
| `initGUI()` | after helpers |
| `init()` / interactions / `updateCamera()` / `animate()` | bottom |

Key patterns to preserve when editing:
- **`onFinishChange`** for anything expensive (rebuild, texture repaint).
- **Dispose per-instance geometry** in `disposeRay()`; never dispose the shared
  eye/tail geometries.
- **Reuse scratch vectors**; don't allocate inside per-frame loops.
- Keep `this.direction` and `this.targetDirection` in sync each frame.

---

## Tech notes & caveats

- **Three.js r128** is pinned. Moving to a newer major may require replacing
  `examples/js/*` script tags with ES modules.
- `*Geometry` names (not `*BufferGeometry`) are used; in r128 they are aliases,
  so behaviour is identical but there are no deprecation warnings.
- Vertex normals are **not** recomputed each frame during the wing flap — lighting
  doesn't track the fold. This is a deliberate performance/stylization trade-off.
- The scene is bounded; rays are steered inward rather than using a hard wall.
