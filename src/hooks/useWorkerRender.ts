import { useCallback, useEffect, useRef, useState } from 'react';
import type { SceneNode, CameraConfig, RenderSettings, RenderResult } from '../lib/types';

export function sameCameraView(a: CameraConfig, b: CameraConfig): boolean {
  return a.ortho === b.ortho && a.orthoSize === b.orthoSize && a.fovy === b.fovy &&
    (['eye', 'center', 'up'] as const).every(key => a[key].every((value, j) => Math.abs(value - b[key][j]) < 1e-9));
}

interface Request {
  id: number;
  nodes: SceneNode[];
  camera: CameraConfig;
  width: number;
  height: number;
  settings: RenderSettings;
  interactive: boolean;
}

export function useWorkerRender(
  nodes: SceneNode[], camera: CameraConfig, width: number, height: number,
  settings: RenderSettings, isDragging: boolean,
): RenderResult & {
  renderedCamera: CameraConfig | null;
  preview: boolean;
  rendering: boolean;
  error: string | null;
  cancel: () => void;
  retry: () => void;
} {
  const [result, setResult] = useState<RenderResult & {
    renderedCamera: CameraConfig | null; preview: boolean;
  }>({ svg: '', renderTimeMs: 0, pathCount: 0, renderedCamera: null, preview: false });
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const worker = useRef<Worker | null>(null);
  const sentNodes = useRef<SceneNode[] | null>(null);
  const serial = useRef(0), revision = useRef(0);
  const active = useRef<Request | null>(null);
  const pending = useRef<Request | null>(null);
  const wanted = useRef<Request | null>(null);
  const pump = useRef<() => void>(() => {});
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = useCallback(() => {
    clearTimeout(timeout.current);
    worker.current?.terminate();
    worker.current = null;
    sentNodes.current = null;
    active.current = pending.current = wanted.current = null;
  }, []);
  const cancel = useCallback(() => {
    stop();
    setRendering(false);
    setError('Render cancelled. Change a control or retry.');
  }, [stop]);
  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    if (width <= 0 || height <= 0) return;
    // Orthographic zoom is exactly a 2D scale. Keep the occluded artwork on
    // screen throughout the gesture instead of replacing thousands of SVG
    // elements with a wireframe every frame. Release requests the exact view.
    // Scene, settings, size, pan and orbit changes must still render immediately.
    const previous = wanted.current;
    if (isDragging && camera.ortho && previous && !previous.interactive &&
      previous.nodes === nodes && previous.settings === settings &&
      previous.width === width && previous.height === height &&
      sameCameraView(previous.camera, camera)) return;
    if (!worker.current) {
      const instance = new Worker(new URL('../lib/render-worker.ts', import.meta.url), { type: 'module' });
      worker.current = instance;
      // Backpressure belongs on the main thread: a busy worker cannot discard
      // queued messages until its synchronous occlusion pass has finished.
      pump.current = () => {
        if (worker.current !== instance || active.current || !pending.current) return;
        const request = pending.current;
        pending.current = null;
        active.current = request;
        if (sentNodes.current !== request.nodes) {
          instance.postMessage({ type: 'scene', revision: ++revision.current, nodes: request.nodes });
          sentNodes.current = request.nodes;
        }
        const { nodes: _nodes, ...view } = request;
        void _nodes;
        instance.postMessage({ type: 'render', revision: revision.current, ...view });
        clearTimeout(timeout.current);
        timeout.current = setTimeout(() => {
          stop();
          setRendering(false);
          setError('Render exceeded 30 seconds. Reduce scene complexity or retry.');
        }, 30000);
      };
      instance.onmessage = (event) => {
        const msg = event.data;
        const request = active.current, target = wanted.current;
        if (worker.current !== instance || !request || !target || msg.id !== request.id) return;
        // While moving, display completed preview frames instead of starving
        // behind newer input. Never publish a stale scene, size, or exact result.
        const compatible = request.nodes === target.nodes && request.settings === target.settings &&
          request.width === target.width && request.height === target.height;
        const display = request.id === target.id ||
          (compatible && request.interactive && target.interactive);
        if (msg.type === 'started') {
          setRendering(true);
          setError(null);
        }
        if (msg.type === 'result' && display) {
          setResult({ svg: msg.svg, pathCount: msg.pathCount, renderTimeMs: msg.renderTimeMs,
            renderedCamera: request.camera, preview: request.interactive });
        }
        if ((msg.type === 'result' && msg.isFinal) || msg.type === 'error') {
          clearTimeout(timeout.current);
          active.current = null;
          if (pending.current) pump.current();
          else {
            setRendering(false);
            if (msg.type === 'error') setError(msg.error);
          }
        }
      };
      instance.onerror = (event) => {
        if (worker.current !== instance) return;
        stop(); setRendering(false); setError(event.message || 'Render worker failed');
      };
    }
    wanted.current = pending.current = {
      id: ++serial.current, nodes, camera, width, height, settings, interactive: isDragging,
    };
    pump.current();
  }, [nodes, camera, width, height, settings, isDragging, attempt, stop]);
  return { ...result, rendering, error, cancel, retry: () => setAttempt((v) => v + 1) };
}
