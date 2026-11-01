/**
 * DebugGUI — lil-gui panel bound to the live config.
 */
import GUI from 'lil-gui';
import { config, envSettings } from '../config';
import type { EnvironmentPreset } from '../types';

export interface GUIHandlers {
    onPresetChange: (preset: EnvironmentPreset) => void;
    onBodyStructureChange: () => void;
    onBodyColorChange: (color: string) => void;
    onEyeColorChange: (color: string) => void;
}

/**
 * Builds the debug GUI. The panel starts closed to keep the scene clean.
 */
export function createGUI(handlers: GUIHandlers): GUI {
    const gui = new GUI({ title: 'Polimaxx Stingray Swarm' });

    const envFolder = gui.addFolder('Environment Settings');
    envFolder
        .add(envSettings, 'preset', ['Dark', 'Daylight'] as const)
        .name('Mode Preset')
        .onChange((v: EnvironmentPreset) => handlers.onPresetChange(v));
    envFolder
        .add(envSettings, 'showGrid')
        .name('Show Grid')
        .listen();

    const motionFolder = gui.addFolder('Stingray Motion');
    motionFolder.add(config, 'flapSpeed', 0.1, 2.0).name('Flap Speed');
    motionFolder.add(config, 'flapStrength', 0.1, 2.0).name('Flap Strength');

    const bodyFolder = gui.addFolder('Body Structure');
    bodyFolder
        .add(config, 'bodyDepth', 0.1, 1.0)
        .name('Center Thickness')
        .onChange(() => handlers.onBodyStructureChange());
    bodyFolder
        .add(config, 'wingTaper', 0.05, 1.0)
        .name('Wing Taper (Slope)')
        .onChange(() => handlers.onBodyStructureChange());

    const colorFolder = gui.addFolder('Stingray Appearance');
    colorFolder
        .addColor(config, 'baseColor')
        .name('Body Color')
        .onChange((v: string) => handlers.onBodyColorChange(v));
    colorFolder
        .addColor(config, 'eyeColor')
        .name('Eye Color')
        .onChange((v: string) => handlers.onEyeColorChange(v));

    gui.close();
    return gui;
}
