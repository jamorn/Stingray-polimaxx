/**
 * Shared type definitions for the Stingray swarm application.
 */

export type EnvironmentPreset = "Dark" | "Daylight";

/**
 * Tunable parameters for the swarm and individual stingrays.
 * All properties are mutable so lil-gui can bind to them directly.
 */
export interface StingrayConfig {
  // Population / swarm
  count: number;
  bounds: number;
  minSpeed: number;
  maxSpeed: number;
  turnSpeed: number;
  /**
   * How strongly newly spawned rays aim at the swarm centre.
   * 0 = fully random heading, 1 = straight at the centre.
   */
  spawnHeadingBias: number;

  // Motion
  flapStrength: number;
  flapSpeed: number;

  // Eyes
  eyeHover: number;
  eyeX: number;
  eyeY: number;

  // Body structure
  bodyDepth: number;
  wingTaper: number;
  /** Number of ripples along the body (front-to-back). */
  segmentCount: number;
  /** Amplitude of the ripples, as a fraction of the local radius. */
  segmentBulge: number;
  /** Length of the tail cone along +Z of the body. */
  tailLength: number;
  /** Lateral offset of the tail root. */
  tailOffsetZ: number;

  // Time
  /** Global multiplier applied to every animation clock. */
  timeScale: number;

  // Colors
  baseColor: string;
  eyeColor: string;
  tailColor: string;

  // Glow (emissive) — scaled per preset at runtime
  /** Eye emissive intensity at 100% (Dark). Daylight uses a fraction. */
  eyeGlow: number;
  /** Tail emissive intensity at 100% (Dark). Daylight uses a fraction. */
  tailGlow: number;
  /** Body (base colour) emissive intensity at 100% (Dark). */
  bodyGlow: number;
  /** Logo artwork glow opacity at 100% (Dark). */
  artworkGlow: number;

  // Bloom
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;

  // Separation (boid-like avoidance)
  separationDist: number;
  separationForce: number;
}

/**
 * Environment / lighting values driven by the Dark / Daylight preset.
 */
export interface EnvSettings {
  background: string;
  ambientIntensity: number;
  sunIntensity: number;
  rimIntensity: number;
  fogNear: number;
  fogFar: number;
  showGrid: boolean;
  preset: EnvironmentPreset;
}

/**
 * Structural reference to the ray instance used by shared logic
 * (e.g. separation boids calculation) without importing the class.
 */
export interface SwarmMember {
  group: import("three").Group;
  radius: number;
}
