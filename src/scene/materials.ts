/**
 * Shared materials for all stingrays.
 * Materials are shared across instances for performance.
 */
import * as THREE from "three";
import { config } from "../config";
import { createPolimaxxTexture } from "../utils/texture";

export interface Materials {
  body: THREE.MeshStandardMaterial;
  eye: THREE.MeshPhongMaterial;
  tail: THREE.MeshStandardMaterial;
}

export function createMaterials(): Materials {
  const body = new THREE.MeshStandardMaterial({
    map: createPolimaxxTexture(config.baseColor),
    roughness: 0.3,
    metalness: 0.2,
  });

  const eye = new THREE.MeshPhongMaterial({
    color: config.eyeColor,
    emissive: config.eyeColor,
    emissiveIntensity: config.eyeGlow,
    shininess: 100,
  });

  const tail = new THREE.MeshStandardMaterial({
    color: config.tailColor,
    emissive: config.tailColor,
    emissiveIntensity: config.tailGlow,
  });

  return { body, eye, tail };
}

/**
 * Replaces the body texture with a freshly generated Polimaxx one.
 * Disposes the old texture to avoid GPU memory leaks.
 */
export function updateBodyColor(materials: Materials, color: string): void {
  materials.body.map?.dispose();
  materials.body.map = createPolimaxxTexture(color);
  materials.body.needsUpdate = true;
}

/**
 * Updates eye emissive color + base color together.
 */
export function updateEyeColor(materials: Materials, color: string): void {
  materials.eye.color.set(color);
  materials.eye.emissive.set(color);
}

/**
 * Updates tail base color + emissive color together.
 */
export function updateTailColor(materials: Materials, color: string): void {
  materials.tail.color.set(color);
  materials.tail.emissive.set(color);
}

/**
 * Preset factor applied to the GUI's glow values. Daylight rays should only
 * faintly glow, so both eye and tail are dimmed.
 */
const DAYLIGHT_GLOW_FACTOR = 0.2;

/**
 * Re-applies glow intensities from `config`, scaled for the given preset.
 * Called when the user moves a glow slider and after a preset change — so
 * the user's chosen values are never overwritten by a hardcoded constant.
 */
export function applyGlow(materials: Materials, daylight: boolean): void {
  const factor = daylight ? DAYLIGHT_GLOW_FACTOR : 1.0;
  materials.eye.emissiveIntensity = config.eyeGlow * factor;
  materials.tail.emissiveIntensity = config.tailGlow * factor;
}
