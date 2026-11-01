/**
 * DebugGUI — lil-gui panel bound to the live config.
 */
import GUI from "lil-gui";
import { config, envSettings } from "../config";
import type { EnvironmentPreset } from "../types";

export interface GUIHandlers {
  onPresetChange: (preset: EnvironmentPreset) => void;
  onGridVisibilityChange: (visible: boolean) => void;
  onBodyStructureChange: () => void;
  onBodyColorChange: (color: string) => void;
  onEyeColorChange: (color: string) => void;
  onTailColorChange: (color: string) => void;
  /** Re-applies eye + tail emissive intensity from config. */
  onGlowChange: () => void;
  /** Called when the user presses "Reset All" — after defaults are restored. */
  onReset: () => void;
}

/**
 * Builds the debug GUI. The panel starts closed to keep the scene clean.
 */
export function createGUI(handlers: GUIHandlers): GUI {
  const gui = new GUI({ title: "Polimaxx Stingray Swarm" });

  const envFolder = gui.addFolder("Environment Settings");
  envFolder
    .add(envSettings, "preset", ["Dark", "Daylight"] as const)
    .name("Mode Preset")
    .onChange((v: EnvironmentPreset) => handlers.onPresetChange(v));
  envFolder
    .add(envSettings, "showGrid")
    .name("Show Grid")
    .onChange((v: boolean) => {
      handlers.onGridVisibilityChange(v);
    });

  const motionFolder = gui.addFolder("Stingray Motion");
  motionFolder.add(config, "flapSpeed", 0.1, 2.0).name("Flap Speed");
  motionFolder.add(config, "flapStrength", 0.1, 2.0).name("Flap Strength");
  motionFolder
    .add(config, "spawnHeadingBias", 0, 1, 0.01)
    .name("Inward Bias (spawn)")
    .onChange(() => handlers.onBodyStructureChange());

  const bodyFolder = gui.addFolder("Body Structure");
  bodyFolder
    .add(config, "bodyDepth", 0.1, 1.0)
    .name("Center Thickness")
    .onChange(() => handlers.onBodyStructureChange());
  bodyFolder
    .add(config, "wingTaper", 0.05, 1.0)
    .name("Wing Taper (Slope)")
    .onChange(() => handlers.onBodyStructureChange());
  bodyFolder
    .add(config, "segmentCount", 0, 8, 1)
    .name("Body Segments")
    .onChange(() => handlers.onBodyStructureChange());
  bodyFolder
    .add(config, "segmentBulge", 0, 0.3, 0.01)
    .name("Segment Bulge")
    .onChange(() => handlers.onBodyStructureChange());
  bodyFolder
    .add(config, "tailLength", 1.0, 10.0, 0.1)
    .name("Tail Length")
    .onChange(() => handlers.onBodyStructureChange());

  const colorFolder = gui.addFolder("Stingray Appearance");
  colorFolder
    .addColor(config, "baseColor")
    .name("Body Color")
    .onChange((v: string) => handlers.onBodyColorChange(v));
  colorFolder
    .addColor(config, "eyeColor")
    .name("Eye Color")
    .onChange((v: string) => handlers.onEyeColorChange(v));
  colorFolder
    .addColor(config, "tailColor")
    .name("Tail Color")
    .onChange((v: string) => handlers.onTailColorChange(v));

  const glowFolder = gui.addFolder("Neon Glow (Night)");
  glowFolder
    .add(config, "eyeGlow", 0, 5, 0.05)
    .name("Eye Glow")
    .onChange(() => handlers.onGlowChange());
  glowFolder
    .add(config, "tailGlow", 0, 5, 0.05)
    .name("Tail Glow")
    .onChange(() => handlers.onGlowChange());

  // --- Actions — restores every value to its initial state ---
  const actions = {
    resetAll: () => handlers.onReset(),
  };
  gui.add(actions, "resetAll").name("⟲ Reset All");

  gui.close();
  return gui;
}
