import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { CameraConfig, Vec3 } from '../lib/types';

const DRAG_DEAD_ZONE = 3;
const WHEEL_IDLE_MS = 140;
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, n, j) => sum + n * b[j], 0);
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3) => Math.hypot(...a);
const normalize = (a: Vec3): Vec3 => { const n = length(a) || 1; return a.map(v => v / n) as Vec3; };
const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, j) => v + b[j]) as Vec3;
const subtract = (a: Vec3, b: Vec3): Vec3 => a.map((v, j) => v - b[j]) as Vec3;
const rotate = (v: Vec3, axis: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle), s = Math.sin(angle), crossed = cross(axis, v), projected = dot(axis, v);
  return v.map((n, j) => n * c + crossed[j] * s + axis[j] * projected * (1 - c)) as Vec3;
};

export function cameraBasis(camera: CameraConfig) {
  const forward = normalize(subtract(camera.center, camera.eye));
  let right = cross(forward, normalize(camera.up));
  if (length(right) < 1e-8) right = cross(forward, Math.abs(forward[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]);
  right = normalize(right);
  return { right, up: normalize(cross(right, forward)) };
}

/** Pixel displacement is measured at the camera's target plane. */
export function panCamera(camera: CameraConfig, dx: number, dy: number, viewportHeight: number): CameraConfig {
  const basis = cameraBasis(camera), zoom = camera.zoom ?? 1;
  const halfHeight = camera.ortho ? (camera.orthoSize ?? 3) / zoom
    : length(subtract(camera.eye, camera.center)) / zoom * Math.tan(camera.fovy * Math.PI / 360);
  const units = 2 * halfHeight / Math.max(1, viewportHeight);
  const shift = basis.right.map((n, j) => (-dx * n + dy * basis.up[j]) * units) as Vec3;
  return { ...camera, eye: add(camera.eye, shift), center: add(camera.center, shift) };
}

/** Orbit relative to each preset's up axis, without snapping Top into a Z-up sphere. */
export function orbitCamera(camera: CameraConfig, dx: number, dy: number): CameraConfig {
  const up = normalize(camera.up), offset = subtract(camera.eye, camera.center);
  const yawed = rotate(offset, up, -dx * 0.006);
  const radius = length(offset);
  if (radius < 1e-8) return camera;
  const phi = Math.acos(Math.max(-1, Math.min(1, dot(normalize(yawed), up))));
  const right = cameraBasis({ ...camera, eye: add(camera.center, yawed) }).right;
  const pitch = Math.max(0.025, Math.min(Math.PI - 0.025, phi + dy * 0.006)) - phi;
  return { ...camera, eye: add(camera.center, rotate(yawed, right, pitch)) };
}

export function wheelZoom(zoom: number, deltaY: number, deltaMode: number, viewportHeight: number): number {
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? viewportHeight : 1);
  const delta = Math.max(-600, Math.min(600, pixels));
  return Math.max(0.01, Math.min(50, zoom * Math.exp(-delta * 0.0015)));
}

interface Drag {
  pointerId: number;
  element: HTMLElement;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  camera: CameraConfig;
  isPan: boolean;
  didMove: boolean;
}

/** Live input stays local; one completed gesture creates one document transaction. */
export function useOrbitCamera(initial: CameraConfig, onCommit: (camera: CameraConfig) => void,
  viewport: { width: number; height: number }) {
  const [state, setState] = useState({ base: initial, camera: initial, isDragging: false, isInteracting: false });
  const initialRef = useRef(initial), cameraRef = useRef(initial), onCommitRef = useRef(onCommit), sizeRef = useRef(viewport);
  const dragRef = useRef<Drag | null>(null), dirtyRef = useRef(false);
  const rafRef = useRef<number | null>(null), wheelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const publish = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setState({ base: initialRef.current, camera: cameraRef.current,
        isDragging: !!dragRef.current?.didMove,
        isInteracting: !!dragRef.current?.didMove || wheelTimer.current !== undefined });
    });
  }, []);

  const releasePointer = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId);
  }, []);

  const finish = useCallback(() => {
    releasePointer();
    clearTimeout(wheelTimer.current); wheelTimer.current = undefined;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setState({ base: initialRef.current, camera: cameraRef.current, isDragging: false, isInteracting: false });
    if (dirtyRef.current) { dirtyRef.current = false; onCommitRef.current(cameraRef.current); }
  }, [releasePointer]);

  useEffect(() => { onCommitRef.current = onCommit; sizeRef.current = viewport; }, [onCommit, viewport]);
  useEffect(() => {
    if (initial === initialRef.current) return;
    // Undo, presets and outside edits supersede an unfinished local gesture.
    releasePointer(); clearTimeout(wheelTimer.current); wheelTimer.current = undefined;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null; dirtyRef.current = false;
    initialRef.current = initial; cameraRef.current = initial;
  }, [initial, releasePointer]);
  useEffect(() => {
    window.addEventListener('blur', finish);
    return () => {
      window.removeEventListener('blur', finish);
      releasePointer(); clearTimeout(wheelTimer.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [finish, releasePointer]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current || !event.isPrimary || ![0, 1, 2].includes(event.button)) return;
    event.preventDefault();
    clearTimeout(wheelTimer.current); wheelTimer.current = undefined;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, element: event.currentTarget,
      startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY,
      camera: cameraRef.current, isPan: event.shiftKey || event.button !== 0, didMove: false };
  }, []);
  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault(); drag.lastX = event.clientX; drag.lastY = event.clientY;
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    if (!drag.didMove && Math.hypot(dx, dy) < DRAG_DEAD_ZONE) return;
    drag.didMove = true; dirtyRef.current = true;
    cameraRef.current = drag.isPan ? panCamera(drag.camera, dx, dy, sizeRef.current.height) : orbitCamera(drag.camera, dx, dy);
    publish();
  }, [publish]);
  const onPointerEnd = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) finish();
  }, [finish]);
  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault(); event.stopPropagation();
    if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return;
    const camera = cameraRef.current;
    const zoom = wheelZoom(camera.zoom ?? 1, event.deltaY, event.deltaMode, sizeRef.current.height);
    if (zoom === camera.zoom) return;
    cameraRef.current = { ...camera, zoom }; dirtyRef.current = true;
    const drag = dragRef.current;
    if (drag) { drag.camera = cameraRef.current; drag.startX = drag.lastX; drag.startY = drag.lastY; }
    clearTimeout(wheelTimer.current);
    wheelTimer.current = setTimeout(() => {
      wheelTimer.current = undefined;
      if (!dragRef.current) finish(); else publish();
    }, WHEEL_IDLE_MS);
    publish();
  }, [finish, publish]);
  const onContextMenu = useCallback((event: ReactMouseEvent) => event.preventDefault(), []);

  // External document changes display immediately, before the synchronization effect.
  const live = state.base === initial ? state : { camera: initial, isDragging: false, isInteracting: false };
  return { ...live, handleWheel, handlers: { onPointerDown, onPointerMove,
    onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onLostPointerCapture: onPointerEnd, onContextMenu } };
}
