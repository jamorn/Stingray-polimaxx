/**
 * Stingray — procedural stingray mesh with animated flapping wings,
 * eyes, and a smooth (non-segmented) tail.
 *
 * Tail approach (replaces the old chain of cylinders):
 *  - A single high-resolution `ConeGeometry` (20 radial × 48 height segments).
 *  - Vertices are displaced with a smoothstep-weighted sine wave so the root
 *    stays rigid and only the tip whips — no visible joints, no "sausage" look.
 *  - Normals are recomputed on a staggered 3-frame cadence to keep the
 *    lighting following the twist without paying that cost every frame.
 *
 * Other behaviour carried over / fixed:
 *  - Heading changes are driven by real elapsed time (seconds).
 *  - `direction` tracks the smoothed heading each frame.
 *  - No per-frame allocations (shared temp vectors).
 */
import * as THREE from "three";
import { config } from "../config";
import type { Materials } from "./materials";
import type { SwarmMember } from "../types";

const WING_HALF_SPAN = 3.2;

/**
 * Upper bound on a single frame's delta (ms). Prevents a huge jump after the
 * tab was hidden or the page was just loaded and is still compiling shaders.
 * 50 ms ≈ 20fps — anything longer is treated as a hiccup, not real time.
 */
const MAX_DELTA_MS = 50;

/** Spawn tuning: rays appear far out and swim inward, never spawning on top of others. */
const SPAWN = {
  /** Horizontal radius range (world units) where new rays appear. */
  minRadius: 90,
  maxRadius: 150,
  /** Vertical half-extent while spawning. */
  halfHeight: 25,
  /** How much extra clearance to demand beyond each neighbour's radius. */
  clearance: 12,
  /** Attempts to find a clear spot before falling back to "best effort". */
  attempts: 30,
} as const;

/** Tail animation tuning. */
const TAIL = {
  /** Radial segments of the cone (smooth silhouette). */
  radialSegments: 20,
  /** Height segments — must be high so the wave bends smoothly. */
  heightSegments: 48,
  /** Root radius of the cone. */
  rootRadius: 0.06,
  /** Peak sideways displacement at the tip. */
  waveAmplitude: 0.45,
  /** Wave frequency along the tail (0 = none, higher = more kinks). */
  waveFrequency: 3.0,
  /** Recompute vertex normals every N frames (staggered per instance). */
  normalUpdateEvery: 3,
} as const;

/** Reusable temp objects (module-scoped) to avoid per-frame allocations. */
const _dummy = new THREE.Object3D();
const _targetPos = new THREE.Vector3();
const _diff = new THREE.Vector3();
const _inward = new THREE.Vector3();
const _sepVec = new THREE.Vector3();

export class Stingray implements SwarmMember {
  readonly group: THREE.Group;
  readonly radius: number;

  private readonly moveSpeed: number;
  private readonly materials: Materials;
  /** Staggers normal recomputation across instances (0..2). */
  private readonly frameOffset: number;

  private readonly mesh: THREE.Mesh;
  private readonly eyeL: THREE.Mesh;
  private readonly eyeR: THREE.Mesh;

  private readonly tailMesh: THREE.Mesh;
  private readonly tailInitPos: Float32Array;
  private readonly tailLen: number;

  private readonly initialPositions: Float32Array;
  private readonly eyeZPos: number;

  private direction: THREE.Vector3;
  private targetDirection: THREE.Vector3;
  private currentRoll = 0;
  private animTime: number;
  /** Seconds remaining until the next random heading change. */
  private headingTimer = 0;
  /** Seconds before this ray appears and starts moving (0 = spawn now). */
  private spawnDelay = 0;

  constructor(
    materials: Materials,
    existing: readonly SwarmMember[] = [],
    index = 0,
  ) {
    this.materials = materials;
    this.frameOffset = index % TAIL.normalUpdateEvery;
    this.group = new THREE.Group();
    this.animTime = Math.random() * 100;
    // Spread the first heading change across a wide window so the whole fleet
    // doesn't re-aim on the same beat (which reads as a synchronized school).
    this.headingTimer = Math.random() * 30;

    // Size distribution: mostly small, some medium, rare giants
    const rand = Math.random();
    let scale: number;
    if (rand > 0.92) {
      scale = 4.5 + Math.random() * 2.0;
    } else if (rand > 0.75) {
      scale = 2.5 + Math.random() * 1.5;
    } else {
      scale = 0.8 + Math.random() * 0.8;
    }

    this.group.scale.set(scale, scale, scale);
    this.radius = scale * 2.5;

    const baseSpeed =
      config.minSpeed + Math.random() * (config.maxSpeed - config.minSpeed);
    this.moveSpeed = scale > 3 ? baseSpeed * 0.5 : baseSpeed;

    const angle = Math.random() * Math.PI * 2;
    this.direction = new THREE.Vector3(
      Math.cos(angle),
      (Math.random() - 0.5) * 0.1,
      Math.sin(angle),
    ).normalize();
    this.targetDirection = this.direction.clone();

    // Spawn far outside the action, clear of any existing ray.
    const spawn = Stingray.findSpawnPosition(this.radius, existing);
    this.group.position.copy(spawn);

    // Spawn heading: a wide random spread, gently biased toward the centre.
    // A hard "always aim at the centre" makes the whole swarm converge on
    // one point at once and look jittery; a mild bias lets them drift in.
    this.targetDirection.copy(
      Stingray.findSpawnHeading(spawn, config.spawnHeadingBias),
    );
    this.direction.copy(this.targetDirection);

    const built = this.buildMesh();
    this.mesh = built.mesh;
    this.eyeL = built.eyeL;
    this.eyeR = built.eyeR;
    this.tailMesh = built.tailMesh;
    this.tailInitPos = built.tailInitPos;
    this.tailLen = built.tailLen;
    this.initialPositions = built.initialPositions;
    this.eyeZPos = built.eyeZPos;
  }

  /**
   * Defers this ray's appearance and motion by `seconds`. While waiting the
   * ray is hidden and its `update()` is a no-op, so no physics accumulates.
   * Used to stagger the initial spawn across a few seconds, which spreads the
   * GPU/shader cost over multiple frames and avoids a framerate dip on load.
   */
  setSpawnDelay(seconds: number): void {
    this.spawnDelay = Math.max(0, seconds);
    if (this.spawnDelay > 0) {
      this.group.visible = false;
    }
  }

  /**
   * Picks a spawn point on the outer shell of the scene that is clear of
   * every existing ray. Falls back to the most isolated candidate if no
   * fully-clear spot is found within {@link SPAWN.attempts}.
   */
  static findSpawnPosition(
    selfRadius: number,
    occupied: readonly SwarmMember[],
  ): THREE.Vector3 {
    let best = new THREE.Vector3();
    let bestClearance = -Infinity;

    for (let attempt = 0; attempt < SPAWN.attempts; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius =
        SPAWN.minRadius + Math.random() * (SPAWN.maxRadius - SPAWN.minRadius);

      const candidate = new THREE.Vector3(
        Math.cos(angle) * radius,
        (Math.random() - 0.5) * 2 * SPAWN.halfHeight,
        Math.sin(angle) * radius,
      );

      let nearestClearance = Infinity;
      for (const other of occupied) {
        const required = other.radius + selfRadius + SPAWN.clearance;
        const clearance = candidate.distanceTo(other.group.position) - required;
        if (clearance < nearestClearance) nearestClearance = clearance;
      }

      if (nearestClearance >= 0) return candidate;

      if (nearestClearance > bestClearance) {
        bestClearance = nearestClearance;
        best.copy(candidate);
      }
    }

    // Nothing fully clear — take the most isolated option we sampled.
    return best;
  }

  /**
   * Builds a spawn heading at `position`.
   *
   * `bias` = 0   → pure random heading (no inward pull at all)
   * `bias` = 1   → aims exactly at the origin
   *
   * In between, the heading is the inward direction rotated by a random
   * angle up to ±(1 - bias)·180°. This spreads rays across many headings
   * so they don't all charge the centre on the same frame.
   */
  static findSpawnHeading(
    position: THREE.Vector3,
    bias: number,
  ): THREE.Vector3 {
    const clamped = Math.min(1, Math.max(0, bias));

    // Inward direction on the horizontal plane (falls back to -X at origin).
    _inward.copy(position).negate();
    _inward.y = 0;
    if (_inward.lengthSq() < 1e-6) _inward.set(-1, 0, 0);
    _inward.normalize();

    // Max angular deviation from the inward heading.
    const maxDeviation = (1 - clamped) * Math.PI;

    const baseAngle =
      Math.atan2(_inward.x, _inward.z) + (Math.random() * 2 - 1) * maxDeviation;

    return _targetPos
      .set(
        Math.sin(baseAngle),
        (Math.random() - 0.5) * 0.2,
        Math.cos(baseAngle),
      )
      .normalize()
      .clone();
  }

  /** Builds the extruded wing geometry + eyes + smooth tail. */
  private buildMesh(): {
    mesh: THREE.Mesh;
    eyeL: THREE.Mesh;
    eyeR: THREE.Mesh;
    tailMesh: THREE.Mesh;
    tailInitPos: Float32Array;
    tailLen: number;
    initialPositions: Float32Array;
    eyeZPos: number;
  } {
    // Rounded diamond / flying-saucer shape
    const shape = new THREE.Shape();
    shape.moveTo(0, -1.8);
    shape.bezierCurveTo(1.7, -1.6, 3.2, -0.8, 3.2, 0);
    shape.bezierCurveTo(3.2, 0.8, 1.4, 1.6, 0, 1.8);
    shape.bezierCurveTo(-1.4, 1.6, -3.2, 0.8, -3.2, 0);
    shape.bezierCurveTo(-3.2, -0.8, -1.7, -1.6, 0, -1.8);

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: config.bodyDepth,
      bevelEnabled: true,
      bevelThickness: 0.15,
      bevelSize: 0.3,
      bevelSegments: 15,
    });

    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const uvs = geometry.attributes.uv as THREE.BufferAttribute;

    // Taper wings thin toward their tips + assign side UVs for the logo
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      const distFromCenter = Math.abs(x) / WING_HALF_SPAN;
      const taperFactor = THREE.MathUtils.lerp(
        1.0,
        config.wingTaper,
        distFromCenter,
      );

      const centeredZ = z - config.bodyDepth / 2;
      pos.setZ(i, centeredZ * taperFactor + config.bodyDepth / 2);

      if (z >= config.bodyDepth - 0.05) {
        // Top face → left half of texture
        uvs.setXY(i, (-x / 6.4) * 0.45 + 0.25, (-y / 3.6) * 0.45 + 0.5);
      } else if (z <= 0.05) {
        // Bottom face → right half of texture (mirrored logo)
        uvs.setXY(i, (-x / 6.4) * 0.45 + 0.75, (-y / 3.6) * 0.45 + 0.5);
      } else {
        // Rim
        uvs.setXY(i, 0.5, z > config.bodyDepth / 2 ? 0.03 : 0.97);
      }
    }

    // Ripples running front-to-back along the body — a smooth organic
    // bulge instead of the old segmented look.
    this.applyBodyBulge(pos);

    const initialPositions = new Float32Array(pos.array);
    const mesh = new THREE.Mesh(geometry, this.materials.body);
    mesh.rotation.x = -Math.PI / 2;
    this.group.add(mesh);

    // Logo glow overlay — same geometry (so it deforms with the flap) and
    // drawn additively on top of the body. `depthWrite: false` + polygon
    // offset keep it a pure additive layer with no z-fighting.
    // NOTE: it is parented to `mesh`, so it inherits `mesh.rotation` — do NOT
    // copy the rotation here or it gets rotated twice (and sticks up out of
    // the body instead of lying flat on the wings).
    const artworkMesh = new THREE.Mesh(geometry, this.materials.artwork);
    artworkMesh.renderOrder = 1;
    mesh.add(artworkMesh);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const eyeL = new THREE.Mesh(eyeGeo, this.materials.eye);
    const eyeR = new THREE.Mesh(eyeGeo, this.materials.eye);
    mesh.add(eyeL, eyeR);

    const eyeTaperFactor = THREE.MathUtils.lerp(
      1.0,
      config.wingTaper,
      config.eyeX / WING_HALF_SPAN,
    );
    const eyeZPos = (config.bodyDepth / 2) * eyeTaperFactor;

    // --- Tail: one smooth cone instead of a chain of segments ---
    // The body is a diamond spanning y ∈ [-1.8, +1.8] with the *tail tip* at
    // y = +1.8 (before the mesh is rotated). The tail must therefore attach
    // at that tip, and be centred in the body's depth (z) so it emerges from
    // the middle of the back edge rather than one of the faces.
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    const bodyCenterZ = (bb.min.z + bb.max.z) * 0.5;

    const tailLen = config.tailLength;
    const tailRootY = 1.8;
    const tailGeo = new THREE.ConeGeometry(
      TAIL.rootRadius,
      tailLen,
      TAIL.radialSegments,
      TAIL.heightSegments,
    );
    // Shift the cone so its base sits at y = tailRootY and the apex extends
    // further out along +y. This matches the diamond's tail tip exactly.
    tailGeo.translate(0, tailLen / 2 + tailRootY, 0);

    const tailInitPos = new Float32Array(
      (tailGeo.attributes.position as THREE.BufferAttribute).array,
    );
    const tailMesh = new THREE.Mesh(tailGeo, this.materials.tail);
    // No Y offset needed: the translate above already puts the root at the
    // tip. Z is the body's depth centre so the tail comes out of the middle.
    tailMesh.position.set(0, 0, bodyCenterZ + config.tailOffsetZ);
    mesh.add(tailMesh);

    return {
      mesh,
      eyeL,
      eyeR,
      tailMesh,
      tailInitPos,
      tailLen,
      initialPositions,
      eyeZPos,
    };
  }

  /**
   * Pushes vertices outward along their radial direction using a sine
   * ripple along the body's depth axis. Amplitude fades toward the centre
   * line so the leading edge stays crisp.
   */
  private applyBodyBulge(pos: THREE.BufferAttribute): void {
    const segs = Math.max(0, Math.round(config.segmentCount));
    if (segs <= 0 || config.segmentBulge === 0) return;

    let maxAbsX = 0;
    let zMin = Infinity;
    let zMax = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const pz = pos.getZ(i);
      if (Math.abs(px) > maxAbsX) maxAbsX = Math.abs(px);
      if (pz < zMin) zMin = pz;
      if (pz > zMax) zMax = pz;
    }

    const depthRange = Math.max(1e-6, zMax - zMin);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      const vz = (z - zMin) / depthRange;
      const ring = Math.sin(vz * Math.PI * segs);
      const sideFactor = maxAbsX > 0 ? Math.pow(Math.abs(x) / maxAbsX, 1.2) : 0;
      const bulge = ring * config.segmentBulge * sideFactor;

      const r = Math.hypot(x, y) || 1;
      pos.setX(i, x + (x / r) * bulge);
      pos.setY(i, y + (y / r) * bulge);
    }
  }

  update(delta: number, allRays: readonly SwarmMember[], frame = 0): void {
    // Staggered spawn: stay hidden and do nothing until our turn comes.
    // Returning early means no delta accumulates while waiting.
    if (this.spawnDelay > 0) {
      this.spawnDelay -= delta * 0.001;
      if (this.spawnDelay > 0) return;
      // Time's up — reveal and continue this frame normally.
      this.spawnDelay = 0;
      this.group.visible = true;
    }

    // Normalised frame time: 1.0 at 60fps, 2.0 at 30fps, 0 at the first frame.
    // Multiplying motion and rotation by this keeps speed constant in real
    // time, so a framerate dip (e.g. the first frames after a refresh) no
    // longer makes rays appear to snap or warp.
    const dtf = Math.min(delta, MAX_DELTA_MS) / (1000 / 60);

    // Flap animation uses its own clock (visual speed only)
    this.animTime += delta * 0.003 * config.flapSpeed * config.timeScale;
    const t = this.animTime;

    // Heading changes are driven by real elapsed time. Each ray keeps its own
    // schedule so the fleet never re-aims in unison.
    this.headingTimer -= delta * 0.001;
    if (this.headingTimer <= 0) {
      const angle =
        Math.atan2(this.direction.x, this.direction.z) +
        (Math.random() - 0.5) * Math.PI * 0.5;
      this.targetDirection
        .set(Math.sin(angle), (Math.random() - 0.5) * 0.2, Math.cos(angle))
        .normalize();
      // Wide, randomized interval so re-aims stay out of phase with each other.
      this.headingTimer = 8 + Math.random() * 22;
    }

    // Boid separation
    _sepVec.set(0, 0, 0);
    let neighbors = 0;
    for (const other of allRays) {
      if (other === this) continue;
      const dist = this.group.position.distanceTo(other.group.position);
      const minDist = this.radius + other.radius + config.separationDist;
      if (dist < minDist) {
        _diff.subVectors(this.group.position, other.group.position);
        _diff.normalize().divideScalar(Math.max(0.1, dist));
        _sepVec.add(_diff);
        neighbors++;
      }
    }
    if (neighbors > 0) {
      _sepVec.divideScalar(neighbors);
      this.targetDirection
        .add(_sepVec.multiplyScalar(config.separationForce))
        .normalize();
    }

    // Soft cohesion so the swarm doesn't bunch up at the boundary
    const distFromCenter = this.group.position.length();
    const soft = config.bounds * 0.55;
    if (distFromCenter > soft) {
      const pull = (distFromCenter - soft) / (config.bounds - soft);
      _inward.copy(this.group.position).negate().normalize();
      this.targetDirection
        .add(_inward.multiplyScalar(Math.min(1, pull) * 0.08))
        .normalize();
    }

    // Hard boundary: steer inward and hard-clamp just outside the shell
    const len = this.group.position.length();
    if (len > config.bounds * 0.9) {
      _inward.copy(this.group.position).negate().normalize();
      this.targetDirection.lerp(_inward, 0.08).normalize();
    }
    if (len > config.bounds) {
      this.group.position.multiplyScalar((config.bounds * 0.98) / len);
    }

    // Smoothly rotate toward the target heading (scaled by real frame time).
    const lastY = this.group.rotation.y;
    _dummy.position.copy(this.group.position);
    _targetPos.copy(this.group.position).add(this.targetDirection);
    _dummy.lookAt(_targetPos);
    this.group.quaternion.rotateTowards(
      _dummy.quaternion,
      config.turnSpeed * dtf,
    );

    // Banking roll proportional to recent yaw change
    let turnDiff = this.group.rotation.y - lastY;
    if (turnDiff > Math.PI) turnDiff -= Math.PI * 2;
    if (turnDiff < -Math.PI) turnDiff += Math.PI * 2;
    this.currentRoll = THREE.MathUtils.lerp(
      this.currentRoll,
      -turnDiff * 30,
      0.05,
    );
    this.mesh.rotation.y = this.currentRoll;

    // Advance along the current forward axis (scaled by real frame time).
    this.direction.copy(this.targetDirection);
    this.group.translateZ(this.moveSpeed * dtf);

    // Flap wings (displace z per-vertex based on |x|)
    const posAttr = this.mesh.geometry.attributes
      .position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const x = this.initialPositions[i * 3]!;
      const y = this.initialPositions[i * 3 + 1]!;
      const pz = this.initialPositions[i * 3 + 2]!;
      const d = Math.abs(x);
      const flapAmp = d <= 0.4 ? d * 0.1 : (d - 0.4) * 1.2;
      const wave =
        Math.sin(t + d * 1.8 - y * 0.5) * 0.35 * flapAmp * config.flapStrength;
      posAttr.setZ(i, pz + wave);
    }
    posAttr.needsUpdate = true;

    // Eyes follow the wing-surface displacement at their positions
    const surfaceZ = config.bodyDepth / 2 + this.eyeZPos;
    this.eyeL.position.set(
      -config.eyeX,
      -config.eyeY,
      surfaceZ +
        config.eyeHover +
        this.sampleWave(-config.eyeX, -config.eyeY, t),
    );
    this.eyeR.position.set(
      config.eyeX,
      -config.eyeY,
      surfaceZ +
        config.eyeHover +
        this.sampleWave(config.eyeX, -config.eyeY, t),
    );

    // Smooth tail wave — smoothstep-weighted so the root stays anchored
    this.updateTail(t, frame);
  }

  /** Wave displacement at a given (x, y) at flap time `t`. */
  private sampleWave(x: number, y: number, t: number): number {
    const d = Math.abs(x);
    const amp = d <= 0.4 ? d * 0.1 : (d - 0.4) * 1.2;
    return Math.sin(t + d * 1.8 - y * 0.5) * 0.35 * amp * config.flapStrength;
  }

  /**
   * Bends the cone sideways with a smoothstep envelope, so the base is
   * rigid and the tip whips. Normals are refreshed on a staggered cadence.
   */
  private updateTail(t: number, frame: number): void {
    const attr = this.tailMesh.geometry.attributes
      .position as THREE.BufferAttribute;
    const init = this.tailInitPos;
    const len = this.tailLen;

    for (let vi = 0; vi < attr.count; vi++) {
      const bx = init[vi * 3]!;
      const by = init[vi * 3 + 1]!;

      // 0 at the root (by = tailRootY) … 1 at the tip.
      // Tail root sits at y = 1.8 because of the geometry translate.
      const vt = Math.min(1, Math.max(0, (by - 1.8) / len));
      // smoothstep — soft start, full swing at the tip
      const amp = vt * vt * (3 - 2 * vt);

      const wave =
        Math.sin(t * (1 + config.flapSpeed * 2.2) - vt * TAIL.waveFrequency) *
        TAIL.waveAmplitude *
        amp *
        config.flapStrength *
        config.timeScale;

      attr.setX(vi, bx + wave);
    }
    attr.needsUpdate = true;

    // Staggered normal recompute — smooth lighting without the full cost.
    if ((frame + this.frameOffset) % TAIL.normalUpdateEvery === 0) {
      this.tailMesh.geometry.computeVertexNormals();
    }
  }

  /** Frees GPU resources on despawn (geometry only; materials are shared). */
  dispose(): void {
    this.mesh.geometry.dispose();
    this.eyeL.geometry.dispose();
    this.tailMesh.geometry.dispose();
  }
}
