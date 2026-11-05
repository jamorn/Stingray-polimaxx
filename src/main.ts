/**
 * Entry point — wires the scene, swarm, environment, input, and GUI together.
 */
import "./styles/main.css";

import { config, envSettings, resetConfig, resetEnvSettings } from "./config";

import { setupScene, handleResize, type SceneBundle } from "./scene/setupScene";
import {
  createMaterials,
  updateBodyColor,
  updateEyeColor,
  updateTailColor,
  applyGlow,
  updateArtworkPulse,
  type Materials,
} from "./scene/materials";
import { Stingray } from "./scene/Stingray";
import { Environment } from "./scene/Environment";

import { OrbitInput } from "./controls/OrbitInput";
import { ModeToggle } from "./ui/ModeToggle";
import { createGUI } from "./ui/GUI";

import type GUI from "lil-gui";

/** Clamp each animation frame step so tab-switching back doesn't jump. */
const MAX_FRAME_DELTA_MS = 50;

/**
 * A single frame slower than this (≈ <30fps) is treated as a hitch — e.g. the
 * frame where a newly built mesh compiles its shader / uploads geometry — rather
 * than real elapsed time. On such a frame we render but do NOT advance motion,
 * so a ray can never "warp" forward trying to catch up after a stall. Keeping it
 * well above one 60fps frame (~16.7ms) leaves normal jitter untouched.
 */
const HITCH_FRAME_MS = 33;

/**
 * How long the loading overlay stays up after every ray has been built and all
 * shaders compiled. This is deliberate dead time: it lets the GPU finish
 * uploading buffers and warm up bloom before the first ray is ever shown, so
 * the user never sees a stutter. Motion is frozen during the hold (delta = 0),
 * so the rays are still hidden and their spawn delays have not started ticking.
 */
const LOADING_HOLD_MS = 5000;

/**
 * If the WebGL context does not come back within this window after being
 * lost, the page reloads itself. A kiosk runs unattended for days, so a
 * self-heal is the only way back from a permanently lost context.
 */
const CONTEXT_LOSS_RELOAD_MS = 10_000;

class App {
  private readonly bundle: SceneBundle;
  private readonly materials: Materials;
  private readonly environment: Environment;
  private readonly orbitInput: OrbitInput;
  private readonly modeToggle: ModeToggle;
  private gui: GUI;
  private swarm: Stingray[] = [];
  /** Per-ray appearance delay (seconds), indexed the same as `swarm`. */
  private spawnDelays: number[] = [];

  private lastTimestamp = 0;
  private rafId = 0;
  /** Monotonic frame counter — used to stagger normal recomputation. */
  private frame = 0;
  /** Timer id for the context-loss self-heal. 0 when no loss is pending. */
  private contextLossReloadId = 0;
  /**
   * While true the loading overlay is up and motion is frozen: rays stay hidden
   * and their spawn delays do not tick. Cleared by `animate()` once the hold
   * window has elapsed, at which point the overlay fades out.
   */
  private holding = true;
  /** performance.now() timestamp at which the loading hold ends. */
  private loadingHoldUntil = 0;

  constructor() {
    this.bundle = setupScene();
    this.materials = createMaterials();
    this.environment = new Environment(this.bundle, this.materials);

    this.orbitInput = new OrbitInput(
      this.bundle.renderer.domElement,
      this.bundle.camera,
    );

    this.modeToggle = new ModeToggle((preset) => {
      this.environment.applyPreset(preset);
      this.syncGUI();
    });
    this.modeToggle.setPreset(envSettings.preset);

    this.gui = createGUI({
      onPresetChange: (preset) => {
        this.environment.applyPreset(preset);
        this.modeToggle.setPreset(preset);
        this.syncGUI();
      },
      onGridVisibilityChange: (visible) => {
        this.environment.setGridVisible(visible);
      },
      onBodyStructureChange: () => this.rebuildSwarm(),
      onBodyColorChange: (color) => updateBodyColor(this.materials, color),
      onEyeColorChange: (color) => updateEyeColor(this.materials, color),
      onTailColorChange: (color) => updateTailColor(this.materials, color),
      onGlowChange: () =>
        applyGlow(this.materials, envSettings.preset === "Daylight"),
      onReset: () => this.resetAll(),
    });

    // 1. Build every ray's mesh (all visible for now).
    this.buildSwarm();
    // 2. Compile all shaders + bloom while the meshes are visible, so nothing
    //    expensive happens after the user can see the scene.
    this.warmUp();
    this.warmUpComposer();
    // 3. Hide the rays and arm their staggered spawn delays.
    this.applySpawnDelays();
    this.bindEvents();
    this.start();
    // 4. Keep the loading overlay up for a fixed grace period. Motion is frozen
    //    until it elapses (see animate()), then it fades out and the rays begin
    //    to appear with no stutter.
    this.loadingHoldUntil = performance.now() + LOADING_HOLD_MS;
    this.holding = true;
  }

  /**
   * Pre-build every ray's mesh and compile all shaders while the loading
   * overlay is still up. Building + compiling is fast for 15 meshes (a few
   * dozen ms), but doing it lazily mid-animation caused a one-frame hitch that
   * read as the rays "warping" forward right after they appeared. Warming up
   * up front guarantees the render loop never stalls on a first-time compile.
   *
   * The meshes are visible here so `renderer.compile()` actually processes
   * them (it skips invisible objects). They are hidden again immediately after
   * and revealed one-by-one through the spawn delays in the render loop.
   */
  private warmUp(): void {
    const { scene, camera, renderer } = this.bundle;
    renderer.compile(scene, camera);
  }

  /**
   * Renders one full composer pass while the loading overlay still covers the
   * canvas. This warms up the bloom pass and its render targets — the first
   * composer render is noticeably more expensive than later ones, and doing it
   * here hides that cost behind the overlay instead of dropping a frame.
   */
  private warmUpComposer(): void {
    this.bundle.composer.render();
  }

  // --- Swarm management -------------------------------------------------

  /**
   * Builds every ray eagerly (once, behind the loading overlay) so the renderer
   * can compile all shaders ahead of time. `warmUp()` runs while every mesh is
   * still visible; `applySpawnDelays()` then hides them and reveals each one as
   * its delay elapses, so the GPU is already warm and no frame ever stalls.
   */
  private buildSwarm(): void {
    const groupCount = 3;
    const perGroupInterval = 0.5; // seconds between successive rays in a group
    const groupOffset = 0.2; // seconds between groups

    this.swarm = [];

    for (let i = 0; i < config.count; i++) {
      // Pass the rays already spawned so the new one lands clear of them.
      const ray = new Stingray(this.materials, this.swarm, i);

      const group = i % groupCount;
      const slotInGroup = Math.floor(i / groupCount);
      const delay = group * groupOffset + slotInGroup * perGroupInterval;
      this.spawnDelays[i] = delay;

      this.swarm.push(ray);
      this.bundle.scene.add(ray.group);
    }
  }

  /**
   * Hides every ray and staggers their appearance by their pre-computed delay.
   * Called only after `warmUp()` so the shaders are compiled while the meshes
   * are still visible (compile skips invisible objects).
   */
  private applySpawnDelays(): void {
    this.swarm.forEach((ray, i) => {
      ray.setSpawnDelay(this.spawnDelays[i] ?? 0);
    });
  }

  /** Rebuild all rays after structural config (thickness/taper) changes. */
  private rebuildSwarm(): void {
    this.swarm.forEach((ray) => {
      this.bundle.scene.remove(ray.group);
      ray.dispose();
    });
    this.swarm = [];
    this.buildSwarm();
    // Re-compile the freshly built meshes (still visible) before hiding them,
    // so a rebuild never hitches either. The new meshes then re-appear through
    // their normal staggered delays (no loading overlay here).
    this.warmUp();
    this.warmUpComposer();
    this.applySpawnDelays();
  }

  /**
   * Restores every config + environment value to its initial state and
   * re-applies all derived effects (colors, materials, preset, swarm, GUI).
   */
  private resetAll(): void {
    resetConfig();
    resetEnvSettings();

    // Derived state that was driven by the config values:
    updateBodyColor(this.materials, config.baseColor);
    updateEyeColor(this.materials, config.eyeColor);
    updateTailColor(this.materials, config.tailColor);
    this.environment.applyPreset(envSettings.preset); // also calls applyGlow()
    this.environment.setGridVisible(envSettings.showGrid);
    this.modeToggle.setPreset(envSettings.preset);
    this.rebuildSwarm();

    this.syncGUI();
  }

  // --- Lifecycle --------------------------------------------------------

  private bindEvents(): void {
    window.addEventListener("resize", this.onResize);
    // Pause when tab is hidden → resets delta on return.
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    // Kiosk self-healing: a long-running WebGL session can lose its GPU
    // context (driver reset, VRAM pressure, compositor hiccup). Without
    // these handlers the canvas freezes on a stale frame — which is what
    // looked like the rays melting into spirals. preventDefault() lets the
    // browser restore the context instead of abandoning it.
    const canvas = this.bundle.renderer.domElement;
    canvas.addEventListener("webglcontextlost", this.onContextLost, false);
    canvas.addEventListener(
      "webglcontextrestored",
      this.onContextRestored,
      false,
    );
  }

  private readonly onContextLost = (event: Event): void => {
    // Required so the browser will attempt to restore the context.
    event.preventDefault();
    console.warn("[WebGL] context lost — pausing render loop");
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;

    // If restoration never happens, reload the page so the kiosk heals.
    if (this.contextLossReloadId === 0) {
      this.contextLossReloadId = window.setTimeout(() => {
        console.warn("[WebGL] context not restored — reloading page");
        window.location.reload();
      }, CONTEXT_LOSS_RELOAD_MS);
    }
  };

  private readonly onContextRestored = (): void => {
    console.warn("[WebGL] context restored — resuming render loop");
    if (this.contextLossReloadId !== 0) {
      clearTimeout(this.contextLossReloadId);
      this.contextLossReloadId = 0;
    }
    // Drop the stale timestamp so the next frame has delta = 0 (no warp).
    this.lastTimestamp = 0;
    if (this.rafId === 0) this.start();
  };

  private readonly onResize = (): void => {
    handleResize(this.bundle);
  };

  private readonly onVisibilityChange = (): void => {
    if (!document.hidden) this.lastTimestamp = 0;
  };

  private start(): void {
    if (this.rafId !== 0) return;
    this.rafId = requestAnimationFrame(this.animate);
  }

  private readonly animate = (timestamp: number): void => {
    this.rafId = requestAnimationFrame(this.animate);

    const rawDelta = this.lastTimestamp ? timestamp - this.lastTimestamp : 0;
    this.lastTimestamp = timestamp;
    this.frame++;

    // Loading hold: keep rendering (so the GPU keeps warming up) but freeze the
    // simulation — rays stay hidden and spawn delays do not tick. Once the hold
    // window elapses, clear the flag and fade the overlay out on the next frame.
    if (this.holding && performance.now() >= this.loadingHoldUntil) {
      this.holding = false;
      this.hideLoading();
    }

    // A frame slower than ~30fps (a one-off GPU hitch) or a frame during the
    // loading hold is time we deliberately do not advance through: rays must
    // not warp forward trying to "catch up" after a stall or before they are
    // even visible. delta = 0 freezes motion for that frame.
    const isHitch = rawDelta > HITCH_FRAME_MS;
    const delta =
      this.holding || isHitch ? 0 : Math.min(rawDelta, MAX_FRAME_DELTA_MS);

    for (const ray of this.swarm) {
      ray.update(delta, this.swarm, this.frame);
    }

    // Shared artwork breathe pulse (material is shared → drive it once here).
    updateArtworkPulse(this.materials, timestamp * 0.001);

    this.bundle.composer.render();
  };

  // --- Helpers ----------------------------------------------------------

  /**
   * Fades out and removes the HTML loading overlay once the scene is warm.
   * It lives outside the render loop so the very first frame the user sees is
   * already a fully compiled, stutter-free one.
   */
  private hideLoading(): void {
    const overlay = document.getElementById("loading");
    if (!overlay) return;
    overlay.classList.add("hidden");
    // Remove from the DOM after the CSS fade so it never blocks pointer events.
    overlay.addEventListener("transitionend", () => overlay.remove(), {
      once: true,
    });
  }

  /** Refresh lil-gui controllers after an external state change. */
  private syncGUI(): void {
    this.gui.controllersRecursive().forEach((c) => c.updateDisplay());
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    if (this.contextLossReloadId !== 0) {
      clearTimeout(this.contextLossReloadId);
      this.contextLossReloadId = 0;
    }
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);

    const canvas = this.bundle.renderer.domElement;
    canvas.removeEventListener("webglcontextlost", this.onContextLost, false);
    canvas.removeEventListener(
      "webglcontextrestored",
      this.onContextRestored,
      false,
    );

    this.swarm.forEach((ray) => {
      this.bundle.scene.remove(ray.group);
      ray.dispose();
    });

    this.environment.dispose();
    this.orbitInput.dispose();
    this.modeToggle.dispose();
    this.gui.destroy();

    this.materials.body.map?.dispose();
    this.materials.body.dispose();
    this.materials.artwork.map?.dispose();
    this.materials.artwork.dispose();
    this.materials.eye.dispose();
    this.materials.tail.dispose();

    this.bundle.renderer.dispose();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new App();
});
