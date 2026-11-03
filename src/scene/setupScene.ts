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
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
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
  const { camera, renderer, composer } = bundle;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}
