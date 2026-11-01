/**
 * Stingray — procedural stingray mesh with animated flapping wings,
 * eyes, and a segmented tail. Also contains simple boid-like steering.
 *
 * Fixes vs. the legacy single-file version:
 *  - Heading changes are driven by *real* elapsed time (seconds), not by the
 *    flap-animation clock. Lowering `flapSpeed` no longer freezes steering.
 *  - `direction` now actually tracks the smoothed heading each frame.
 *  - Reuses temp vectors instead of allocating every frame.
 */
import * as THREE from 'three';
import { config } from '../config';
import type { Materials } from './materials';
import type { SwarmMember } from '../types';

const WING_HALF_SPAN = 3.2;

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

    private readonly mesh: THREE.Mesh;
    private readonly eyeL: THREE.Mesh;
    private readonly eyeR: THREE.Mesh;
    private readonly tailSegments: THREE.Mesh[];

    private readonly initialPositions: Float32Array;
    private readonly eyeZPos: number;

    private direction: THREE.Vector3;
    private targetDirection: THREE.Vector3;
    private currentRoll = 0;
    private animTime: number;
    /** Seconds remaining until the next random heading change. */
    private headingTimer = 0;

    constructor(materials: Materials) {
        this.materials = materials;
        this.group = new THREE.Group();
        this.animTime = Math.random() * 100;
        this.headingTimer = Math.random() * 5;

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

        this.group.position.set(
            (Math.random() - 0.5) * 140,
            (Math.random() - 0.5) * 50,
            (Math.random() - 0.5) * 140,
        );

        const built = this.buildMesh();
        this.mesh = built.mesh;
        this.eyeL = built.eyeL;
        this.eyeR = built.eyeR;
        this.tailSegments = built.tailSegments;
        this.initialPositions = built.initialPositions;
        this.eyeZPos = built.eyeZPos;
    }

    /** Builds the extruded wing geometry + eyes + tail. */
    private buildMesh(): {
        mesh: THREE.Mesh;
        eyeL: THREE.Mesh;
        eyeR: THREE.Mesh;
        tailSegments: THREE.Mesh[];
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

        const initialPositions = new Float32Array(pos.array);
        const mesh = new THREE.Mesh(geometry, this.materials.body);
        mesh.rotation.x = -Math.PI / 2;
        this.group.add(mesh);

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

        // Tail — chain of segments
        const tailGroup = new THREE.Group();
        const tailSegments: THREE.Mesh[] = [];
        let lastSeg: THREE.Mesh | null = null;

        for (let i = 0; i < config.tailCount; i++) {
            const r = 0.06 * (1 - i / config.tailCount) + 0.005;
            const segGeo = new THREE.CylinderGeometry(r * 0.8, r, 0.22, 8);
            segGeo.translate(0, -0.11, 0);
            const seg = new THREE.Mesh(segGeo, this.materials.tail);

            if (i === 0) {
                seg.position.set(0, 1.8, config.bodyDepth / 2);
                tailGroup.add(seg);
            } else if (lastSeg) {
                seg.position.set(0, 0.22, 0);
                lastSeg.add(seg);
            }

            tailSegments.push(seg);
            lastSeg = seg;
        }
        mesh.add(tailGroup);

        return { mesh, eyeL, eyeR, tailSegments, initialPositions, eyeZPos };
    }

    update(delta: number, allRays: readonly SwarmMember[]): void {
        // Flap animation uses its own clock (visual speed only)
        this.animTime += delta * 0.003 * config.flapSpeed;
        const t = this.animTime;

        // Heading changes are driven by real elapsed time (BUG FIX)
        this.headingTimer -= delta * 0.001;
        if (this.headingTimer <= 0) {
            const angle =
                Math.atan2(this.direction.x, this.direction.z) +
                (Math.random() - 0.5) * Math.PI * 0.5;
            this.targetDirection
                .set(Math.sin(angle), (Math.random() - 0.5) * 0.2, Math.cos(angle))
                .normalize();
            this.headingTimer = 10 + Math.random() * 20;
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

        // Steer back inward when outside bounds
        if (this.group.position.length() > config.bounds) {
            _inward.copy(this.group.position).negate().normalize();
            this.targetDirection.lerp(_inward, 0.02).normalize();
        }

        // Smoothly rotate toward the target heading
        const lastY = this.group.rotation.y;
        _dummy.position.copy(this.group.position);
        _targetPos.copy(this.group.position).add(this.targetDirection);
        _dummy.lookAt(_targetPos);
        this.group.quaternion.rotateTowards(_dummy.quaternion, config.turnSpeed);

        // Banking roll proportional to recent yaw change
        let turnDiff = this.group.rotation.y - lastY;
        if (turnDiff > Math.PI) turnDiff -= Math.PI * 2;
        if (turnDiff < -Math.PI) turnDiff += Math.PI * 2;
        this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, -turnDiff * 30, 0.05);
        this.mesh.rotation.y = this.currentRoll;

        // Advance along the current forward axis
        this.direction.copy(this.targetDirection);
        this.group.translateZ(this.moveSpeed);

        // Flap wings (displace z per-vertex based on |x|)
        const posAttr = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
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
            surfaceZ + config.eyeHover + this.sampleWave(-config.eyeX, -config.eyeY, t),
        );
        this.eyeR.position.set(
            config.eyeX,
            -config.eyeY,
            surfaceZ + config.eyeHover + this.sampleWave(config.eyeX, -config.eyeY, t),
        );

        // Gentle tail sway
        this.tailSegments.forEach((seg, i) => {
            seg.rotation.z = Math.sin((t * 0.8) / config.flapSpeed - i * 0.15) * 0.18;
            seg.rotation.x = Math.cos((t * 0.8) / config.flapSpeed - i * 0.15) * 0.12;
        });
    }

    /** Wave displacement at a given (x, y) at flap time `t`. */
    private sampleWave(x: number, y: number, t: number): number {
        const d = Math.abs(x);
        const amp = d <= 0.4 ? d * 0.1 : (d - 0.4) * 1.2;
        return Math.sin(t + d * 1.8 - y * 0.5) * 0.35 * amp * config.flapStrength;
    }

    /** Frees GPU resources on despawn (geometry only; materials are shared). */
    dispose(): void {
        this.mesh.geometry.dispose();
        this.eyeL.geometry.dispose();
        this.tailSegments.forEach((seg) => seg.geometry.dispose());
    }
}
