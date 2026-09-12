import { renderScene } from './render';
import type { SceneNode, CameraConfig, RenderSettings } from './types';

// =============================================================================
// Web Worker for off-thread ln.js rendering — progressive (draft + final).
//
// For each request we render TWO passes:
//   1. Draft at step ≥ 0.5 — usually tens of ms even on heavy scenes.
//      Posted immediately so the user sees the latest scene/camera with
//      minimal latency.
//   2. Final at the user's requested step — only kicks off if no newer
//      request has arrived in the meantime. Posted with isFinal: true.
//
// Result: dragging a slider or orbiting the camera feels continuous (draft
// updates at ~30Hz on heavy scenes) and quality catches up the moment
// interaction settles.
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
    pendingRequest = e.data;
    scheduleProcess();
  }
};

function scheduleProcess() {
  if (scheduled) return;
  scheduled = true;
  // Yield to event loop so all queued messages arrive before we start
  setTimeout(() => {
    scheduled = false;
    void processNext();
  }, 0);
}

const DRAFT_STEP = 0.5;

async function processNext() {
  const req = pendingRequest;
  if (!req) return;
  pendingRequest = null;

  try {
    const userStep = req.settings.step;
    const draftStep = Math.max(DRAFT_STEP, userStep);

    // Pass 1: draft (always — even when userStep ≥ DRAFT_STEP this just
    // renders at the user's step, in which case we'll skip pass 2 below).
    const draftSettings: RenderSettings = { ...req.settings, step: draftStep };
    const draft = renderScene(req.nodes, req.camera, req.width, req.height, draftSettings);
    self.postMessage({
      type: 'result',
      id: req.id,
      isFinal: draftStep === userStep,
      svg: draft.svg,
      renderTimeMs: draft.renderTimeMs,
      pathCount: draft.pathCount,
    });

    // If a newer request arrived while we were drafting, skip the final
    // pass and go process it — fresher data beats higher quality.
    if (pendingRequest) {
      scheduleProcess();
      return;
    }

    // Pass 2: final (only when it's actually a quality upgrade)
    if (draftStep !== userStep) {
      // Yield once more so any in-flight message can land before we commit
      // to the slow path.
      await new Promise((r) => setTimeout(r, 0));
      if (pendingRequest) { scheduleProcess(); return; }

      const final = renderScene(req.nodes, req.camera, req.width, req.height, req.settings);
      self.postMessage({
        type: 'result',
        id: req.id,
        isFinal: true,
        svg: final.svg,
        renderTimeMs: final.renderTimeMs,
        pathCount: final.pathCount,
      });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: req.id, error: String(err) });
  }

  if (pendingRequest) scheduleProcess();
}
