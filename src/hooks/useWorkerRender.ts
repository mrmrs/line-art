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
  const renderingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const emptyResult: RenderResult | null =
    width > 0 && height > 0 && nodes.length === 0
      ? {
          svg:
            `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
            `viewBox="0 0 ${width} ${height}" style="background:${settings.backgroundColor}"></svg>`,
          renderTimeMs: 0,
          pathCount: 0,
        }
      : null;

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
          if (renderingTimerRef.current) clearTimeout(renderingTimerRef.current);
          setResult({
            svg: msg.svg,
            renderTimeMs: msg.renderTimeMs,
            pathCount: msg.pathCount,
          });
          setRendering(false);
        }
      } else if (msg.type === 'error') {
        console.error('Worker render error:', msg.error);
        if (renderingTimerRef.current) clearTimeout(renderingTimerRef.current);
        setRendering(false);
      }
    };

    worker.onerror = (e) => {
      console.error('Worker error:', e);
      if (renderingTimerRef.current) clearTimeout(renderingTimerRef.current);
      setRendering(false);
    };

    workerRef.current = worker;
    return () => {
      if (renderingTimerRef.current) clearTimeout(renderingTimerRef.current);
      worker.terminate();
    };
  }, []);

  // --- Send render requests ---
  useEffect(() => {
    if (width <= 0 || height <= 0 || !workerRef.current) return;

    if (nodes.length === 0) {
      latestIdRef.current += 1;
      if (renderingTimerRef.current) clearTimeout(renderingTimerRef.current);
      // Clear stale image when scene becomes empty. Defer to a microtask so
      // setState is not called synchronously inside the effect body.
      renderingTimerRef.current = setTimeout(() => {
        setResult({ svg: '', renderTimeMs: 0, pathCount: 0 });
        setRendering(false);
      }, 0);
      return;
    }

    // Use faster settings during interaction
    const effectiveSettings: RenderSettings = isDragging
      ? { ...settings, step: Math.max(settings.step, 0.5) }
      : settings;

    const id = ++latestIdRef.current;
    if (renderingTimerRef.current) clearTimeout(renderingTimerRef.current);
    renderingTimerRef.current = setTimeout(() => {
      if (id === latestIdRef.current) setRendering(true);
    }, 0);

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

  return emptyResult ? { ...emptyResult, rendering: false } : { ...result, rendering };
}
