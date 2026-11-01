/**
 * Shared materials for all stingrays.
 * Materials are shared across instances for performance.
 */
import * as THREE from 'three';
import { config } from '../config';
import { createPolimaxxTexture } from '../utils/texture';

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
        emissiveIntensity: 2.0,
        shininess: 100,
    });

    const tail = new THREE.MeshStandardMaterial({
        color: config.tailColor,
        emissive: config.tailColor,
        emissiveIntensity: 1.5,
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
