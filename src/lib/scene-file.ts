import type {
  SceneNode,
  CameraConfig,
  RenderSettings,
  ViewMode,
} from './types';
import {
  DEFAULT_RENDER_SETTINGS,
  DEFAULT_SLICING,
  DEFAULT_TRANSFORM,
} from './types';
import { validateNodes, validateView, LIMITS } from './limits';
import { CAMERA_PRESETS } from './cameras';
export interface SavedScene {
  nodes: SceneNode[];
  cameras: CameraConfig[];
  renderSettings: RenderSettings;
  viewMode: ViewMode;
  activeCameraIndex: number;
}
export interface SceneFile {
  format: 'ln-studio';
  version: 1;
  scene: SavedScene;
}
export function normalizeScene(value: unknown): SavedScene {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid scene document');
  const raw = value as Partial<SavedScene>;
  if (!Array.isArray(raw.nodes)) throw new Error('Scene has no nodes array');
  const scene: SavedScene = {
    nodes: raw.nodes.map((n) => {
      const params = { ...n.params } as unknown as Record<string, unknown>;
      delete params.bevelDepth;
      delete params.bevelSegments;
      const slicing = {
        ...DEFAULT_SLICING,
        ...n.slicing,
      } as typeof DEFAULT_SLICING & { gap?: number };
      delete slicing.gap;
      return {
        ...n,
        params: params as unknown as SceneNode['params'],
        transform: { ...DEFAULT_TRANSFORM, ...n.transform },
        slicing,
      };
    }),
    cameras: raw.cameras ?? CAMERA_PRESETS.map((c) => ({ ...c })),
    renderSettings: { ...DEFAULT_RENDER_SETTINGS, ...raw.renderSettings },
    viewMode: raw.viewMode ?? 'single',
    activeCameraIndex: raw.activeCameraIndex ?? 0,
  };
  if (
    !['single', '1x2', '2x2', '3x2'].includes(scene.viewMode) ||
    !Array.isArray(scene.cameras) ||
    scene.cameras.length !== CAMERA_PRESETS.length
  )
    throw new Error('Invalid scene views');
  if (
    !Number.isInteger(scene.activeCameraIndex) ||
    scene.activeCameraIndex < 0 ||
    scene.activeCameraIndex >= scene.cameras.length
  )
    throw new Error('Invalid active camera');
  validateNodes(scene.nodes);
  scene.cameras.forEach((camera) =>
    validateView(camera, 100, 100, scene.renderSettings),
  );
  return scene;
}
export function serializeScene(scene: SavedScene): string {
  return JSON.stringify({
    format: 'ln-studio',
    version: 1,
    scene: normalizeScene(scene),
  } satisfies SceneFile);
}
export function parseScene(text: string): SavedScene {
  if (text.length > LIMITS.inputBytes * 3)
    throw new Error('Scene file exceeds size limit');
  const file = JSON.parse(text) as SceneFile;
  if (file.format !== 'ln-studio' || file.version !== 1)
    throw new Error('Unsupported scene file version');
  return normalizeScene(file.scene);
}
export type ImportNode = Omit<SceneNode, 'id'> & { id?: string };
export function remapNodes(
  input: ImportNode[],
  makeId: () => string,
): SceneNode[] {
  const ids = new Map<string, string>();
  const nodes = structuredClone(input).map((node) => {
    const id = makeId();
    if (node.id) {
      if (ids.has(node.id)) throw new Error('Duplicate imported node ID');
      ids.set(node.id, id);
    }
    return { ...node, id };
  });
  for (const node of nodes)
    if (node.type === 'boolean') {
      const p = node.params as { childIds: [string, string] };
      p.childIds = p.childIds.map((id) => {
        const next = ids.get(id);
        if (!next) throw new Error(`Missing imported Boolean child: ${id}`);
        return next;
      }) as [string, string];
    }
  validateNodes(nodes);
  return nodes;
}
