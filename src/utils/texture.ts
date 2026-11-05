/**
 * Brand colors + procedural Polimaxx logo texture generation.
 */
import * as THREE from "three";

export const BRAND = {
  blue: "#0e3a66",
  orange: "#f37021",
} as const;

/** Texture pair: the full-colour skin + a white-on-black logo mask. */
export interface PolimaxxTextures {
  /** Base-colour skin with the printed logo (used as `map`). */
  diffuse: THREE.CanvasTexture;
  /** White logo on black, for the emissive glow overlay (used as `map`). */
  artworkMask: THREE.CanvasTexture;
}

/**
 * Perceived brightness (0–255) of a hex color, used to pick a
 * contrasting text color for the logo.
 */
export function getBrightness(hexColor: string): number {
  const rgb = parseInt(hexColor.replace("#", ""), 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * Draws one POLIMAXX / PP / POLYETHYLENE logo block onto a canvas.
 * Solid fill only — `shadowBlur` is intentionally omitted for the mask so the
 * glow overlay has crisp edges.
 */
function drawLogoSet(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  textColor: string,
  isMirror: boolean,
  addShadow: boolean,
): void {
  ctx.save();
  ctx.translate(offsetX + 512, 512);
  if (isMirror) ctx.scale(-1, 1);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (addShadow) {
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 10;
  }

  ctx.fillStyle = textColor;
  ctx.font = "bold 44px Arial";
  ctx.fillText("POLIMAXX", 0, -145);

  ctx.fillStyle = addShadow ? BRAND.orange : textColor;
  ctx.font = "900 220px Arial";
  ctx.fillText("PP", 0, -10);

  ctx.fillStyle = textColor;
  ctx.font = "bold 38px Arial";
  ctx.fillText("POLYETHYLENE", 0, 105);

  ctx.restore();
}

/**
 * Builds the stingray's skin textures.
 *
 * - `diffuse` keeps the original look: base colour + orange/blue brand stripes
 *   + the printed logo on both faces.
 * - `artworkMask` is a white-on-black copy of the logo only (both halves), used
 *   by the additive glow overlay. Stripes are intentionally left out — they are
 *   cropped away by the wing UVs and never visible in-game.
 */
export function createPolimaxxTexture(color = "#ffffff"): PolimaxxTextures {
  const textColor = getBrightness(color) > 140 ? BRAND.blue : "#ffffff";

  // --- Diffuse skin ---
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to acquire 2D context for Polimaxx texture canvas");
  }

  // Base body color
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Brand stripes top & bottom
  ctx.fillStyle = BRAND.orange;
  ctx.fillRect(0, 0, 2048, 60);
  ctx.fillStyle = BRAND.blue;
  ctx.fillRect(0, 964, 2048, 60);

  drawLogoSet(ctx, 0, textColor, false, true);
  drawLogoSet(ctx, 1024, textColor, true, true);

  const diffuse = new THREE.CanvasTexture(canvas);
  diffuse.needsUpdate = true;

  // --- Artwork glow mask (logo only, white on black) ---
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = 2048;
  maskCanvas.height = 1024;
  const mctx = maskCanvas.getContext("2d");
  if (!mctx) {
    throw new Error("Unable to acquire 2D context for Polimaxx mask canvas");
  }

  mctx.fillStyle = "#000000";
  mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

  drawLogoSet(mctx, 0, "#ffffff", false, false);
  drawLogoSet(mctx, 1024, "#ffffff", true, false);

  const artworkMask = new THREE.CanvasTexture(maskCanvas);
  artworkMask.needsUpdate = true;

  return { diffuse, artworkMask };
}
