import { useRef } from 'react';
import { useSceneStore } from '../lib/store';
import { PRESETS } from '../lib/presets';
import { DEFAULT_TRANSFORM } from '../lib/types';
import { useFileLoader } from '../hooks/useFileLoader';
import { DEFAULT_CUBE_GRID_PARAMS, DEFAULT_LINE_GRID_PARAMS, DEFAULT_PLANE_GRID_PARAMS, DEFAULT_AUTOMATA_GRID_PARAMS, DEFAULT_TEXT_EXTRUDE_PARAMS } from '../lib/types';
import type { ShapeType, ShapeParams, CubeParams, SphereParams, ConeParams, CylinderParams, FunctionParams, PointCloudParams, CubeGridParams, LineGridParams, PlaneGridParams, AutomataGridParams, TextExtrudeParams } from '../lib/types';
import { nodeComplexity } from '../lib/complexity';

// =============================================================================
// Left Sidebar: Scene tree + Shape library + Presets
// =============================================================================

const SHAPE_ICONS: Record<ShapeType, string> = {
  cube: '\u25FB',
  sphere: '\u25CB',
  cone: '\u25B3',
  cylinder: '\u25AF',
  function: '\u0192',
  mesh: '\u25C8',
  'point-cloud': '\u2022',
  boolean: '\u2295',
  'cube-grid': '\u2593',
  'line-grid': '\u2502',
  'plane-grid': '\u25AD',
  'automata-grid': '\u2637',
  'svg-extrude': '\u25C6',
  'text-extrude': 'T',
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
    name: 'Function Surface',
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
    name: 'Automata Grid',
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
  const selectNode = useSceneStore((s) => s.selectNode);
  const toggleNodeVisibility = useSceneStore((s) => s.toggleNodeVisibility);
  const removeNode = useSceneStore((s) => s.removeNode);
  const addNode = useSceneStore((s) => s.addNode);
  const loadNodes = useSceneStore((s) => s.loadNodes);
  const appendNodes = useSceneStore((s) => s.appendNodes);
  const clearScene = useSceneStore((s) => s.clearScene);
  const loadFiles = useFileLoader();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          {nodes.map((node) => (
            <div
              key={node.id}
              className={`scene-tree-item ${selectedId === node.id ? 'selected' : ''}`}
              onClick={() => selectNode(node.id)}
            >
              <button
                className={`btn-icon visibility-toggle ${node.visible ? 'visible' : 'hidden'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNodeVisibility(node.id);
                }}
                title={node.visible ? 'Hide' : 'Show'}
              >
                {node.visible ? '\u25C9' : '\u25CE'}
              </button>
              <span className="scene-tree-icon">
                {SHAPE_ICONS[node.type] || '\u25A0'}
              </span>
              <span className="scene-tree-name">{node.name}</span>
              {(() => {
                const c = nodeComplexity(node);
                return c ? <span className="scene-tree-badge">{c}</span> : null;
              })()}
              <button
                className="btn-icon delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  removeNode(node.id);
                }}
                title="Delete"
              >
                {'\u00D7'}
              </button>
            </div>
          ))}
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
                {SHAPE_ICONS[shape.type]}
              </span>
              <span className="shape-library-name">{shape.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Presets */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Presets</span>
        </div>
        <div className="preset-list">
          {PRESETS.map((preset) => (
            <div key={preset.name} className="preset-item-row">
              <button
                className="preset-item"
                onClick={() => {
                  appendNodes(preset.create());
                }}
                title={`Add ${preset.name} to scene`}
              >
                <span className="preset-icon">{preset.icon}</span>
                <div className="preset-info">
                  <span className="preset-name">{preset.name}</span>
                  <span className="preset-desc">{preset.description}</span>
                </div>
              </button>
              <button
                className="btn-icon preset-replace-btn"
                onClick={() => {
                  clearScene();
                  loadNodes(preset.create());
                }}
                title={`Replace scene with ${preset.name}`}
              >
                &#x21BB;
              </button>
            </div>
          ))}
        </div>
      </div>

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
