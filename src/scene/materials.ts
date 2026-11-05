/**
 * Shared materials for all stingrays.
 * Materials are shared across instances for performance.
 */
import * as THREE from "three";
import { config } from "../config";
import { createPolimaxxTexture } from "../utils/texture";

export interface Materials {
  body: THREE.MeshStandardMaterial;
  /** Additive logo overlay drawn on top of the body (see Stingray). */
  artwork: THREE.MeshBasicMaterial;
  eye: THREE.MeshPhongMaterial;
  tail: THREE.MeshStandardMaterial;
}

export function createMaterials(): Materials {
  const textures = createPolimaxxTexture(config.baseColor);
  const body = new THREE.MeshStandardMaterial({
    map: textures.diffuse,
    // Self-illuminated skin: emissive colour follows the base colour while the
    // plain `map` (not an emissiveMap) drives the luminance. Intensity is kept
    // in `config.bodyGlow` so the red skin can glow without washing out.
    emissive: new THREE.Color(config.baseColor),
    emissiveIntensity: config.bodyGlow,
    roughness: 0.3,
    metalness: 0.2,
  });

  // Logo glow: a white-on-black mask added on top of the skin. Additive
  // blending means black contributes nothing, so only the lettering lights up.
  const artwork = new THREE.MeshBasicMaterial({
    map: textures.artworkMask,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: config.artworkGlow,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  // Ceiling for the per-instance slide pulse (see Stingray.update).
  artwork.userData.baseOpacity = config.artworkGlow;

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
  return { body, artwork, eye, tail };
}

/**
 * Replaces the body textures with freshly generated Polimaxx ones.
 * Disposes the old textures to avoid GPU memory leaks.
 */
export function updateBodyColor(materials: Materials, color: string): void {
  const textures = createPolimaxxTexture(color);
  materials.body.map?.dispose();
  materials.body.map = textures.diffuse;
  materials.body.emissive.set(color);
  materials.body.needsUpdate = true;

  materials.artwork.map?.dispose();
  materials.artwork.map = textures.artworkMask;
  materials.artwork.needsUpdate = true;
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
  materials.body.emissiveIntensity = config.bodyGlow * factor;
  // Additive overlay: opacity is the brightness control (black adds nothing).
  // `baseOpacity` is the ceiling the per-instance slide animation pulses under.
  const baseOpacity = Math.min(1, config.artworkGlow * factor);
  materials.artwork.userData.baseOpacity = baseOpacity;
  materials.artwork.opacity = baseOpacity;
}

/**
 * Animates the artwork glow as a soft "backlit sign" breathing pulse.
 * Driven once per frame from the main loop because the material is shared —
 * a per-instance pulse would fight over `opacity` and flicker.
 */
export function updateArtworkPulse(materials: Materials, timeSeconds: number): void {
  const base = (materials.artwork.userData.baseOpacity as number) ?? 0;
  const slide = 0.85 + 0.15 * Math.sin(timeSeconds * 1.5);
  materials.artwork.opacity = Math.min(1, base * slide);
}
