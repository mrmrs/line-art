import { useEffect, useRef, useState } from 'react';
import type { SceneNode, CameraConfig, RenderSettings, RenderResult } from '../lib/types';
import { renderScene } from '../lib/render';

// =============================================================================
// Render Hook: debounced rendering with preview/quality modes
// =============================================================================

export function useRender(
  nodes: SceneNode[],
  camera: CameraConfig,
  width: number,
  height: number,
  settings: RenderSettings,
  isDragging: boolean,
  renderVersion: number,
): RenderResult & { rendering: boolean } {
  const [result, setResult] = useState<RenderResult>({
    svg: '',
    renderTimeMs: 0,
    pathCount: 0,
  });
  const [rendering, setRendering] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const renderCountRef = useRef(0);

  useEffect(() => {
    if (width <= 0 || height <= 0) return;

    // Clear pending render
    if (timerRef.current) clearTimeout(timerRef.current);

    const debounceMs = isDragging ? 16 : 50;
    const effectiveSettings: RenderSettings = isDragging
      ? { ...settings, step: Math.max(settings.step, 0.1) }
      : settings;

    setRendering(true);
    const currentRender = ++renderCountRef.current;

    timerRef.current = setTimeout(() => {
      try {
        if (nodes.length === 0) {
          // Empty scene: just produce blank SVG
          const blankSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:${effectiveSettings.backgroundColor}"></svg>`;
          if (currentRender === renderCountRef.current) {
            setResult({ svg: blankSvg, renderTimeMs: 0, pathCount: 0 });
            setRendering(false);
          }
          return;
        }
        const r = renderScene(nodes, camera, width, height, effectiveSettings);
        // Only apply if this is still the latest render
        if (currentRender === renderCountRef.current) {
          setResult(r);
          setRendering(false);
        }
      } catch (err) {
        console.error('Render error:', err);
        if (currentRender === renderCountRef.current) {
          setResult((prev) => ({ ...prev, svg: prev.svg || '' }));
          setRendering(false);
        }
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, camera, width, height, settings, isDragging, renderVersion]);

  return { ...result, rendering };
}
