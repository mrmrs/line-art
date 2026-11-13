import { LibraryIcon } from './LibraryIcon';
import type { LibraryIconName } from '../lib/library-icons';
import { useRef, useState } from 'react';
import { useSceneStore } from '../lib/store';
import { PresetLibrary } from './PresetLibrary';
import { DEFAULT_TRANSFORM } from '../lib/types';
import { useFileLoader } from '../hooks/useFileLoader';
import { DEFAULT_CUBE_GRID_PARAMS, DEFAULT_LINE_GRID_PARAMS, DEFAULT_PLANE_GRID_PARAMS, DEFAULT_AUTOMATA_GRID_PARAMS, DEFAULT_TEXT_EXTRUDE_PARAMS } from '../lib/types';
import type { ShapeType, ShapeParams, CubeParams, SphereParams, ConeParams, CylinderParams, FunctionParams, PointCloudParams, CubeGridParams, LineGridParams, PlaneGridParams, AutomataGridParams, TextExtrudeParams } from '../lib/types';
import { nodeComplexity } from '../lib/complexity';

// =============================================================================
// Left Sidebar: Scene tree + Shape library + Presets
// =============================================================================

const SHAPE_ICONS: Record<ShapeType, LibraryIconName> = {
  'packed-composition': 'packed', cube: 'cube', sphere: 'sphere', cone: 'cone',
  cylinder: 'cylinder', function: 'surface', mesh: 'mesh', 'point-cloud': 'points',
  boolean: 'boolean', 'cube-grid': 'lattice', 'line-grid': 'lines', 'plane-grid': 'planes',
  'automata-grid': 'automata', 'svg-extrude': 'extrude', 'text-extrude': 'text',
};

const SHAPE_DEFAULTS: { type: ShapeType; name: string; params: ShapeParams }[] = [
  {
    type: 'cube',
    name: 'Cube',
    params: { min: [-1, -1, -1], max: [1, 1, 1] } as CubeParams,
  },
  {
    type: 'sphere',
    name: 'Sphere',
    params: { center: [0, 0, 0], radius: 1 } as SphereParams,
  },
  {
    type: 'cone',
    name: 'Cone',
    params: { radius: 1, height: 2 } as ConeParams,
  },
  {
    type: 'cylinder',
    name: 'Cylinder',
    params: { radius: 0.5, z0: -1, z1: 1 } as CylinderParams,
  },
  {
    type: 'function',
    name: 'Surface',
    params: {
      expression: 'Math.sin(x * 2) * Math.cos(y * 2) * 0.5',
      bounds: { min: [-3, -3, -2], max: [3, 3, 2] },
      direction: 'below',
    } as FunctionParams,
  },
  {
    type: 'point-cloud',
    name: 'Point Cloud',
    params: {
      pointSize: 0.03,
      pattern: 'fibonacci-sphere',
      count: 200,
      radius: 1.5,
      gridSpacing: 0.3,
    } as PointCloudParams,
  },
  {
    type: 'cube-grid',
    name: 'Cube Grid',
    params: { ...DEFAULT_CUBE_GRID_PARAMS } as CubeGridParams,
  },
  {
    type: 'line-grid',
    name: 'Line Grid',
    params: { ...DEFAULT_LINE_GRID_PARAMS } as LineGridParams,
  },
  {
    type: 'plane-grid',
    name: 'Plane Grid',
    params: { ...DEFAULT_PLANE_GRID_PARAMS } as PlaneGridParams,
  },
  {
    type: 'automata-grid',
    name: 'Automata',
    params: { ...DEFAULT_AUTOMATA_GRID_PARAMS } as AutomataGridParams,
  },
  {
    type: 'text-extrude',
    name: 'Text',
    params: { ...DEFAULT_TEXT_EXTRUDE_PARAMS } as TextExtrudeParams,
  },
];

export function Sidebar() {
  const nodes = useSceneStore((s) => s.nodes);
  const selectedId = useSceneStore((s) => s.selectedId);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const selectNode = useSceneStore((s) => s.selectNode);
  const moveNode = useSceneStore((s) => s.moveNode);
  const toggleNodeVisibility = useSceneStore((s) => s.toggleNodeVisibility);
  const removeNode = useSceneStore((s) => s.removeNode);
  const removeNodes = useSceneStore((s) => s.removeNodes);
  const addNode = useSceneStore((s) => s.addNode);
  const clearScene = useSceneStore((s) => s.clearScene);
  const loadFiles = useFileLoader();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag state for reordering. We only need to know which row is being
  // dragged and which row the pointer is currently over.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  return (
    <aside className="sidebar">
      {/* Scene Tree */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Scene</span>
          <button
            className="btn btn-xs btn-ghost"
            onClick={clearScene}
            title="Clear scene"
          >
            Clear
          </button>
        </div>
        <div className="scene-tree">
          {nodes.length === 0 && (
            <div className="scene-tree-empty">
              No shapes yet. Add one below or drop an OBJ/STL file.
            </div>
          )}
          {nodes.map((node, idx) => {
            const isSelected = selectedIds.includes(node.id);
            const isPrimary = selectedId === node.id;
            const isDragOver = overId === node.id && dragId !== node.id;
            return (
              <div
                key={node.id}
                className={
                  `scene-tree-item${isSelected ? ' selected' : ''}` +
                  `${isPrimary && selectedIds.length > 1 ? ' primary' : ''}` +
                  `${isDragOver ? ' drag-over' : ''}`
                }
                draggable
                onClick={(e) => selectNode(node.id, e.metaKey || e.ctrlKey)}
                onDragStart={(e) => {
                  setDragId(node.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', node.id);
                }}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (overId !== node.id) setOverId(node.id);
                }}
                onDragLeave={() => { if (overId === node.id) setOverId(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const sourceId = e.dataTransfer.getData('text/plain') || dragId;
                  if (sourceId && sourceId !== node.id) moveNode(sourceId, idx);
                  setDragId(null); setOverId(null);
                }}
              >
                <button
                  className={`btn-icon visibility-toggle ${node.visible ? 'visible' : 'hidden'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleNodeVisibility(node.id);
                  }}
                  title={node.visible ? 'Hide' : 'Show'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
                    {node.visible ? <circle cx="12" cy="12" r="3" /> : <path d="m3 3 18 18" />}
                  </svg>
                </button>
                <span className="scene-tree-icon">
                  <LibraryIcon name={SHAPE_ICONS[node.type]} />
                </span>
                <span className="scene-tree-name">{node.name}</span>
                {(() => {
                  const c = nodeComplexity(node);
                  return c ? <span className="scene-tree-badge">{c}</span> : null;
                })()}
                <button
                  className="btn-icon delete-btn"
                  type="button"
                  aria-label={selectedIds.length > 1 && selectedIds.includes(node.id)
                    ? `Delete ${selectedIds.length} selected`
                    : `Delete ${node.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    // If this node is part of a multi-selection, delete all of them.
                    if (selectedIds.length > 1 && selectedIds.includes(node.id)) {
                      removeNodes(selectedIds);
                    } else {
                      removeNode(node.id);
                    }
                  }}
                  title={selectedIds.length > 1 && selectedIds.includes(node.id)
                    ? `Delete ${selectedIds.length} selected`
                    : 'Delete'}
                >
                  <svg
                    width="14" height="14" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="1.75"
                    strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true" focusable="false"
                  >
                    <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Shape Library */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Add Shape</span>
        </div>
        <div className="shape-library">
          {SHAPE_DEFAULTS.map((shape) => (
            <button
              key={shape.type}
              className="shape-library-item"
              onClick={() =>
                addNode(shape.type, shape.name, { ...shape.params }, { ...DEFAULT_TRANSFORM })
              }
            >
              <span className="shape-library-icon">
                <LibraryIcon name={SHAPE_ICONS[shape.type]} />
              </span>
              <span className="shape-library-name">{shape.name}</span>
            </button>
          ))}
        </div>
      </div>

      <PresetLibrary />

      {/* Import file */}
      <div className="sidebar-section sidebar-drop-hint">
        <input
          ref={fileInputRef}
          type="file"
          accept=".obj,.stl,.svg"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files) {
              loadFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />
        <button
          className="import-file-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="drop-hint-icon">+</span>
          <span>Import OBJ / STL / SVG</span>
        </button>
        <div className="drop-hint-text-small">
          or drag &amp; drop files anywhere
        </div>
      </div>
    </aside>
  );
}
