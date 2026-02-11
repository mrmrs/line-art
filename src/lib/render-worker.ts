import { renderScene } from './render';
import type { SceneNode, CameraConfig, RenderSettings } from './types';

// =============================================================================
// Web Worker for off-thread ln.js rendering
//
// Strategy: only ever process the LATEST request. When a render finishes,
// check if a newer request arrived during computation and process that instead.
// This means rapid camera changes (orbit/zoom) skip intermediate frames.
// =============================================================================

interface RenderRequest {
  type: 'render';
  id: number;
  nodes: SceneNode[];
  camera: CameraConfig;
  width: number;
  height: number;
  settings: RenderSettings;
}

let pendingRequest: RenderRequest | null = null;
let scheduled = false;

self.onmessage = (e: MessageEvent<RenderRequest>) => {
  if (e.data.type === 'render') {
    // Always overwrite with latest request
    pendingRequest = e.data;
    scheduleProcess();
  }
};

function scheduleProcess() {
  if (scheduled) return;
  scheduled = true;
  // Yield to event loop so all queued messages arrive before we start rendering
  setTimeout(() => {
    scheduled = false;
    processNext();
  }, 0);
}

function processNext() {
  const req = pendingRequest;
  if (!req) return;
  pendingRequest = null;

  try {
    const result = renderScene(req.nodes, req.camera, req.width, req.height, req.settings);
    self.postMessage({
      type: 'result',
      id: req.id,
      svg: result.svg,
      renderTimeMs: result.renderTimeMs,
      pathCount: result.pathCount,
    });
  } catch (err) {
    self.postMessage({
      type: 'error',
      id: req.id,
      error: String(err),
    });
  }

  // If newer requests arrived during rendering, process the latest
  if (pendingRequest) {
    scheduleProcess();
  }
}
