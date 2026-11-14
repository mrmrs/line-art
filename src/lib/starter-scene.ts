import { CAMERA_PRESETS } from './cameras';
import { PRESETS } from './presets';
import type { SavedScene } from './scene-file';
import type { Theme } from './theme';
import {
  DEFAULT_RENDER_SETTINGS, DEFAULT_SLICING, DEFAULT_TRANSFORM,
  type CubeGridParams, type LineGridParams, type SceneNode,
} from './types';

/** A small, editable introduction. Existing scenes, including empty ones, win. */
export async function createStarterScene(
  theme: Theme,
  random = Math.random,
  loadSuzanne = async () => {
    const response = await fetch('/models/suzanne.obj', { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error('Starter model unavailable');
    const data = await response.text();
    if (!/^v\s/m.test(data) || !/^f\s/m.test(data)) throw new Error('Invalid starter model');
    return data;
  },
): Promise<SavedScene> {
  const kind = Math.min(2, Math.floor(random() * 3));
  const cameras = structuredClone(CAMERA_PRESETS);
  let node: Omit<SceneNode, 'id'>;
  if (kind === 2) {
    try {
      node = {
        name: 'Suzanne', type: 'mesh',
        params: { data: await loadSuzanne(), format: 'obj', fileName: 'suzanne.obj' },
        transform: { ...DEFAULT_TRANSFORM, rotate: [0, 0, -20 + random() * 40], scale: [1.3, 1.3, 1.3] },
        visible: true, slicing: { ...DEFAULT_SLICING },
      };
      // Bundled models face the Hero camera's positive-Y hemisphere.
      cameras[0] = { ...cameras[0], eye: [2.4, 5, 2.1], ortho: true, orthoSize: 2.5 };
    } catch {
      // Offline or slow model delivery should still open a useful design.
      node = PRESETS.find(p => p.name === 'Wave Lines')!.create()[0];
    }
  } else if (kind === 1) {
    node = PRESETS.find(p => p.name === 'Noise Lattice')!.create()[0];
    const count = 7 + Math.floor(random() * 5);
    node.params = {
      ...node.params as CubeGridParams,
      countX: count, countY: count, countZ: count,
      spacing: 3 / count, sizeMax: 2.4 / count,
      noiseSeed: Math.floor(random() * 10000), noiseScale: 0.5 + random() * 0.8,
    };
    cameras[0] = { ...cameras[0], ortho: true, orthoSize: 2.5 };
  } else {
    const names = ['Line Grid', 'Wave Lines', 'Radial Lines'];
    node = PRESETS.find(p => p.name === names[Math.min(2, Math.floor(random() * 3))])!.create()[0];
    const count = 12 + Math.floor(random() * 9);
    node.params = { ...node.params as LineGridParams, countX: count, countY: count, spacing: 3.6 / count };
    node.transform = { ...node.transform, rotate: [0, 0, -15 + random() * 30] };
  }
  return {
    nodes: [{ ...node, id: 'starter' }], cameras, viewMode: 'single', activeCameraIndex: 0,
    renderSettings: {
      ...DEFAULT_RENDER_SETTINGS,
      strokeColor: theme === 'dark' ? '#ffffff' : '#171717',
      backgroundColor: theme === 'dark' ? '#141414' : '#ffffff',
    },
  };
}
