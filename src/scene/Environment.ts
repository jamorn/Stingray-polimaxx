/**
 * Environment — Dark / Daylight presets + grid helper management.
 */
import * as THREE from 'three';
import { envSettings } from '../config';
import type { EnvironmentPreset } from '../types';
import type { SceneBundle } from './setupScene';
import type { Materials } from './materials';

const GRID_Y = -60;

export class Environment {
    private gridHelper: THREE.GridHelper | null = null;

    constructor(
        private readonly bundle: SceneBundle,
        private readonly materials: Materials,
    ) {
        this.rebuildGrid(envSettings.preset);
    }

    /** Rebuilds the grid helper with the color matching the preset. */
    private rebuildGrid(preset: EnvironmentPreset): void {
        const { scene } = this.bundle;
        if (this.gridHelper) {
            scene.remove(this.gridHelper);
            this.gridHelper.geometry.dispose();
            const mat = this.gridHelper.material;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else mat.dispose();
        }

        const color = preset === 'Dark' ? 0x00ffff : 0x004488;
        this.gridHelper = new THREE.GridHelper(500, 50, color, color);
        this.gridHelper.position.y = GRID_Y;
        this.gridHelper.visible = envSettings.showGrid;
        scene.add(this.gridHelper);
    }

    /** Applies all preset-dependent values to the scene. */
    applyPreset(preset: EnvironmentPreset): void {
        envSettings.preset = preset;

        const { scene, bloomPass, ambientLight, sunLight, rimLight } = this.bundle;

        if (preset === 'Daylight') {
            envSettings.background = '#88ccff';
            envSettings.ambientIntensity = 1.6;
            envSettings.sunIntensity = 1.2;
            envSettings.rimIntensity = 0.6;
            envSettings.fogNear = 100;
            envSettings.fogFar = 500;

            bloomPass.strength = 0.2;
            this.materials.eye.emissiveIntensity = 0.4;
            this.materials.tail.emissiveIntensity = 0.2;
        } else {
            envSettings.background = '#000810';
            envSettings.ambientIntensity = 1.0;
            envSettings.sunIntensity = 0.8;
            envSettings.rimIntensity = 1.5;
            envSettings.fogNear = 40;
            envSettings.fogFar = 150;

            bloomPass.strength = 1.5;
            this.materials.eye.emissiveIntensity = 2.0;
            this.materials.tail.emissiveIntensity = 1.5;
        }

        this.rebuildGrid(preset);

        (scene.background as THREE.Color).set(envSettings.background);
        (scene.fog as THREE.Fog).color.set(envSettings.background);
        (scene.fog as THREE.Fog).near = envSettings.fogNear;
        (scene.fog as THREE.Fog).far = envSettings.fogFar;

        ambientLight.intensity = envSettings.ambientIntensity;
        sunLight.intensity = envSettings.sunIntensity;
        rimLight.intensity = envSettings.rimIntensity;
    }

    /** Toggles grid visibility (does not dispose). */
    setGridVisible(visible: boolean): void {
        envSettings.showGrid = visible;
        if (this.gridHelper) this.gridHelper.visible = visible;
    }

    dispose(): void {
        if (!this.gridHelper) return;
        this.bundle.scene.remove(this.gridHelper);
        this.gridHelper.geometry.dispose();
        const mat = this.gridHelper.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
        this.gridHelper = null;
    }
}
