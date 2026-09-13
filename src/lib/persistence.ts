import type { SavedScene } from './scene-file';
import { normalizeScene } from './scene-file';
import type { MeshParams, SvgExtrudeParams } from './types';
const DB = 'ln-studio-assets-v1';
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('scene');
      request.result.createObjectStore('assets');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(
        new Error('Close other ln.studio tabs to finish opening scene storage'),
      );
    request.onsuccess = () => resolve(request.result);
  });
}
const get = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Scene save aborted'));
    tx.onerror = () => reject(tx.error);
  });
export async function saveScene(scene: SavedScene): Promise<void> {
  const normalized = normalizeScene(scene);
  const db = await openDatabase();
  try {
    const tx = db.transaction(['scene', 'assets'], 'readwrite'),
      completed = done(tx);
    const assets = tx.objectStore('assets');
    assets.clear();
    const nodes = normalized.nodes.map((node) => {
      if (node.type === 'mesh') {
        const key = `mesh:${node.id}`;
        assets.put((node.params as MeshParams).data, key);
        return { ...node, params: { ...node.params, data: `@asset:${key}` } };
      }
      if (
        node.type === 'svg-extrude' &&
        (node.params as SvgExtrudeParams).sourceSvg
      ) {
        const key = `svg:${node.id}`;
        assets.put((node.params as SvgExtrudeParams).sourceSvg, key);
        return {
          ...node,
          params: { ...node.params, sourceSvg: `@asset:${key}` },
        };
      }
      return node;
    });
    tx.objectStore('scene').put({ ...normalized, nodes }, 'current');
    await completed;
  } finally {
    db.close();
  }
}
export async function loadScene(): Promise<SavedScene | null> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(['scene', 'assets'], 'readonly');
    const scene = (await get(tx.objectStore('scene').get('current'))) as
      | SavedScene
      | undefined;
    if (!scene) return null;
    // Queue every asset request in the same active transaction turn.
    await Promise.all(
      scene.nodes.map(async (node) => {
        const params = node.params as unknown as Record<string, unknown>;
        const field =
          node.type === 'mesh'
            ? 'data'
            : node.type === 'svg-extrude'
              ? 'sourceSvg'
              : '';
        const value = params[field];
        if (typeof value === 'string' && value.startsWith('@asset:')) {
          const asset = await get(tx.objectStore('assets').get(value.slice(7)));
          if (typeof asset !== 'string')
            throw new Error(`Missing stored asset for ${node.name}`);
          params[field] = asset;
        }
      }),
    );
    return normalizeScene(scene);
  } finally {
    db.close();
  }
}
