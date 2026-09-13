import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  SceneNode,
  CameraConfig,
  RenderSettings,
  RenderResult,
} from '../lib/types';
export function useWorkerRender(
  nodes: SceneNode[],
  camera: CameraConfig,
  width: number,
  height: number,
  settings: RenderSettings,
  isDragging: boolean,
): RenderResult & {
  rendering: boolean;
  error: string | null;
  cancel: () => void;
  retry: () => void;
} {
  const [result, setResult] = useState<RenderResult>({
    svg: '',
    renderTimeMs: 0,
    pathCount: 0,
  });
  const [rendering, setRendering] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const worker = useRef<Worker | null>(null),
    sentNodes = useRef<SceneNode[] | null>(null);
  const latest = useRef(0),
    revision = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = useCallback(() => {
    clearTimeout(timeout.current);
    worker.current?.terminate();
    worker.current = null;
    sentNodes.current = null;
    latest.current++;
  }, []);
  const cancel = useCallback(() => {
    stop();
    setRendering(false);
    setError('Render cancelled. Change a control or retry.');
  }, [stop]);
  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    if (width <= 0 || height <= 0) return;
    if (!worker.current) {
      const instance = new Worker(
        new URL('../lib/render-worker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.current = instance;
      instance.onmessage = (event) => {
        const msg = event.data;
        if (msg.id !== latest.current) return;
        if (msg.type === 'started') {
          setRendering(true);
          setError(null);
        } else if (msg.type === 'result') {
          setResult({
            svg: msg.svg,
            pathCount: msg.pathCount,
            renderTimeMs: msg.renderTimeMs,
          });
          if (msg.isFinal) {
            clearTimeout(timeout.current);
            setRendering(false);
          }
        } else if (msg.type === 'error') {
          clearTimeout(timeout.current);
          setRendering(false);
          setError(msg.error);
        }
      };
      instance.onerror = (event) => {
        stop();
        setRendering(false);
        setError(event.message || 'Render worker failed');
      };
    }
    if (sentNodes.current !== nodes) {
      worker.current.postMessage({
        type: 'scene',
        revision: ++revision.current,
        nodes,
      });
      sentNodes.current = nodes;
    }
    const id = ++latest.current;
    worker.current.postMessage({
      type: 'render',
      id,
      revision: revision.current,
      camera,
      width,
      height,
      settings: isDragging
        ? { ...settings, step: Math.max(settings.step, 0.5) }
        : settings,
    });
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => {
      stop();
      setRendering(false);
      setError('Render exceeded 30 seconds. Reduce scene complexity or retry.');
    }, 30000);
  }, [nodes, camera, width, height, settings, isDragging, attempt, stop]);
  return {
    ...result,
    rendering,
    error,
    cancel,
    retry: () => setAttempt((v) => v + 1),
  };
}
