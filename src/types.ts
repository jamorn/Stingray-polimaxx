/**
 * Shared type definitions for the Stingray swarm application.
 */

export type EnvironmentPreset = 'Dark' | 'Daylight';

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
    tailCount: number;

    // Colors
    baseColor: string;
    eyeColor: string;
    tailColor: string;

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
    group: import('three').Group;
    radius: number;
}
