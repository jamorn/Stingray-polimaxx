/**
 * Global tuning values for the stingray swarm.
 * Bound directly to lil-gui so must stay mutable.
 *
 * Defaults are captured as frozen snapshots at module load, so "Reset All"
 * can restore them without a page reload.
 */
import type { EnvSettings, StingrayConfig } from "./types";

export const config: StingrayConfig = {
  // Population / swarm
  count: 15,
  bounds: 80,
  minSpeed: 0.12,
  maxSpeed: 0.2,
  turnSpeed: 0.012,
  spawnHeadingBias: 0.35,

  // Motion
  flapStrength: 0.6,
  flapSpeed: 0.75,

  // Eyes
  eyeHover: 0.08,
  eyeX: 0.45,
  eyeY: 1.5,

  // Body structure
  bodyDepth: 0.45,
  wingTaper: 0.15,
  segmentCount: 3,
  segmentBulge: 0.08,
  tailLength: 4.0,
  tailOffsetZ: 0,

  // Time
  timeScale: 1,

  // Colors
  baseColor: "#ef0101",
  eyeColor: "#62b828",
  tailColor: "#0e5167",

  // Glow — values shown in the GUI; scaled by the active preset at runtime.
  eyeGlow: 3.5,
  tailGlow: 5,
  /** Body skin self-illumination (kept low so the red stays red). */
  bodyGlow: 0.3,
  /** POLIMAXX / PP / POLYETHYLENE logo glow over the wings. */
  artworkGlow: 0.8,

  // Bloom
  bloomStrength: 1.2,
  bloomRadius: 0.4,
  bloomThreshold: 0.21,

  // Separation (boid-like avoidance)
  separationDist: 30,
  separationForce: 0.12,
};

/**
 * Environment / lighting settings per preset (Dark / Daylight).
 */
export const envSettings: EnvSettings = {
  background: "#000810",
  ambientIntensity: 1.0,
  sunIntensity: 0.8,
  rimIntensity: 1.5,
  fogNear: 40,
  fogFar: 150,
  showGrid: true,
  preset: "Dark",
};

/** Frozen snapshot of the initial config values. */
export const DEFAULT_CONFIG: Readonly<StingrayConfig> = Object.freeze({
  ...config,
});

/** Frozen snapshot of the initial environment values. */
export const DEFAULT_ENV: Readonly<EnvSettings> = Object.freeze({
  ...envSettings,
});

/**
 * Copies default values back into the live `config` object in place.
 * In-place mutation keeps every lil-gui controller bound to the same object.
 */
export function resetConfig(): void {
  Object.assign(config, DEFAULT_CONFIG);
}

/**
 * Copies default values back into the live `envSettings` object in place.
 */
export function resetEnvSettings(): void {
  Object.assign(envSettings, DEFAULT_ENV);
}
