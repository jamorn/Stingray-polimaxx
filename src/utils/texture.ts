/**
 * Brand colors + procedural Polimaxx logo texture generation.
 */
import * as THREE from 'three';

export const BRAND = {
    blue: '#0e3a66',
    orange: '#f37021',
} as const;

/**
 * Perceived brightness (0–255) of a hex color, used to pick a
 * contrasting text color for the logo.
 */
export function getBrightness(hexColor: string): number {
    const rgb = parseInt(hexColor.replace('#', ''), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
    return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * Builds a CanvasTexture containing the POLIMAXX / PP / POLYETHYLENE
 * branding on both faces of the stingray's wings (left & right mirrored).
 */
export function createPolimaxxTexture(color = '#ffffff'): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Unable to acquire 2D context for Polimaxx texture canvas');
    }

    const textColor = getBrightness(color) > 140 ? BRAND.blue : '#ffffff';

    // Base body color
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Brand stripes top & bottom
    ctx.fillStyle = BRAND.orange;
    ctx.fillRect(0, 0, 2048, 60);
    ctx.fillStyle = BRAND.blue;
    ctx.fillRect(0, 964, 2048, 60);

    const drawLogoSet = (offsetX: number, isMirror = false): void => {
        ctx.save();
        ctx.translate(offsetX + 512, 512);
        if (isMirror) ctx.scale(-1, 1);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 10;

        ctx.fillStyle = textColor;
        ctx.font = 'bold 44px Arial';
        ctx.fillText('POLIMAXX', 0, -145);

        ctx.fillStyle = BRAND.orange;
        ctx.font = '900 220px Arial';
        ctx.fillText('PP', 0, -10);

        ctx.fillStyle = textColor;
        ctx.font = 'bold 38px Arial';
        ctx.fillText('POLYETHYLENE', 0, 105);

        ctx.restore();
    };

    drawLogoSet(0, false);
    drawLogoSet(1024, true);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}
