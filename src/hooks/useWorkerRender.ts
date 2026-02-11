import { useEffect, useRef, useState } from 'react';
import type { SceneNode, CameraConfig, RenderSettings, RenderResult } from '../lib/types';

// =============================================================================
// Worker Render Hook
//
// Sends scene data to a Web Worker for rendering. The worker processes only
// the latest request, so rapid updates (orbit, zoom) stay responsive.
// The main thread never blocks on ln.js rendering.
// =============================================================================

export function useWorkerRender(
  nodes: SceneNode[],
  camera: CameraConfig,
  width: number,
  height: number,
  settings: RenderSettings,
  isDragging: boolean,
): RenderResult & { rendering: boolean } {
  const [result, setResult] = useState<RenderResult>({
    svg: '',
    renderTimeMs: 0,
    pathCount: 0,
  });
  const [rendering, setRendering] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const latestIdRef = useRef(0);

  // --- Initialize worker ---
  useEffect(() => {
    const worker = new Worker(
      new URL('../lib/render-worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'result') {
        // Only accept the result if it's from our latest request
        if (msg.id >= latestIdRef.current) {
          setResult({
            svg: msg.svg,
            renderTimeMs: msg.renderTimeMs,
            pathCount: msg.pathCount,
          });
          setRendering(false);
        }
      } else if (msg.type === 'error') {
        console.error('Worker render error:', msg.error);
        setRendering(false);
      }
    };

    worker.onerror = (e) => {
      console.error('Worker error:', e);
      setRendering(false);
    };

    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  // --- Send render requests ---
  useEffect(() => {
    if (width <= 0 || height <= 0 || !workerRef.current) return;

    // Empty scene: produce blank SVG locally (no worker needed)
    if (nodes.length === 0) {
      const blankSvg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
        `viewBox="0 0 ${width} ${height}" style="background:${settings.backgroundColor}"></svg>`;
      setResult({ svg: blankSvg, renderTimeMs: 0, pathCount: 0 });
      setRendering(false);
      return;
    }

    // Use faster settings during interaction
    const effectiveSettings: RenderSettings = isDragging
      ? { ...settings, step: Math.max(settings.step, 0.5) }
      : settings;

    const id = ++latestIdRef.current;
    setRendering(true);

    workerRef.current.postMessage({
      type: 'render',
      id,
      nodes,
      camera,
      width,
      height,
      settings: effectiveSettings,
    });
  }, [nodes, camera, width, height, settings, isDragging]);

  return { ...result, rendering };
}
