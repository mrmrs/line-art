import { useCallback, useRef, useEffect, useState } from 'react';
import type { CameraConfig } from '../lib/types';
import { useSceneStore } from '../lib/store';
import { useOrbitCamera } from '../hooks/useOrbitCamera';
import { useWorkerRender } from '../hooks/useWorkerRender';

// =============================================================================
// Single viewport: renders the scene from one camera angle
//
// Performance strategy:
//   1. Rendering happens in a Web Worker (never blocks UI)
//   2. Scroll-to-zoom updates camera.zoom directly (persisted in store)
//      with CSS scale() for instant visual feedback until re-render
//   3. Orbit drag updates are RAF-throttled at 60fps
//   4. Worker only processes the latest request, skipping stale frames
// =============================================================================

interface ViewportProps {
  cameraIndex: number;
  showLabel?: boolean;
}

export function Viewport({ cameraIndex, showLabel = true }: ViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 400, height: 400 });

  const nodes = useSceneStore((s) => s.nodes);
  const camera = useSceneStore((s) => s.cameras[cameraIndex]);
  const renderSettings = useSceneStore((s) => s.renderSettings);
  const updateCamera = useSceneStore((s) => s.updateCamera);

  // --- Resize observer ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setSize({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // --- Camera orbit (drag) ---
  const handleCameraChange = useCallback(
    (cam: CameraConfig) => updateCamera(cameraIndex, cam),
    [cameraIndex, updateCamera],
  );

  const { isDragging, handlers: orbitHandlers } = useOrbitCamera(
    camera,
    handleCameraChange,
  );

  // --- CSS zoom state for instant feedback ---
  const [cssScale, setCssScale] = useState(1);
  const targetZoomRef = useRef(camera.zoom ?? 1);
  const renderedZoomRef = useRef(camera.zoom ?? 1);
  const zoomTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep target zoom in sync with external changes (e.g. from Properties panel)
  useEffect(() => {
    targetZoomRef.current = camera.zoom ?? 1;
    renderedZoomRef.current = camera.zoom ?? 1;
    setCssScale(1);
  }, [camera.zoom]);

  // --- Worker render ---
  const { svg, rendering, renderTimeMs, pathCount } = useWorkerRender(
    nodes,
    camera,
    size.width,
    size.height,
    renderSettings,
    isDragging,
  );

  // When new SVG arrives from worker, reset CSS zoom since render used current zoom
  const prevSvgRef = useRef('');
  useEffect(() => {
    if (svg && svg !== prevSvgRef.current) {
      prevSvgRef.current = svg;
      renderedZoomRef.current = camera.zoom ?? 1;
      setCssScale(1);
    }
  }, [svg, camera.zoom]);

  // --- Scroll-to-zoom: native listener with { passive: false } to allow preventDefault ---
  const overlayRef = useRef<HTMLDivElement>(null);
  const cameraIndexRef = useRef(cameraIndex);
  cameraIndexRef.current = cameraIndex;
  const updateCameraRef = useRef(updateCamera);
  updateCameraRef.current = updateCamera;

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Scroll up = zoom in (increase zoom), scroll down = zoom out
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      targetZoomRef.current = Math.max(0.01, Math.min(50, targetZoomRef.current * factor));

      // Instant CSS scale feedback: ratio of target to what's currently rendered
      const rendered = renderedZoomRef.current;
      setCssScale(targetZoomRef.current / rendered);

      // Debounce the actual camera update to batch rapid scrolls
      if (zoomTimer.current) clearTimeout(zoomTimer.current);
      zoomTimer.current = setTimeout(() => {
        updateCameraRef.current(cameraIndexRef.current, { zoom: targetZoomRef.current });
      }, 60);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const currentZoom = camera.zoom ?? 1;

  return (
    <div className="viewport" ref={containerRef}>
      {/* Orbit + zoom interaction overlay */}
      <div
        className="viewport-overlay"
        ref={overlayRef}
        {...orbitHandlers}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      />

      {/* SVG output with CSS zoom transform */}
      <div
        className="viewport-svg"
        style={{
          transform: cssScale !== 1 ? `scale(${cssScale})` : undefined,
          transformOrigin: 'center center',
          transition: cssScale === 1 ? 'transform 0.08s ease-out' : undefined,
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      {/* Camera label */}
      {showLabel && (
        <div className="viewport-label">
          <span className="viewport-camera-name">{camera.name}</span>
          {camera.ortho && <span className="viewport-badge">Ortho</span>}
          {currentZoom !== 1 && (
            <span className="viewport-badge">{currentZoom.toFixed(1)}x</span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="viewport-stats">
        {rendering && <span className="viewport-rendering">rendering</span>}
        {!rendering && (
          <span>
            {pathCount} paths &middot; {renderTimeMs.toFixed(0)}ms
          </span>
        )}
      </div>
    </div>
  );
}
