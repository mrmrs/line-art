import { renderScene, renderNavigationPreview } from './render';
import { LatestRender } from './latest-render';
import type {
  SceneNode,
  CameraConfig,
  RenderSettings,
  BooleanParams,
} from './types';
interface ViewRequest {
  type: 'render';
  id: number;
  revision: number;
  camera: CameraConfig;
  width: number;
  height: number;
  settings: RenderSettings;
  interactive?: boolean;
}
let scene: { nodes: SceneNode[]; revision: number } = {
  nodes: [],
  revision: 0,
};
const queue = new LatestRender<ViewRequest & { nodes: SceneNode[] }>(
  async (request, current) => {
    const { id, nodes, camera, width, height, settings } = request;
    if (request.interactive) {
      const preview = renderNavigationPreview(nodes, camera, width, height, settings);
      if (current()) self.postMessage({ type: 'result', id, isFinal: true, ...preview });
      return;
    }
    // Boolean operands use analytic events, even when their children are curved.
    // Only standalone tessellated curves benefit from another tolerance pass.
    const booleanChildren = new Set(
      nodes.flatMap((n) =>
        n.type === 'boolean' ? (n.params as BooleanParams).childIds : [],
      ),
    );
    const needsRefinement = nodes.some(
      (n) =>
        n.visible &&
        !booleanChildren.has(n.id) &&
        (n.type === 'cone' || n.type === 'cylinder'),
    );
    const curveTolerance = needsRefinement
      ? Math.max(1, settings.curveTolerance ?? 0.25)
      : (settings.curveTolerance ?? 0.25);
    const draft = renderScene(nodes, camera, width, height, {
      ...settings,
      curveTolerance,
    }, { onProgress: message => self.postMessage({ type: 'progress', id, message }) });
    if (!current()) return;
    self.postMessage({
      type: 'result',
      id,
      isFinal: curveTolerance === (settings.curveTolerance ?? 0.25),
      ...draft,
    });
    if (curveTolerance === (settings.curveTolerance ?? 0.25)) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!current()) return;
    const final = renderScene(nodes, camera, width, height, settings,
      { onProgress: message => self.postMessage({ type: 'progress', id, message }) });
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
