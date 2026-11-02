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

class App {
  private readonly bundle: SceneBundle;
  private readonly materials: Materials;
  private readonly environment: Environment;
  private readonly orbitInput: OrbitInput;
  private readonly modeToggle: ModeToggle;
  private gui: GUI;
  private swarm: Stingray[] = [];

  private lastTimestamp = 0;
  private rafId = 0;
  /** Monotonic frame counter — used to stagger normal recomputation. */
  private frame = 0;

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

    this.buildSwarm();
    this.bindEvents();
    this.start();
  }

  // --- Swarm management -------------------------------------------------

  private buildSwarm(): void {
    // Staggered spawn across a few groups so the initial load does not dump
    // all 15 meshes + shader compiles into a single frame. Rays appear one at
    // a time, groups offset from each other, which keeps the framerate steady
    // from the very first second (no warping/stutter on refresh).
    const groupCount = 3;
    const perGroupInterval = 0.9; // seconds between successive rays in a group
    const groupOffset = 0.3; // seconds between groups (→ one ray every 0.3s)

    for (let i = 0; i < config.count; i++) {
      // Pass the rays already in the scene so the new one spawns clear of them.
      const ray = new Stingray(this.materials, this.swarm, i);

      const group = i % groupCount;
      const slotInGroup = Math.floor(i / groupCount);
      const delay = group * groupOffset + slotInGroup * perGroupInterval;
      ray.setSpawnDelay(delay);

      this.swarm.push(ray);
      this.bundle.scene.add(ray.group);
    }
  }

  /** Rebuild all rays after structural config (thickness/taper) changes. */
  private rebuildSwarm(): void {
    this.swarm.forEach((ray) => {
      this.bundle.scene.remove(ray.group);
      ray.dispose();
    });
    this.swarm = [];
    this.buildSwarm();
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
  }

  private readonly onResize = (): void => {
    handleResize(this.bundle);
  };

  private readonly onVisibilityChange = (): void => {
    if (!document.hidden) this.lastTimestamp = 0;
  };

  private start(): void {
    this.rafId = requestAnimationFrame(this.animate);
  }

  private readonly animate = (timestamp: number): void => {
    this.rafId = requestAnimationFrame(this.animate);

    const delta = this.lastTimestamp
      ? Math.min(timestamp - this.lastTimestamp, MAX_FRAME_DELTA_MS)
      : 0;
    this.lastTimestamp = timestamp;
    this.frame++;

    for (const ray of this.swarm) {
      ray.update(delta, this.swarm, this.frame);
    }

    this.bundle.composer.render();
  };

  // --- Helpers ----------------------------------------------------------

  /** Refresh lil-gui controllers after an external state change. */
  private syncGUI(): void {
    this.gui.controllersRecursive().forEach((c) => c.updateDisplay());
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);

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
    this.materials.eye.dispose();
    this.materials.tail.dispose();

    this.bundle.renderer.dispose();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new App();
});
