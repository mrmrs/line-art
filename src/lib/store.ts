import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  SceneNode,
  CameraConfig,
  ViewMode,
  RenderSettings,
  ShapeType,
  ShapeParams,
  TransformParams,
  SlicingConfig,
} from './types';
import { DEFAULT_TRANSFORM, DEFAULT_SLICING, DEFAULT_RENDER_SETTINGS } from './types';
import { CAMERA_PRESETS } from './cameras';
import { clearMeshCache } from './render';

// =============================================================================
// Zustand Store: Reactive scene state with localStorage persistence
// =============================================================================

const STORAGE_KEY = 'lnjs-studio-scene';
const SAVE_DEBOUNCE_MS = 500;

let _idCounter = 0;
function genId(): string {
  return `node_${++_idCounter}_${Date.now().toString(36)}`;
}

// --- localStorage persistence ---

interface SavedState {
  nodes: SceneNode[];
  cameras: CameraConfig[];
  renderSettings: RenderSettings;
  viewMode: ViewMode;
  activeCameraIndex: number;
}

function saveToStorage(state: SavedState): void {
  try {
    // Skip saving mesh data (too large). Strip data field from mesh params.
    const nodes = state.nodes.map((n) => {
      if (n.type === 'mesh') {
        return { ...n, params: { ...n.params, data: '[[saved]]' } };
      }
      return n;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, nodes }));
  } catch {
    // Storage full or unavailable — silently fail
  }
}

function loadFromStorage(): Partial<SavedState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedState;
    // Filter out mesh nodes with stripped data (they can't render)
    if (data.nodes) {
      data.nodes = data.nodes.filter(
        (n) => n.type !== 'mesh' || (n.params as { data?: string }).data !== '[[saved]]',
      );
      // Ensure IDs are unique and bump counter
      for (const n of data.nodes) {
        const match = n.id.match(/^node_(\d+)/);
        if (match) _idCounter = Math.max(_idCounter, parseInt(match[1], 10));
      }
    }
    return data;
  } catch {
    return null;
  }
}

export interface SceneStore {
  // --- State ---
  nodes: SceneNode[];
  selectedId: string | null;
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
  updateNode: (id: string, updates: Partial<SceneNode>) => void;
  updateNodeParams: (id: string, params: Partial<ShapeParams>) => void;
  updateNodeTransform: (id: string, transform: Partial<TransformParams>) => void;
  updateNodeSlicing: (id: string, slicing: Partial<SlicingConfig>) => void;
  toggleNodeVisibility: (id: string) => void;
  selectNode: (id: string | null) => void;
  clearScene: () => void;
  loadNodes: (nodes: Omit<SceneNode, 'id'>[]) => void;
  appendNodes: (nodes: Omit<SceneNode, 'id'>[]) => void;

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

const restored = loadFromStorage();

export const useSceneStore = create<SceneStore>()(
  subscribeWithSelector((set) => ({
  // --- Initial state (restored from localStorage if available) ---
  nodes: restored?.nodes ?? [],
  selectedId: null,
  viewMode: (restored?.viewMode as ViewMode) ?? 'single',
  cameras: restored?.cameras ?? CAMERA_PRESETS.map((c) => ({ ...c })),
  activeCameraIndex: restored?.activeCameraIndex ?? 0,
  renderSettings: restored?.renderSettings ?? { ...DEFAULT_RENDER_SETTINGS },
  renderVersion: 0,

  // --- Node actions ---
  addNode: (type, name, params, transform) => {
    const id = genId();
    const node: SceneNode = {
      id,
      name,
      type,
      params,
      transform: transform ? { ...DEFAULT_TRANSFORM, ...transform } : { ...DEFAULT_TRANSFORM },
      visible: true,
      slicing: { ...DEFAULT_SLICING },
    };
    set((s) => ({
      nodes: [...s.nodes, node],
      selectedId: id,
      renderVersion: s.renderVersion + 1,
    }));
    return id;
  },

  removeNode: (id) => {
    clearMeshCache(id);
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      renderVersion: s.renderVersion + 1,
    }));
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
          ? { ...n, params: { ...n.params, ...paramUpdates } as ShapeParams }
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

  toggleNodeVisibility: (id) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, visible: !n.visible } : n,
      ),
      renderVersion: s.renderVersion + 1,
    }));
  },

  selectNode: (id) => set({ selectedId: id }),

  clearScene: () => {
    clearMeshCache();
    set((s) => ({
      nodes: [],
      selectedId: null,
      renderVersion: s.renderVersion + 1,
    }));
  },

  loadNodes: (nodeData) => {
    clearMeshCache();
    const nodes = nodeData.map((n) => ({ ...n, id: genId() }));
    set((s) => ({
      nodes,
      selectedId: nodes.length > 0 ? nodes[0].id : null,
      renderVersion: s.renderVersion + 1,
    }));
  },

  appendNodes: (nodeData) => {
    const newNodes = nodeData.map((n) => ({ ...n, id: genId() }));
    set((s) => ({
      nodes: [...s.nodes, ...newNodes],
      selectedId: newNodes.length > 0 ? newNodes[0].id : s.selectedId,
      renderVersion: s.renderVersion + 1,
    }));
  },

  // --- Camera ---
  updateCamera: (index, updates) => {
    set((s) => ({
      cameras: s.cameras.map((c, i) => (i === index ? { ...c, ...updates } : c)),
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

  bumpRenderVersion: () => set((s) => ({ renderVersion: s.renderVersion + 1 })),
})));

// --- Auto-save to localStorage on state changes (debounced) ---
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
useSceneStore.subscribe(
  (s) => ({ nodes: s.nodes, cameras: s.cameras, renderSettings: s.renderSettings, viewMode: s.viewMode, activeCameraIndex: s.activeCameraIndex }),
  (slice) => {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      saveToStorage(slice);
    }, SAVE_DEBOUNCE_MS);
  },
  { equalityFn: () => false }, // always trigger on any set()
);
