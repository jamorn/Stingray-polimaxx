/**
 * ModeToggle — floating Dark/Daylight switch button in the top-left corner.
 */
import type { EnvironmentPreset } from '../types';

export class ModeToggle {
    private readonly button: HTMLButtonElement;
    private readonly icon: HTMLElement;
    private readonly text: HTMLElement;

    constructor(private readonly onToggle: (next: EnvironmentPreset) => void) {
        const button = document.getElementById('mode-toggle');
        const icon = document.getElementById('mode-icon');
        const text = document.getElementById('mode-text');

        if (!(button instanceof HTMLButtonElement) || !icon || !text) {
            throw new Error('ModeToggle: missing #mode-toggle / #mode-icon / #mode-text');
        }

        this.button = button;
        this.icon = icon;
        this.text = text;

        this.button.addEventListener('click', this.handleClick);
    }

    private readonly handleClick = (): void => {
        const next: EnvironmentPreset = this.button.classList.contains('daylight-ui')
            ? 'Dark'
            : 'Daylight';
        this.setPreset(next);
        this.onToggle(next);
    };

    /** Update the button's visual state (icon, label, colors). */
    setPreset(preset: EnvironmentPreset): void {
        const isDay = preset === 'Daylight';
        this.icon.textContent = isDay ? '☀️' : '🌙';
        this.text.textContent = isDay ? 'Daylight Mode' : 'Dark Mode';
        this.button.classList.toggle('daylight-ui', isDay);
        // Mirror the theme on <body> so other overlays (e.g. the control hint)
        // can follow the active preset without reaching into this component.
        document.body.classList.toggle('daylight-ui', isDay);
    }

    dispose(): void {
        this.button.removeEventListener('click', this.handleClick);
    }
}
