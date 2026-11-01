/**
 * Global tuning values for the stingray swarm.
 * Bound directly to lil-gui so must stay mutable.
 */
import type { EnvSettings, StingrayConfig } from './types';

export const config: StingrayConfig = {
    // Population / swarm
    count: 15,
    bounds: 80,
    minSpeed: 0.12,
    maxSpeed: 0.2,
    turnSpeed: 0.012,

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
    tailCount: 22,

    // Colors
    baseColor: '#ef0101',
    eyeColor: '#3928b8',
    tailColor: '#0e5167',

    // Bloom
    bloomStrength: 1.5,
    bloomRadius: 0.4,
    bloomThreshold: 0.21,

    // Separation (boid-like avoidance)
    separationDist: 15,
    separationForce: 0.05,
};

/**
 * Environment / lighting settings per preset (Dark / Daylight).
 */
export const envSettings: EnvSettings = {
    background: '#000810',
    ambientIntensity: 1.0,
    sunIntensity: 0.8,
    rimIntensity: 1.5,
    fogNear: 40,
    fogFar: 150,
    showGrid: true,
    preset: 'Dark',
};
