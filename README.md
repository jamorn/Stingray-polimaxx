# README.md

```markdown
# Single Stingray — Swimming In Place

A single-page WebGL simulation of a stingray hovering in place, built with **Three.js r128**. The ray flaps its wings, whips its tail, and floats gently — all driven by procedural vertex deformation (no skeletal rigging, no external models). A dark/daylight preset toggle plus a live `lil-gui` panel let you tune the look in real time.

Everything lives in a single file: `singgle_stingray.html`. Open it in a modern browser and it just runs.

---

## Quick Start

```bash
# Any static server works — or just double-click the file.
python3 -m http.server 8000
# → http://localhost:8000/singgle_stingray.html
```

No build step. No npm install. Three.js, the post-processing passes, and `lil-gui` are pulled from CDN at load time.

**Requirements:** a browser with WebGL 2 (Chrome, Edge, Firefox, Safari 15+). Mobile works too — touch orbit + pinch zoom are wired up.

---

## Features

- **Procedural wing flap** — each wing vertex is displaced by a sine wave whose amplitude grows with distance from the body center, so the spine stays rigid and the tips whip.
- **Smooth tail whip** — a single high-resolution cone (48 height segments) bent by a smoothstep-enveloped sine wave. No visible "sausage" joints.
- **Hovering in place** — the whole group drifts on a slow Lissajous-style path with gentle yaw / pitch / roll.
- **Branded texture** — the body texture is generated on a `<canvas>` at runtime (POLIMAXX / PP / POLYETHYLENE / IRPC). Changing the body color rebuilds it.
- **Dark / Daylight presets** — one click swaps background, fog, light intensities, bloom strength, grid color, and UI theme.
- **Live GUI** — flap speed/strength, body thickness, wing taper, body color, eye color.
- **UnrealBloom post-processing** — glow effect tunable via preset.

---

## Controls

### Mouse
| Action | Effect |
|---|---|
| Drag | Orbit camera |
| Scroll | Zoom (clamped 15–200) |

### Touch
| Action | Effect |
|---|---|
| One-finger drag | Orbit camera |
| Two-finger pinch | Zoom |

The top-left button toggles Dark ↔ Daylight. The bottom-left card is informational only.

---

## Project Structure

```
singgle_stingray.html
├── <style>              — UI chrome (mode button, info card)
├── <body>               — canvas mount + UI elements
└── <script>
    ├── Config            — all tunable constants (config, PRESETS, TAIL, WING_*)
    ├── Helpers           — getBrightness, createPolimaxxTexture
    ├── class SingleStingray
    │   ├── _initMesh()   — body extrude + eyes + tail cone + UV setup
    │   ├── _disposeMesh()— geometry cleanup (safe re-init)
    │   ├── update()      — per-frame hover + wing flap + eyes
    │   └── _updateTail() — smoothstep-weighted tail bend
    ├── Environment       — updateGridColor, applyPreset
    ├── GUI               — initGUI (lil-gui wiring)
    ├── Init              — scene/renderer/lights/composer setup
    ├── Interactions      — pointer + wheel + pinch handling
    └── Animation loop    — animate()
```

---

## Tunable Parameters

All live at the top of the `<script>` block. Edit them before loading, or via the GUI at runtime.

### `config` — per-entity
| Key | Default | Description |
|---|---|---|
| `flapStrength` | `0.65` | Wing + tail amplitude multiplier |
| `flapSpeed` | `0.8` | Animation rate multiplier (linear) |
| `eyeHover` | `0.08` | Eye lift off the wing surface |
| `eyeX`, `eyeY` | `0.45`, `1.5` | Eye position (local units) |
| `bodyDepth` | `0.45` | Extrude depth of the body |
| `wingTaper` | `0.15` | Wing tip thickness ratio (1.0 = no taper) |
| `tailLength` | `4.0` | Tail cone length (local units) |
| `baseColor` | `#ef0101` | Body texture base (regenerated on change) |
| `eyeColor` | `#3928b8` | Eye color + emissive |
| `tailColor` | `#0e5167` | Tail color + emissive |
| `scale` | `3.5` | Group scale (applied once) |
| `bloomRadius` | `0.4` | UnrealBloom radius |
| `bloomThreshold` | `0.21` | UnrealBloom luminance threshold |

### `PRESETS.Dark` / `PRESETS.Daylight`
| Key | Dark | Daylight |
|---|---|---|
| `background` | `#000810` | `#88ccff` |
| `ambient` | `1.0` | `1.6` |
| `sun` | `0.8` | `1.2` |
| `rim` | `1.5` | `0.6` |
| `fogNear` / `fogFar` | 40 / 150 | 60 / 300 |
| `bloom` | `1.5` | `0.2` |
| `eyeEmissive` | `2.0` | `0.4` |
| `tailEmissive` | `1.5` | `0.2` |
| `grid` | `0x00ffff` | `0x004488` |

### `TAIL`
| Key | Default | Description |
|---|---|---|
| `radialSegments` | `20` | Silhouette smoothness |
| `heightSegments` | `48` | Wave bend smoothness — keep high |
| `rootRadius` | `0.06` | Root cone radius |
| `waveAmplitude` | `0.45` | Peak sideways displacement at tip |
| `waveFrequency` | `3.0` | Kinks along the tail |
| `normalUpdateEvery` | `3` | Recompute vertex normals every N frames |
| `speedFactor` | `2.5` | Tail oscillates faster than wings |

### Feature flags
| Flag | Default | Effect |
|---|---|---|
| `USE_ACES_TONEMAPPING` | `false` | Enable ACES filmic + sRGB output. Changes the look — retune `bloom` if you flip it. |
| `WING_EDGE`, `WING_SLOPE` | `0.4`, `1.2` | Wing flap amplitude curve (`amp = (d − 0.4) × 1.2` for `d > 0.4`). |

---

## How It Works

### Wing deformation
The body is an `ExtrudeBufferGeometry` from a hand-tuned `THREE.Shape` (a diamond with rounded wing tips). Each frame:

1. Start from a cached copy of the original vertex positions (`initialPositions`).
2. For each vertex, compute `d = |x|` (distance from the spine).
3. If `d ≤ WING_EDGE` (`0.4`), leave the z untouched — the spine stays flat.
4. Otherwise apply a sine wave whose amplitude scales with `(d − WING_EDGE)`:
   ```js
   wave = sin(t + d * 1.8 - y * 0.5) * 0.35 * amp * flapStrength
   ```
5. Write directly into the typed array and set `needsUpdate` once.

The typed-array access (no `getX` / `setZ` per vertex) keeps this cheap even at 60 fps.

### Tail deformation
The tail is **one** `ConeBufferGeometry` translated so its root sits at the body's tail tip. Every frame:

1. For each vertex, compute `vt = (y − 1.8) / tailLen` clamped to `[0, 1]`.
2. Apply a smoothstep envelope `amp = vt² (3 − 2·vt)` so the root is rigid and the tip whips.
3. Displace x by `sin(tailTime − vt·freq) · amplitude · amp · flapStrength`.
4. Recompute normals every `TAIL.normalUpdateEvery` frames (staggered) so lighting follows the whip without paying full cost per frame.

### Hover motion
The whole group drifts on a slow Lissajous path:
```js
position.x = sin(t·0.6·0.4) · 0.8
position.y = sin(t·0.6)     · 1.2
position.z = cos(t·0.6·0.3) · 0.5
```
Plus small yaw / pitch / roll oscillations on the group and mesh, so the ray always looks like it's "holding position" against a current.

---

## Performance Notes

- **DPR is capped at 2.** `UnrealBloomPass` does multiple full-screen blurs; on 3× devices the cost is prohibitive.
- **Geometry is disposed** on every re-init (`bodyDepth` / `wingTaper` change) and every grid rebuild (preset switch). Without this, dragging a slider would leak GPU memory.
- **Texture regeneration** (2048×1024 canvas) uses `onFinishChange`, not `onChange` — so dragging the color picker doesn't rebuild on every intermediate frame.
- **Per-frame delta is clamped** to 100 ms, and `lastTimestamp` resets on `visibilitychange` — prevents the animation jumping after a tab switch or long GC pause.
- **Frustum culling is disabled** on the body and tail meshes — their vertices deform past the initial bounding sphere, so culling would cause popping at extreme camera angles.
- **Typed-array hot loops** — both wing and tail deformation write directly into `Float32Array`s and touch `needsUpdate` once.

---

## Known Limitations

- No shadows (deliberately — the ray floats in an abstract environment).
- The eye geometry is shared between `eyeL` and `eyeR`; dispose the shared geometry once, and both meshes are freed.
- `flapSpeed` is now **linear** across hover, wings, and tail. The previous version applied it twice to the tail, which meant slider changes felt non-linear. If you want the old tail speed, tune `TAIL.speedFactor`.
- `USE_ACES_TONEMAPPING = true` shifts colors and bloom; retune `PRESETS.Dark.bloom` / `PRESETS.Daylight.bloom` after enabling.

---

## Credits

- **Three.js** (r128) — https://threejs.org
- **lil-gui** — https://lil-gui.georgealways.com
- Body texture, wing/tail animation, and all tuning hand-built for this demo.

---

## License

MIT — do what you want with it.
```

---

ถ้าอยากให้ผมปรับ section ไหนเพิ่ม (เช่นใส่ภาพ screenshot placeholder, ใส่ changelog, หรือเขียนเป็นภาษาไทยด้วย) บอกได้เลยครับ
