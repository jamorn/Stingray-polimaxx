/**
 * Scene / camera / renderer / lights / post-processing setup.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { config, envSettings } from "../config";

export interface SceneBundle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
  ambientLight: THREE.AmbientLight;
  sunLight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;
}

/** Keep device pixel ratio capped so high-DPI phones don't melt. */
const MAX_PIXEL_RATIO = 1.5;

/**
 * Bloom render-target bounds. The bloom pass allocates several full-screen
 * render targets at its own resolution; on a 4K full-screen kiosk that is
 * enough VRAM to make the browser drop the WebGL context. Bloom is a soft
 * glow, so rendering it below native resolution is visually indistinguishable
 * while cutting its memory cost dramatically.
 */
const MAX_BLOOM_WIDTH = 1920;
const MAX_BLOOM_HEIGHT = 1080;

/**
 * Bloom resolution: the viewport scaled down so it never exceeds the max
 * bounds on either axis while preserving the aspect ratio.
 */
function getBloomSize(): THREE.Vector2 {
  const scale = Math.min(
    MAX_BLOOM_WIDTH / window.innerWidth,
    MAX_BLOOM_HEIGHT / window.innerHeight,
    1, // never upscale — small windows keep native resolution
  );
  return new THREE.Vector2(
    Math.max(1, Math.floor(window.innerWidth * scale)),
    Math.max(1, Math.floor(window.innerHeight * scale)),
  );
}

export function setupScene(): SceneBundle {
  // --- Scene + fog ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(envSettings.background);
  scene.fog = new THREE.Fog(
    envSettings.background,
    envSettings.fogNear,
    envSettings.fogFar,
  );

  // --- Camera ---
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    1,
    2000,
  );

  // --- Renderer ---
  // `powerPreference` nudges the browser toward the discrete GPU when one
  // exists; `preserveDrawingBuffer` is left off (default) for lower VRAM use.
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  document.body.appendChild(renderer.domElement);

  // --- Post-processing (UnrealBloom) ---
  // Bloom renders at a capped resolution (see getBloomSize) so a large
  // full-screen kiosk display cannot exhaust VRAM.
  const bloomPass = new UnrealBloomPass(
    getBloomSize(),
    config.bloomStrength,
    config.bloomRadius,
    config.bloomThreshold,
  );
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloomPass);

  // --- Lights ---
  const ambientLight = new THREE.AmbientLight(
    0x4488ff,
    envSettings.ambientIntensity,
  );
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(
    0xffffff,
    envSettings.sunIntensity,
  );
  sunLight.position.set(50, 100, 50);
  scene.add(sunLight);

  const rimLight = new THREE.DirectionalLight(
    0xffffff,
    envSettings.rimIntensity,
  );
  rimLight.position.set(-50, -50, -50);
  scene.add(rimLight);

  return {
    scene,
    camera,
    renderer,
    composer,
    bloomPass,
    ambientLight,
    sunLight,
    rimLight,
  };
}

/** Resize handler for renderer + camera + composer. */
export function handleResize(bundle: SceneBundle): void {
  const { camera, renderer, composer, bloomPass } = bundle;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  // Keep bloom at its capped resolution — after entering full screen the
  // composer would otherwise reallocate large render targets.
  bloomPass.setSize(getBloomSize().x, getBloomSize().y);
}
