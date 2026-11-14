import * as ln from '@lnjs/core';
import { assertPaths, LIMITS } from './limits';
import { projectPaths } from './projection';

/** Conservative screen bounds: boxes crossing the eye plane belong to every tile. */
function tileRange(shape: ln.ShapeT, matrix: ln.Matrix, divisions: number): number[] | null {
  const box = shape.boundingBox();
  const corners: number[][] = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    corners.push([
      matrix.x00 * x + matrix.x01 * y + matrix.x02 * z + matrix.x03,
      matrix.x10 * x + matrix.x11 * y + matrix.x12 * z + matrix.x13,
      matrix.x20 * x + matrix.x21 * y + matrix.x22 * z + matrix.x23,
      matrix.x30 * x + matrix.x31 * y + matrix.x32 * z + matrix.x33,
    ]);
  }
  // A linear homogeneous plane containing no box corner cannot intersect the
  // box. This includes entirely behind-eye boxes; crossing boxes stay conservative.
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1])
    if (corners.every(p => p[3] + sign * p[axis] < -1e-10)) return null;
  if (corners.some(p => !(p[3] > 0))) return [0, divisions - 1, 0, divisions - 1];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y, , w] of corners) {
    minX = Math.min(minX, x / w); maxX = Math.max(maxX, x / w);
    minY = Math.min(minY, y / w); maxY = Math.max(maxY, y / w);
  }
  const pad = 1e-10 * Math.max(1, Math.abs(minX), Math.abs(maxX), Math.abs(minY), Math.abs(maxY));
  if (maxX < -1 - pad || minX > 1 + pad || maxY < -1 - pad || minY > 1 + pad) return null;
  const tile = (v: number) => Math.max(0, Math.min(divisions - 1, Math.floor((v + 1) * divisions / 2)));
  return [tile(minX - pad), tile(maxX + pad), tile(minY - pad), tile(maxY + pad)];
}

/** Exact tiled hidden-line removal. Only a tile's source paths and projected
 * occluders are resident at once; tile boundaries split paths, never geometry. */
export function projectTiledScene(
  shapes: ln.ShapeT[], extraPaths: ln.Paths, occludedPaths: ln.Paths,
  matrix: ln.Matrix, eye: ln.Vector, width: number, height: number, step: number,
  curveTolerance: number, divisions = 8, emitShapePaths = true,
  onProgress?: (message: string) => void,
  budget = { samples: 0, paths: 0, vertices: 0 },
): ln.Paths {
  const tiles: ln.ShapeT[][] = Array.from({ length: divisions * divisions }, () => []);
  for (const shape of shapes) {
    const range = tileRange(shape, matrix, divisions);
    if (!range) continue;
    for (let y = range[2]; y <= range[3]; y++) for (let x = range[0]; x <= range[1]; x++)
      tiles[y * divisions + x].push(shape);
  }
  const output: ln.Paths = [];
  for (let y = 0; y < divisions; y++) for (let x = 0; x < divisions; x++) {
    onProgress?.(`Rendering tile ${y * divisions + x + 1} of ${divisions * divisions}…`);
    const scene = new ln.Scene();
    for (const shape of tiles[y * divisions + x]) scene.add(shape);
    // Continuous triangle occlusion needs no ray BVH for cube-only scenes.
    // Compile when a non-cube shape can require fallback ray queries.
    if (scene.shapes.some(shape => !isCube(shape))) scene.compile();
    const crop = new ln.Matrix(divisions, 0, 0, divisions - 1 - 2 * x,
      0, divisions, 0, divisions - 1 - 2 * y, 0, 0, 1, 0, 0, 0, 0, 1).mul(matrix);
    const w = width / divisions, h = height / divisions;
    // Near-plane round-shape fallback uses viewport dimensions to choose its
    // tessellation. Retain at least full-viewport resolution in the smaller tile.
    const options = { curveTolerance: curveTolerance / divisions, maxTests: 1_000_000_000 };
    const paths = projectPaths(emitShapePaths ? scene.paths() : [], crop, eye, w, h, step, scene, budget, options);
    for (const p of projectPaths(occludedPaths, crop, eye, w, h, step, scene, budget, options)) paths.push(p);
    for (const p of projectPaths(extraPaths, crop, eye, w, h, step)) paths.push(p);
    for (const path of paths) {
      // A stroke exactly on a shared edge belongs to the preceding tile only.
      if ((x > 0 && path.every(p => Math.abs(p.x) < 1e-9)) ||
          (y > 0 && path.every(p => Math.abs(p.y) < 1e-9))) continue;
      for (const p of path) { p.x += x * w; p.y += y * h; }
      budget.paths++; budget.vertices += path.length;
      if (budget.paths > LIMITS.paths || budget.vertices > LIMITS.vertices)
        throw new Error('Visible SVG exceeds the output budget. Reduce detail or crop the camera view.');
      output.push(path);
    }
    tiles[y * divisions + x] = [];
  }
  assertPaths(output);
  return output;
}
function isCube(shape: ln.ShapeT): boolean {
  if (shape instanceof ln.TransformedShape) return isCube(shape.shape);
  if (shape.occlusionShape) return isCube(shape.occlusionShape);
  return shape instanceof ln.Cube;
}
