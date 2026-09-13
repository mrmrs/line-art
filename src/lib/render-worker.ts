import { renderScene } from './render';
import { LatestRender } from './latest-render';
import type { SceneNode, CameraConfig, RenderSettings } from './types';
interface ViewRequest {
  type: 'render';
  id: number;
  revision: number;
  camera: CameraConfig;
  width: number;
  height: number;
  settings: RenderSettings;
}
let scene: { nodes: SceneNode[]; revision: number } = {
  nodes: [],
  revision: 0,
};
const queue = new LatestRender<ViewRequest & { nodes: SceneNode[] }>(
  async (request, current) => {
    const { id, nodes, camera, width, height, settings } = request;
    const step = Math.max(0.5, settings.step);
    const draft = renderScene(nodes, camera, width, height, {
      ...settings,
      step,
    });
    if (!current()) return;
    self.postMessage({
      type: 'result',
      id,
      isFinal: step === settings.step,
      ...draft,
    });
    if (step === settings.step) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!current()) return;
    const final = renderScene(nodes, camera, width, height, settings);
    if (current())
      self.postMessage({ type: 'result', id, isFinal: true, ...final });
  },
  (error, request) =>
    self.postMessage({ type: 'error', id: request.id, error: String(error) }),
);
self.onmessage = (
  event: MessageEvent<
    ViewRequest | { type: 'scene'; revision: number; nodes: SceneNode[] }
  >,
) => {
  const message = event.data;
  if (message.type === 'scene') {
    scene = message;
    return;
  }
  if (message.revision !== scene.revision) {
    self.postMessage({
      type: 'error',
      id: message.id,
      error: 'Scene revision mismatch',
    });
    return;
  }
  self.postMessage({ type: 'started', id: message.id });
  queue.submit({ ...message, nodes: scene.nodes });
};
