import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { temporal } from 'zundo';
import type {
  SceneNode,
  CameraConfig,
  ViewMode,
  RenderSettings,
  ShapeType,
  ShapeParams,
  TransformParams,
  SlicingConfig,
  FillConfig,
  FillType,
} from './types';
import { makeDefaultFill } from './types';
import {
  DEFAULT_TRANSFORM,
  DEFAULT_SLICING,
  DEFAULT_RENDER_SETTINGS,
} from './types';
import { CAMERA_PRESETS } from './cameras';
import { remapNodes, normalizeScene } from './scene-file';
import type { ImportNode, SavedScene } from './scene-file';
import { saveScene, loadScene } from './persistence';
import { validateNodes } from './limits';

// =============================================================================
// Zustand Store: Reactive scene state with localStorage persistence
// =============================================================================

const STORAGE_KEY = 'lnjs-studio-scene';
const SAVE_DEBOUNCE_MS = 500;

let _idCounter = 0;
function genId(): string {
  return `node_${++_idCounter}_${Date.now().toString(36)}`;
}

export const useStorageStatus = create<{
  ready: boolean;
  error: string | null;
}>(() => ({ ready: false, error: null }));
export function reportError(error: unknown) {
  useStorageStatus.setState({ error: String(error) });
}
export function snapshotScene(): SavedScene {
  const { nodes, cameras, renderSettings, viewMode, activeCameraIndex } =
    useSceneStore.getState();
  return { nodes, cameras, renderSettings, viewMode, activeCameraIndex };
}

export interface SceneStore {
  // --- State ---
  nodes: SceneNode[];
  // Primary selection (what Properties edits). Null when nothing selected.
  selectedId: string | null;
  // Full selection set, ordered. Always contains selectedId when non-null.
  // Used by bulk actions (delete-many, hide-many) and visual highlighting.
  selectedIds: string[];
  viewMode: ViewMode;
  cameras: CameraConfig[];
  activeCameraIndex: number;
  renderSettings: RenderSettings;
  renderVersion: number; // bumped on any change that requires re-render

  // --- Node actions ---
  addNode: (
    type: ShapeType,
    name: string,
    params: ShapeParams,
    transform?: TransformParams,
  ) => string;
  removeNode: (id: string) => void;
  removeNodes: (ids: string[]) => void;
  updateNode: (id: string, updates: Partial<SceneNode>) => void;
  updateNodeParams: (id: string, params: Partial<ShapeParams>) => void;
  updateNodeTransform: (
    id: string,
    transform: Partial<TransformParams>,
  ) => void;
  updateNodeSlicing: (id: string, slicing: Partial<SlicingConfig>) => void;
  addFill: (id: string, type: FillType) => string;
  updateFill: (
    id: string,
    fillId: string,
    updates: Partial<FillConfig>,
  ) => void;
  removeFill: (id: string, fillId: string) => void;
  toggleNodeVisibility: (id: string) => void;
  // additive=true toggles id in/out of selection; default replaces.
  selectNode: (id: string | null, additive?: boolean) => void;
  // Reorder a node: place it at `targetIndex` in the nodes array.
  moveNode: (id: string, targetIndex: number) => void;
  clearScene: () => void;
  loadNodes: (nodes: ImportNode[]) => void;
  appendNodes: (nodes: ImportNode[]) => void;

  importScene: (scene: SavedScene) => void;

  // --- Camera actions ---
  updateCamera: (index: number, camera: Partial<CameraConfig>) => void;
  setActiveCameraIndex: (index: number) => void;

  // --- View actions ---
  setViewMode: (mode: ViewMode) => void;

  // --- Settings actions ---
  updateRenderSettings: (settings: Partial<RenderSettings>) => void;

  // --- Render trigger ---
  bumpRenderVersion: () => void;
}

export const useSceneStore = create<SceneStore>()(
  subscribeWithSelector(
    temporal(
      (set) => ({
        // --- Initial state (restored from localStorage if available) ---
        nodes: [],
        selectedId: null,
        selectedIds: [],
        viewMode: 'single',
        cameras: CAMERA_PRESETS.map((c) => ({ ...c })),
        activeCameraIndex: 0,
        renderSettings: { ...DEFAULT_RENDER_SETTINGS },
        renderVersion: 0,

        // --- Node actions ---
        addNode: (type, name, params, transform) => {
          const id = genId();
          const node: SceneNode = {
            id,
            name,
            type,
            params,
            transform: transform
              ? { ...DEFAULT_TRANSFORM, ...transform }
              : { ...DEFAULT_TRANSFORM },
            visible: true,
            slicing: { ...DEFAULT_SLICING },
          };
          set((s) => ({
            nodes: [...s.nodes, node],
            selectedId: id,
            selectedIds: [id],
            renderVersion: s.renderVersion + 1,
          }));
          return id;
        },

        removeNode: (id) => {
          set((s) => {
            const remainingIds = s.selectedIds.filter((sid) => sid !== id);
            return {
              nodes: s.nodes.filter((n) => n.id !== id),
              selectedId:
                s.selectedId === id ? (remainingIds[0] ?? null) : s.selectedId,
              selectedIds: remainingIds,
              renderVersion: s.renderVersion + 1,
            };
          });
        },

        removeNodes: (ids) => {
          if (ids.length === 0) return;
          const idSet = new Set(ids);
          set((s) => {
            const remainingIds = s.selectedIds.filter((sid) => !idSet.has(sid));
            const primaryRemoved =
              s.selectedId !== null && idSet.has(s.selectedId);
            return {
              nodes: s.nodes.filter((n) => !idSet.has(n.id)),
              selectedId: primaryRemoved
                ? (remainingIds[0] ?? null)
                : s.selectedId,
              selectedIds: remainingIds,
              renderVersion: s.renderVersion + 1,
            };
          });
        },

        updateNode: (id, updates) => {
          set((s) => ({
            nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
            renderVersion: s.renderVersion + 1,
          }));
        },

        updateNodeParams: (id, paramUpdates) => {
          set((s) => ({
            nodes: s.nodes.map((n) =>
              n.id === id
                ? {
                    ...n,
                    params: { ...n.params, ...paramUpdates } as ShapeParams,
                  }
                : n,
            ),
            renderVersion: s.renderVersion + 1,
          }));
        },

        updateNodeTransform: (id, transformUpdates) => {
          set((s) => ({
            nodes: s.nodes.map((n) =>
              n.id === id
                ? { ...n, transform: { ...n.transform, ...transformUpdates } }
                : n,
            ),
            renderVersion: s.renderVersion + 1,
          }));
        },

        updateNodeSlicing: (id, slicingUpdates) => {
          set((s) => ({
            nodes: s.nodes.map((n) =>
              n.id === id
                ? { ...n, slicing: { ...n.slicing, ...slicingUpdates } }
                : n,
            ),
            renderVersion: s.renderVersion + 1,
          }));
        },

        addFill: (id, type) => {
          const fillId = genId();
          set((s) => ({
            nodes: s.nodes.map((n) =>
              n.id === id
                ? {
                    ...n,
                    fills: [...(n.fills ?? []), makeDefaultFill(type, fillId)],
                  }
                : n,
            ),
            renderVersion: s.renderVersion + 1,
          }));
          return fillId;
        },

        updateFill: (id, fillId, updates) => {
          set((s) => ({
            nodes: s.nodes.map((n) =>
              n.id === id
                ? {
                    ...n,
                    fills: (n.fills ?? []).map((f) =>
                      f.id === fillId ? { ...f, ...updates } : f,
                    ),
                  }
                : n,
            ),
            renderVersion: s.renderVersion + 1,
          }));
        },

        removeFill: (id, fillId) => {
          set((s) => ({
            nodes: s.nodes.map((n) =>
              n.id === id
                ? {
                    ...n,
                    fills: (n.fills ?? []).filter((f) => f.id !== fillId),
                  }
                : n,
            ),
            renderVersion: s.renderVersion + 1,
          }));
        },

        toggleNodeVisibility: (id) => {
          set((s) => ({
            nodes: s.nodes.map((n) =>
              n.id === id ? { ...n, visible: !n.visible } : n,
            ),
            renderVersion: s.renderVersion + 1,
          }));
        },

        selectNode: (id, additive = false) =>
          set((s) => {
            if (id === null) return { selectedId: null, selectedIds: [] };
            if (!additive) return { selectedId: id, selectedIds: [id] };
            // Toggle id in/out of selection
            const already = s.selectedIds.includes(id);
            if (already) {
              const next = s.selectedIds.filter((sid) => sid !== id);
              return {
                selectedId:
                  s.selectedId === id ? (next[0] ?? null) : s.selectedId,
                selectedIds: next,
              };
            }
            return {
              selectedId: id,
              selectedIds: [...s.selectedIds, id],
            };
          }),

        moveNode: (id, targetIndex) => {
          set((s) => {
            const fromIndex = s.nodes.findIndex((n) => n.id === id);
            if (fromIndex < 0 || fromIndex === targetIndex) return s;
            const next = [...s.nodes];
            const [moved] = next.splice(fromIndex, 1);
            const insertAt =
              fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
            const clamped = Math.max(0, Math.min(insertAt, next.length));
            next.splice(clamped, 0, moved);
            return { nodes: next, renderVersion: s.renderVersion + 1 };
          });
        },

        clearScene: () => {
          set((s) => ({
            nodes: [],
            selectedId: null,
            selectedIds: [],
            renderVersion: s.renderVersion + 1,
          }));
        },

        loadNodes: (nodeData) => {
          let nodes: SceneNode[];
          try {
            nodes = remapNodes(nodeData, genId);
          } catch (error) {
            reportError(error);
            return;
          }
          const first = nodes.length > 0 ? nodes[0].id : null;
          set((s) => ({
            nodes,
            selectedId: first,
            selectedIds: first ? [first] : [],
            renderVersion: s.renderVersion + 1,
          }));
        },

        appendNodes: (nodeData) => {
          let newNodes: SceneNode[];
          try {
            newNodes = remapNodes(nodeData, genId);
            validateNodes([...useSceneStore.getState().nodes, ...newNodes]);
          } catch (error) {
            reportError(error);
            return;
          }
          const firstNew = newNodes.length > 0 ? newNodes[0].id : null;
          set((s) => ({
            nodes: [...s.nodes, ...newNodes],
            selectedId: firstNew ?? s.selectedId,
            selectedIds: firstNew ? [firstNew] : s.selectedIds,
            renderVersion: s.renderVersion + 1,
          }));
        },

        importScene: (scene) => {
          const normalized = normalizeScene(scene);
          const nodes = remapNodes(normalized.nodes, genId);
          set((s) => ({
            ...normalized,
            nodes,
            selectedId: null,
            selectedIds: [],
            renderVersion: s.renderVersion + 1,
          }));
        },

        // --- Camera ---
        updateCamera: (index, updates) => {
          set((s) => ({
            cameras: s.cameras.map((c, i) =>
              i === index ? { ...c, ...updates } : c,
            ),
            renderVersion: s.renderVersion + 1,
          }));
        },

        setActiveCameraIndex: (index) => set({ activeCameraIndex: index }),

        // --- View ---
        setViewMode: (mode) => set({ viewMode: mode }),

        // --- Settings ---
        updateRenderSettings: (updates) => {
          set((s) => ({
            renderSettings: { ...s.renderSettings, ...updates },
            renderVersion: s.renderVersion + 1,
          }));
        },

        bumpRenderVersion: () =>
          set((s) => ({ renderVersion: s.renderVersion + 1 })),
      }),
      {
        // Don't snapshot selection/renderVersion in history — they're ephemeral UI state.
        partialize: (state) => {
          const { selectedId, selectedIds, renderVersion, ...rest } = state;
          void selectedId;
          void selectedIds;
          void renderVersion;
          return rest;
        },
        limit: 50,
      },
    ),
  ),
);

// Serialize transactions so slow writes never overwrite newer snapshots.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> = Promise.resolve();
export function flushSceneSave(): Promise<void> {
  clearTimeout(saveTimer);
  if (!useStorageStatus.getState().ready) return saving;
  const snapshot = snapshotScene();
  saving = saving.catch(() => {}).then(() => saveScene(snapshot));
  saving.catch(reportError);
  return saving;
}
useSceneStore.subscribe(
  (s) => [
    s.nodes,
    s.cameras,
    s.renderSettings,
    s.viewMode,
    s.activeCameraIndex,
  ],
  () => {
    if (!useStorageStatus.getState().ready) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void flushSceneSave();
    }, SAVE_DEBOUNCE_MS);
  },
  { equalityFn: (a, b) => a.every((value, i) => value === b[i]) },
);
export const storageReady = (async () => {
  try {
    let scene = await loadScene();
    if (!scene) {
      const old = localStorage.getItem(STORAGE_KEY);
      if (old) {
        const legacy = JSON.parse(old) as SavedScene;
        if (
          legacy.nodes.some(
            (n) =>
              n.type === 'mesh' &&
              (n.params as { data?: string }).data === '[[saved]]',
          )
        ) {
          throw new Error(
            'The previous save omitted mesh assets. Import a scene file or reimport those meshes; the old save has been kept.',
          );
        }
        scene = normalizeScene(legacy);
        await saveScene(scene);
      }
    }
    if (scene) {
      useSceneStore.setState(scene);
      for (const n of scene.nodes) {
        const match = /^node_(\d+)/.exec(n.id);
        if (match) _idCounter = Math.max(_idCounter, Number(match[1]));
      }
      useSceneStore.temporal.getState().clear();
    }
  } catch (error) {
    reportError(error);
  } finally {
    useStorageStatus.setState({ ready: true });
  }
})();
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushSceneSave();
  });
