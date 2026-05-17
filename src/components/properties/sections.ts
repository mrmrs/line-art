import type { SceneNode, ShapeType } from '../../lib/types';

// =============================================================================
// Section registry — drives the Properties panel.
//
// Each section declares a visibleFor(node) predicate. Properties iterates
// the registry and only renders sections that apply to the current selection.
// This is the structural fix for "Slicing shown on non-mesh", etc.
// =============================================================================

// Shapes that have a real mesh form (slicing, fills, contour all work on these).
// OBJ/STL meshes, SVG extrude, and text extrude are all triangle-based.
export const MESH_LIKE: ReadonlySet<ShapeType> = new Set<ShapeType>([
  'mesh',
  'svg-extrude',
  'text-extrude',
]);

// Shapes that emit transformable shapes — i.e. the node-level transform applies.
// Today: everything (line grids also use transform now); kept for future.
export function showsTransform(node: SceneNode): boolean {
  void node;
  return true;
}

// Shapes that should expose Slicing.
export function showsSlicing(node: SceneNode): boolean {
  return MESH_LIKE.has(node.type);
}

// Shapes that should expose shape-specific params (everything except types
// that have no editable params).
export function showsShapeParams(node: SceneNode): boolean {
  return node.type !== 'mesh' || true; // mesh still shows file info
}
