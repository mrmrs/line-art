import type { CameraConfig } from '../lib/types';
import { useCallback, useRef, useEffect, useState } from 'react';
import { GridOverlay } from './GridOverlay';
import { resolvePaper, useViewSettings } from '../lib/view-settings';
import './Viewport.css';
import { useSceneStore } from '../lib/store';
import { useOrbitCamera } from '../hooks/useOrbitCamera';
import { useWorkerRender, sameCameraView } from '../hooks/useWorkerRender';

interface ViewportProps {
  cameraIndex: number;
  showLabel?: boolean;
}

export function Viewport({ cameraIndex, showLabel = true }: ViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 400, height: 400 });
  const viewSettings = useViewSettings();
  const paperSize = viewSettings.paperSize;
  const paper = resolvePaper(viewSettings);
  const dimensions = { widthMm: paper.widthMm, heightMm: paper.heightMm };
  const fit = Math.max(0.01, Math.min(Math.max(1, size.width - 48) / paper.w, Math.max(1, size.height - 48) / paper.h));
  const paperSizePx = { width: paper.w * fit, height: paper.h * fit };
  const nodes = useSceneStore((s) => s.nodes);
  const storedCamera = useSceneStore((s) => s.cameras[cameraIndex]);
  const renderSettings = useSceneStore((s) => s.renderSettings);
  const activeCameraIndex = useSceneStore(s => s.activeCameraIndex);
  const setActiveCameraIndex = useSceneStore(s => s.setActiveCameraIndex);
  const selectCamera = useCallback(() => setActiveCameraIndex(cameraIndex), [cameraIndex, setActiveCameraIndex]);
  const updateCamera = useSceneStore((s) => s.updateCamera);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize(current => {
        const next = { width: Math.floor(width), height: Math.floor(height) };
        return next.width === current.width && next.height === current.height ? current : next;
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const commitCamera = useCallback((camera: CameraConfig) => updateCamera(cameraIndex, camera), [cameraIndex, updateCamera]);
  const { camera, isDragging, isInteracting, handlers, handleWheel } = useOrbitCamera(storedCamera, commitCamera, paperSizePx);
  const { svg, rendering, progress, renderTimeMs, pathCount, error, cancel, retry, renderedCamera, preview } =
    useWorkerRender(nodes, camera, paper.w, paper.h, renderSettings, isInteracting);

  useEffect(() => {
    const element = overlayRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => { selectCamera(); handleWheel(event); };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [handleWheel, selectCamera]);

  // Compensate only against the camera that produced the displayed SVG. A
  // document commit must not remove feedback while its render is still pending.
  // Perspective zoom moves the eye: different depths scale differently, so a
  // flat CSS scale would jump when the correctly projected preview arrives.
  const cssScale = camera.ortho && renderedCamera && sameCameraView(camera, renderedCamera)
    ? (camera.zoom ?? 1) / (renderedCamera.zoom ?? 1) : 1;
  const currentZoom = camera.zoom ?? 1;

  return (
    <div className="viewport" ref={containerRef} data-active={activeCameraIndex === cameraIndex} onPointerDownCapture={selectCamera} onFocus={selectCamera}>
      <div className="viewport-paper" data-paper-size={paperSize} aria-label="Paper edge; export margins are configured separately" style={{ ...paperSizePx, background: renderSettings.backgroundColor }}>
      <div className="viewport-overlay" ref={overlayRef} {...handlers} tabIndex={0} role="region" aria-label={`${camera.name} canvas`}
        style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }} />
      <GridOverlay {...dimensions} />
      <div className="viewport-svg" data-preview={preview ? 'true' : 'false'}
        style={{ transform: cssScale !== 1 ? `scale(${cssScale})` : undefined, transformOrigin: 'center center' }}
        dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      {showLabel && (
        <div className="viewport-label">
          <span className="viewport-camera-name">{camera.name}</span>
          {activeCameraIndex === cameraIndex && <span className="viewport-badge">Export view</span>}
          {camera.ortho && <span className="viewport-badge">Ortho</span>}
          {currentZoom !== 1 && <span className="viewport-badge">{currentZoom.toFixed(1)}x</span>}
        </div>
      )}
      <div className="viewport-stats">
        {preview && <span className="viewport-preview">Wireframe preview</span>}
        {rendering && <><span className="viewport-rendering" role="status">{progress}</span>
          <button className="btn btn-xs" onClick={cancel}>Cancel</button></>}
        {error && <span role="alert">{error}{' '}<button className="btn btn-xs" onClick={retry}>Retry</button></span>}
        {!rendering && <span>{pathCount} paths &middot; {renderTimeMs.toFixed(0)}ms</span>}
      </div>
    </div>
  );
}
