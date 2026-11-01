/**
 * OrbitInput — 1-finger orbit, 2-finger pinch zoom (mobile),
 * drag-to-orbit + wheel zoom (desktop). Tracks one or many pointers.
 */
import * as THREE from 'three';

const MIN_ZOOM = 30;
const MAX_ZOOM = 600;
const ORBIT_SENSITIVITY = 0.005;
const PINCH_SENSITIVITY = 0.5;
const WHEEL_SENSITIVITY = 0.1;
const PITCH_LIMIT = Math.PI / 2 - 0.1;

export class OrbitInput {
    orbitRotation = { x: 0.2, y: 0 };
    zoom = 110;

    private readonly pointers = new Map<number, { x: number; y: number }>();
    private lastPos = { x: 0, y: 0 };
    private initialPinchDist = 0;
    private initialZoom = 0;

    constructor(
        private readonly element: HTMLElement,
        private readonly camera: THREE.PerspectiveCamera,
    ) {
        this.attach();
        this.updateCamera();
    }

    private attach(): void {
        const el = this.element;

        el.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('pointercancel', this.onPointerUp);
        el.addEventListener('wheel', this.onWheel, { passive: true });
    }

    private readonly onPointerDown = (e: PointerEvent): void => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('.lil-gui') || target?.closest('#mode-toggle')) return;

        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.lastPos = { x: e.clientX, y: e.clientY };

        if (this.pointers.size === 2) {
            const [a, b] = Array.from(this.pointers.values()) as [
                { x: number; y: number },
                { x: number; y: number },
            ];
            this.initialPinchDist = Math.hypot(a.x - b.x, a.y - b.y);
            this.initialZoom = this.zoom;
        }

        this.element.setPointerCapture?.(e.pointerId);
    };

    private readonly onPointerMove = (e: PointerEvent): void => {
        if (!this.pointers.has(e.pointerId)) return;
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (this.pointers.size === 1) {
            // 1-finger / drag orbit
            this.orbitRotation.y -= (e.clientX - this.lastPos.x) * ORBIT_SENSITIVITY;
            this.orbitRotation.x -= (e.clientY - this.lastPos.y) * ORBIT_SENSITIVITY;
            this.orbitRotation.x = THREE.MathUtils.clamp(
                this.orbitRotation.x,
                -PITCH_LIMIT,
                PITCH_LIMIT,
            );
            this.lastPos = { x: e.clientX, y: e.clientY };
        } else if (this.pointers.size === 2) {
            // 2-finger pinch zoom
            const [a, b] = Array.from(this.pointers.values()) as [
                { x: number; y: number },
                { x: number; y: number },
            ];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            const diff = this.initialPinchDist - dist;
            this.zoom = THREE.MathUtils.clamp(
                this.initialZoom + diff * PINCH_SENSITIVITY,
                MIN_ZOOM,
                MAX_ZOOM,
            );
        }

        this.updateCamera();
    };

    private readonly onPointerUp = (e: PointerEvent): void => {
        this.pointers.delete(e.pointerId);
        if (this.pointers.size < 2) this.initialPinchDist = 0;
    };

    private readonly onWheel = (e: WheelEvent): void => {
        this.zoom = THREE.MathUtils.clamp(
            this.zoom + e.deltaY * WHEEL_SENSITIVITY,
            MIN_ZOOM,
            MAX_ZOOM,
        );
        this.updateCamera();
    };

    updateCamera(): void {
        const { x, y } = this.orbitRotation;
        this.camera.position.set(
            this.zoom * Math.sin(y) * Math.cos(x),
            this.zoom * Math.sin(x),
            this.zoom * Math.cos(y) * Math.cos(x),
        );
        this.camera.lookAt(0, 0, 0);
    }

    dispose(): void {
        const el = this.element;
        el.removeEventListener('pointerdown', this.onPointerDown);
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('pointercancel', this.onPointerUp);
        el.removeEventListener('wheel', this.onWheel);
    }
}
