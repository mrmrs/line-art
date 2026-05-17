import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraConfig, Vec3 } from '../lib/types';
import { cartesianToSpherical, sphericalToCartesian } from '../lib/cameras';

// =============================================================================
// Orbit Camera Hook
//
// Drag to rotate, shift+drag / right-drag to pan.
// Zoom is handled separately by the Viewport (camera.zoom in store).
// Camera updates are RAF-throttled so we never fire faster than 60fps.
//
// Fixes:
//   - Full camera sync (not just eye/name) so zoom is never lost
//   - Dead zone: click without drag doesn't push camera to store
//   - Smooth rotation with lower sensitivity
// =============================================================================

const DRAG_DEAD_ZONE = 3; // pixels — must move at least this far to count as drag

export function useOrbitCamera(
  initial: CameraConfig,
  onChange: (camera: CameraConfig) => void,
) {
  const [isDragging, setIsDragging] = useState(false);
  const cameraRef = useRef<CameraConfig>({ ...initial });
  const rafRef = useRef<number | null>(null);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    startTheta: number;
    startPhi: number;
    startCenter: Vec3;
    isPan: boolean;
    didMove: boolean; // whether mouse moved beyond dead zone
  } | null>(null);

  // Sync cameraRef whenever the external camera changes and we're NOT dragging.
  // Use object reference identity — zustand creates new objects on each update.
  const prevCameraObjRef = useRef(initial);
  useEffect(() => {
    if (initial !== prevCameraObjRef.current && !dragRef.current) {
      cameraRef.current = { ...initial };
      prevCameraObjRef.current = initial;
    }
  }, [initial]);

  // Throttled camera push: at most once per animation frame
  const pushCamera = useCallback(
    (cam: CameraConfig) => {
      cameraRef.current = cam;
      if (rafRef.current !== null) return; // already scheduled
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        onChange(cameraRef.current);
      });
    },
    [onChange],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      e.preventDefault();

      const cam = cameraRef.current;
      const spherical = cartesianToSpherical(cam.eye, cam.center);
      const isPan = e.shiftKey || e.button === 2;

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTheta: spherical.theta,
        startPhi: spherical.phi,
        startCenter: [...cam.center],
        isPan,
        didMove: false,
      };
      // Don't set isDragging yet — wait until dead zone is exceeded
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      e.preventDefault();

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      // Dead zone check: must move beyond threshold to start actual drag
      if (!drag.didMove) {
        if (Math.abs(dx) < DRAG_DEAD_ZONE && Math.abs(dy) < DRAG_DEAD_ZONE) {
          return; // Still within dead zone, don't orbit yet
        }
        drag.didMove = true;
        setIsDragging(true);
      }

      const cam = cameraRef.current;

      if (drag.isPan) {
        const spherical = cartesianToSpherical(cam.eye, cam.center);
        const panSpeed = 0.004;

        const rightX = -Math.sin(drag.startTheta);
        const rightY = Math.cos(drag.startTheta);
        const upX = -Math.cos(drag.startPhi) * Math.cos(drag.startTheta);
        const upY = -Math.cos(drag.startPhi) * Math.sin(drag.startTheta);
        const upZ = Math.sin(drag.startPhi);

        const newCenter: Vec3 = [
          drag.startCenter[0] - (dx * rightX + dy * upX) * panSpeed * spherical.r,
          drag.startCenter[1] - (dx * rightY + dy * upY) * panSpeed * spherical.r,
          drag.startCenter[2] - dy * upZ * panSpeed * spherical.r,
        ];

        const newEye = sphericalToCartesian(spherical, newCenter);
        pushCamera({ ...cam, eye: newEye, center: newCenter });
      } else {
        // Rotation with smooth sensitivity
        const rotateSpeed = 0.006;
        const spherical = cartesianToSpherical(cam.eye, cam.center);
        spherical.theta = drag.startTheta - dx * rotateSpeed;
        spherical.phi = Math.max(
          0.05,
          Math.min(Math.PI - 0.05, drag.startPhi + dy * rotateSpeed),
        );

        const newEye = sphericalToCartesian(spherical, cam.center);
        pushCamera({ ...cam, eye: newEye });
      }
    },
    [pushCamera],
  );

  const handleMouseUp = useCallback(() => {
    const drag = dragRef.current;
    if (drag) {
      dragRef.current = null;

      if (drag.didMove) {
        // Was an actual drag — flush the final camera state
        setIsDragging(false);
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        onChange(cameraRef.current);
      }
      // If !didMove, it was just a click — don't push anything to the store.
      // This prevents the stale-zoom-on-click bug.
    }
  }, [onChange]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return {
    isDragging,
    cameraRef,
    handlers: {
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
      onContextMenu: handleContextMenu,
    },
  };
}
