import { useCallback, useRef, useEffect, useState } from 'react';
import type { CameraConfig } from '../lib/types';
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
  const nodes = useSceneStore((s) => s.nodes);
  const storedCamera = useSceneStore((s) => s.cameras[cameraIndex]);
  const renderSettings = useSceneStore((s) => s.renderSettings);
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
  const { camera, isDragging, isInteracting, handlers, handleWheel } = useOrbitCamera(storedCamera, commitCamera, size);
  const { svg, rendering, renderTimeMs, pathCount, error, cancel, retry, renderedCamera, preview } =
    useWorkerRender(nodes, camera, size.width, size.height, renderSettings, isInteracting);

  useEffect(() => {
    const element = overlayRef.current;
    if (!element) return;
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Compensate only against the camera that produced the displayed SVG. A
  // document commit must not remove feedback while its render is still pending.
  // Perspective zoom moves the eye: different depths scale differently, so a
  // flat CSS scale would jump when the correctly projected preview arrives.
  const cssScale = camera.ortho && renderedCamera && sameCameraView(camera, renderedCamera)
    ? (camera.zoom ?? 1) / (renderedCamera.zoom ?? 1) : 1;
  const currentZoom = camera.zoom ?? 1;

  return (
    <div className="viewport" ref={containerRef} style={{ background: renderSettings.backgroundColor }}>
      <div className="viewport-overlay" ref={overlayRef} {...handlers}
        style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }} />
      <div className="viewport-svg" data-preview={preview ? 'true' : 'false'}
        style={{ transform: cssScale !== 1 ? `scale(${cssScale})` : undefined, transformOrigin: 'center center' }}
        dangerouslySetInnerHTML={{ __html: svg }} />
      {showLabel && (
        <div className="viewport-label">
          <span className="viewport-camera-name">{camera.name}</span>
          {camera.ortho && <span className="viewport-badge">Ortho</span>}
          {currentZoom !== 1 && <span className="viewport-badge">{currentZoom.toFixed(1)}x</span>}
        </div>
      )}
      <div className="viewport-stats">
        {preview && <span className="viewport-preview">Wireframe preview</span>}
        {rendering && <><span className="viewport-rendering">rendering</span>
          <button className="btn btn-xs" onClick={cancel}>Cancel</button></>}
        {error && <span role="alert">{error}{' '}<button className="btn btn-xs" onClick={retry}>Retry</button></span>}
        {!rendering && <span>{pathCount} paths &middot; {renderTimeMs.toFixed(0)}ms</span>}
      </div>
    </div>
  );
}
