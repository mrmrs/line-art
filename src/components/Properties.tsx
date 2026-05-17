import { useCallback } from 'react';
import { useSceneStore } from '../lib/store';
import type {
  SceneNode,
  CubeParams, SphereParams, ConeParams, CylinderParams,
  FunctionParams, MeshParams, PointCloudParams, BooleanParams,
  CubeGridParams, LineGridParams, PlaneGridParams, AutomataGridParams,
  SvgExtrudeParams, TextExtrudeParams,
  TransformParams, SlicingConfig,
} from '../lib/types';
import { TransformEditor } from './properties/TransformEditor';
import { SlicingEditor } from './properties/SlicingEditor';
import { CameraControls } from './properties/CameraControls';
import { CubeGridEditor } from './properties/CubeGridEditor';
import { LineGridEditor } from './properties/LineGridEditor';
import { PlaneGridEditor } from './properties/PlaneGridEditor';
import { AutomataGridEditor } from './properties/AutomataGridEditor';
import {
  CubeEditor, SphereEditor, ConeEditor, CylinderEditor,
  FunctionEditor, MeshEditor, PointCloudEditor, BooleanEditor,
} from './properties/ShapeEditors';
import { SvgExtrudeEditor } from './properties/SvgExtrudeEditor';
import { TextExtrudeEditor } from './properties/TextExtrudeEditor';
import { FillEditor } from './properties/FillEditor';
import { showsSlicing, showsTransform, MESH_LIKE } from './properties/sections';

// =============================================================================
// Right Sidebar: Properties panel for the selected node + camera controls.
//
// Architecture:
//   - The Properties panel is a thin shell. All real editing UI lives in
//     ./properties/* components, each memoized so a slider drag on one
//     editor does NOT cause its siblings to re-render.
//   - Section visibility is driven by predicates in ./properties/sections.ts
//     (slicing only on mesh-like shapes, etc.) — controls don't show up at
//     all when they don't apply to the selected node.
//   - All store writes go through onCommit* callbacks which are stable across
//     renders via useCallback; the editors batch slider changes to one
//     commit per animation frame via useDraftValue.
// =============================================================================

export function Properties() {
  const selectedId = useSceneStore((s) => s.selectedId);
  const nodes = useSceneStore((s) => s.nodes);
  const updateNode = useSceneStore((s) => s.updateNode);
  const updateNodeParams = useSceneStore((s) => s.updateNodeParams);
  const updateNodeTransform = useSceneStore((s) => s.updateNodeTransform);
  const updateNodeSlicing = useSceneStore((s) => s.updateNodeSlicing);
  const cameras = useSceneStore((s) => s.cameras);
  const activeCameraIndex = useSceneStore((s) => s.activeCameraIndex);
  const updateCamera = useSceneStore((s) => s.updateCamera);

  const node = nodes.find((n) => n.id === selectedId) ?? null;

  const onCameraChange = useCallback(
    (updates: Partial<typeof cameras[number]>) => updateCamera(activeCameraIndex, updates),
    [updateCamera, activeCameraIndex],
  );

  return (
    <aside className="properties">
      <CameraControls camera={cameras[activeCameraIndex]} onChange={onCameraChange} />
      {node && (
        <NodeProperties
          node={node}
          nodes={nodes}
          updateNode={updateNode}
          updateNodeParams={updateNodeParams}
          updateNodeTransform={updateNodeTransform}
          updateNodeSlicing={updateNodeSlicing}
        />
      )}
    </aside>
  );
}

function NodeProperties({
  node, nodes,
  updateNode, updateNodeParams, updateNodeTransform, updateNodeSlicing,
}: {
  node: SceneNode;
  nodes: SceneNode[];
  updateNode: (id: string, updates: Partial<SceneNode>) => void;
  updateNodeParams: (id: string, params: Record<string, unknown>) => void;
  updateNodeTransform: (id: string, transform: Partial<TransformParams>) => void;
  updateNodeSlicing: (id: string, slicing: Partial<SlicingConfig>) => void;
}) {
  const id = node.id;
  const onParams = useCallback(
    (p: Record<string, unknown>) => updateNodeParams(id, p),
    [updateNodeParams, id],
  );
  const onTransform = useCallback(
    (t: Partial<TransformParams>) => updateNodeTransform(id, t),
    [updateNodeTransform, id],
  );
  const onSlicing = useCallback(
    (s: Partial<SlicingConfig>) => updateNodeSlicing(id, s),
    [updateNodeSlicing, id],
  );

  return (
    <>
      <div className="properties-header">
        <input
          className="input properties-name-input"
          value={node.name}
          onChange={(e) => updateNode(id, { name: e.target.value })}
        />
      </div>

      {showsTransform(node) && (
        <div className="properties-section">
          <div className="properties-section-title">Transform</div>
          <TransformEditor transform={node.transform} onChange={onTransform} />
        </div>
      )}

      <div className="properties-section">
        <div className="properties-section-title">Shape</div>
        <ShapeBody node={node} nodes={nodes} onChange={onParams} />
      </div>

      {showsSlicing(node) && (
        <div className="properties-section">
          <div className="properties-section-title">Slicing</div>
          <SlicingEditor slicing={node.slicing} onChange={onSlicing} />
        </div>
      )}

      {MESH_LIKE.has(node.type) && (
        <div className="properties-section">
          <div className="properties-section-title">Fills</div>
          <FillEditor nodeId={node.id} fills={node.fills ?? []} />
        </div>
      )}
    </>
  );
}

function ShapeBody({
  node, nodes, onChange,
}: {
  node: SceneNode;
  nodes: SceneNode[];
  onChange: (p: Record<string, unknown>) => void;
}) {
  switch (node.type) {
    case 'cube':         return <CubeEditor p={node.params as CubeParams} onChange={onChange} />;
    case 'sphere':       return <SphereEditor p={node.params as SphereParams} onChange={onChange} />;
    case 'cone':         return <ConeEditor p={node.params as ConeParams} onChange={onChange} />;
    case 'cylinder':     return <CylinderEditor p={node.params as CylinderParams} onChange={onChange} />;
    case 'function':     return <FunctionEditor p={node.params as FunctionParams} onChange={onChange} />;
    case 'mesh':         return <MeshEditor p={node.params as MeshParams} />;
    case 'point-cloud':  return <PointCloudEditor p={node.params as PointCloudParams} onChange={onChange} />;
    case 'boolean':      return <BooleanEditor p={node.params as BooleanParams} onChange={onChange} nodes={nodes} currentId={node.id} />;
    case 'cube-grid':    return <CubeGridEditor params={node.params as CubeGridParams} onChange={onChange} />;
    case 'line-grid':    return <LineGridEditor params={node.params as LineGridParams} onChange={onChange} />;
    case 'plane-grid':   return <PlaneGridEditor params={node.params as PlaneGridParams} onChange={onChange} />;
    case 'automata-grid':return <AutomataGridEditor params={node.params as AutomataGridParams} onChange={onChange} />;
    case 'svg-extrude':  return <SvgExtrudeEditor params={node.params as SvgExtrudeParams} onChange={onChange} />;
    case 'text-extrude': return <TextExtrudeEditor params={node.params as TextExtrudeParams} onChange={onChange} />;
    default:             return <div className="property-row">No editable properties</div>;
  }
}
