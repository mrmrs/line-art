import * as ln from '@lnjs/core';
import type {
  SceneNode,
  CameraConfig,
  RenderResult,
  RenderSettings,
  CubeParams,
  SphereParams,
  ConeParams,
  CylinderParams,
  FunctionParams,
  MeshParams,
  PointCloudParams,
  BooleanParams,
  CubeGridParams,
  LineGridParams,
  PlaneGridParams,
  AutomataGridParams,
  TransformParams,
  Vec3,
} from './types';
import { PointCloud, generatePointCloud } from './point-cloud';
import { parseSTL } from './stl-loader';
import { generateCubeGrid, noise3d } from './cube-grid';
import { generateAutomataGrid } from './automata-grid';
import { extrudeFromParams } from './svg-extrude';
import { buildFillHost, generateFillPaths, FillShape } from './fills';
import type { SvgExtrudeParams, TextExtrudeParams } from './types';

// =============================================================================
// Render Engine: SceneNode[] -> ln.js Scene -> SVG
// =============================================================================

// Cache parsed mesh triangle data to avoid re-parsing OBJ/STL on every render
const meshTriangleCache = new Map<string, ln.Triangle[]>();

export function clearMeshCache(nodeId?: string) {
  if (nodeId) meshTriangleCache.delete(nodeId);
  else meshTriangleCache.clear();
}

// Cache generator output (cube-grid, plane-grid, automata-grid, line-grid local paths)
// keyed on nodeId, with paramsHash to detect param changes.
interface GeneratorCacheEntry {
  paramsHash: string;
  cubes?: ln.Cube[];      // for cube-grid, plane-grid, automata-grid
  paths?: ln.Paths;        // for line-grid (local-space)
}
const generatorCache = new Map<string, GeneratorCacheEntry>();

// Cache fill output per (nodeId, fillId). Invalidated when host mesh or fill
// params change.
interface FillCacheEntry { hostHash: string; fillHash: string; paths: ln.Paths; }
const fillCache = new Map<string, FillCacheEntry>();

export function clearGeneratorCache(nodeId?: string) {
  if (nodeId) generatorCache.delete(nodeId);
  else generatorCache.clear();
}

// Extract the host triangles for a mesh-like node (used for fills + slicing).
// Returns null if the node has no inherent mesh form.
function getHostTriangles(node: SceneNode): ln.Triangle[] | null {
  if (node.type === 'mesh') {
    const p = node.params as MeshParams;
    let triangles = meshTriangleCache.get(node.id);
    if (!triangles) {
      try {
        if (p.format === 'obj') {
          triangles = ln.loadOBJ(p.data).triangles;
        } else {
          const binary = atob(p.data);
          const buffer = new ArrayBuffer(binary.length);
          const view = new Uint8Array(buffer);
          for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
          triangles = parseSTL(buffer);
        }
        if (triangles && triangles.length > 0) meshTriangleCache.set(node.id, triangles);
      } catch { return null; }
    }
    return triangles ?? null;
  }
  if (node.type === 'svg-extrude' || node.type === 'text-extrude') {
    const p = node.params as SvgExtrudeParams | TextExtrudeParams;
    if (!p.polylines || p.polylines.length === 0) return null;
    const cacheKey = `${node.id}|extrude|${paramsHash({
      polylines: p.polylines,
      extrudeDepth: p.extrudeDepth,
      fitToSize: p.fitToSize,
      centerOnOrigin: p.centerOnOrigin,
    })}`;
    let tris = meshTriangleCache.get(cacheKey);
    if (!tris) {
      tris = extrudeFromParams(p);
      if (!tris || tris.length === 0) return null;
      for (const k of meshTriangleCache.keys()) {
        if (k.startsWith(`${node.id}|`) && k !== cacheKey) meshTriangleCache.delete(k);
      }
      meshTriangleCache.set(cacheKey, tris);
    }
    return tris;
  }
  return null;
}

// Apply node transform to triangles (returns new array; never mutates input)
function transformTriangles(tris: ln.Triangle[], t: TransformParams): ln.Triangle[] {
  if (!hasNonIdentityTransform(t)) {
    // Still need to deep-copy so downstream BVH/fill code doesn't mutate cache
    return tris.map((tr) => new ln.Triangle(
      new ln.Vector(tr.v1.x, tr.v1.y, tr.v1.z),
      new ln.Vector(tr.v2.x, tr.v2.y, tr.v2.z),
      new ln.Vector(tr.v3.x, tr.v3.y, tr.v3.z),
    ));
  }
  const m = buildTransformMatrix(t);
  return tris.map((tr) => new ln.Triangle(
    m.mulPosition(new ln.Vector(tr.v1.x, tr.v1.y, tr.v1.z)),
    m.mulPosition(new ln.Vector(tr.v2.x, tr.v2.y, tr.v2.z)),
    m.mulPosition(new ln.Vector(tr.v3.x, tr.v3.y, tr.v3.z)),
  ));
}

// Stable params hash — JSON stringify with sorted keys for deterministic output
function paramsHash(params: unknown): string {
  return JSON.stringify(params, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) sorted[k] = (v as Record<string, unknown>)[k];
      return sorted;
    }
    return v;
  });
}

// --- Build transform matrix from params ---

function buildTransformMatrix(t: TransformParams): ln.Matrix {
  const deg = Math.PI / 180;
  return ln.identity()
    .scale(new ln.Vector(t.scale[0], t.scale[1], t.scale[2]))
    .rotate(new ln.Vector(1, 0, 0), t.rotate[0] * deg)
    .rotate(new ln.Vector(0, 1, 0), t.rotate[1] * deg)
    .rotate(new ln.Vector(0, 0, 1), t.rotate[2] * deg)
    .translate(new ln.Vector(t.translate[0], t.translate[1], t.translate[2]));
}

function hasNonIdentityTransform(t: TransformParams): boolean {
  return (
    t.translate[0] !== 0 || t.translate[1] !== 0 || t.translate[2] !== 0 ||
    t.rotate[0] !== 0 || t.rotate[1] !== 0 || t.rotate[2] !== 0 ||
    t.scale[0] !== 1 || t.scale[1] !== 1 || t.scale[2] !== 1
  );
}

// --- Create ln.js shape from scene node ---

function createShape(
  node: SceneNode,
  allNodes: SceneNode[],
): ln.ShapeT | null {
  let shape: ln.ShapeT | null = null;

  switch (node.type) {
    case 'cube': {
      const p = node.params as CubeParams;
      shape = new ln.Cube(
        new ln.Vector(p.min[0], p.min[1], p.min[2]),
        new ln.Vector(p.max[0], p.max[1], p.max[2]),
      );
      break;
    }

    case 'sphere': {
      const p = node.params as SphereParams;
      shape = new ln.Sphere(
        new ln.Vector(p.center[0], p.center[1], p.center[2]),
        p.radius,
      );
      break;
    }

    case 'cone': {
      const p = node.params as ConeParams;
      shape = new ln.Cone(p.radius, p.height);
      break;
    }

    case 'cylinder': {
      const p = node.params as CylinderParams;
      shape = new ln.Cylinder(p.radius, p.z0, p.z1);
      break;
    }

    case 'function': {
      const p = node.params as FunctionParams;
      try {
        const fn = new Function('x', 'y', `return ${p.expression}`) as (
          x: number,
          y: number,
        ) => number;
        const box = new ln.Box(
          new ln.Vector(p.bounds.min[0], p.bounds.min[1], p.bounds.min[2]),
          new ln.Vector(p.bounds.max[0], p.bounds.max[1], p.bounds.max[2]),
        );
        const dir = p.direction === 'above' ? ln.Direction.Above : ln.Direction.Below;
        shape = new ln.Function(fn, box, dir);
      } catch {
        console.warn('Invalid function expression:', p.expression);
        return null;
      }
      break;
    }

    case 'mesh': {
      const p = node.params as MeshParams;
      try {
        let triangles = meshTriangleCache.get(node.id);
        if (!triangles) {
          if (p.format === 'obj') {
            const parsed = ln.loadOBJ(p.data);
            triangles = parsed.triangles;
          } else {
            // STL: data is stored as base64-encoded binary
            const binary = atob(p.data);
            const buffer = new ArrayBuffer(binary.length);
            const view = new Uint8Array(buffer);
            for (let i = 0; i < binary.length; i++) {
              view[i] = binary.charCodeAt(i);
            }
            triangles = parseSTL(buffer);
          }
          if (!triangles || triangles.length === 0) {
            console.warn('Mesh has no triangles:', p.fileName);
            return null;
          }
          console.log(`Loaded mesh "${p.fileName}": ${triangles.length} triangles`);
          meshTriangleCache.set(node.id, triangles);
        }
        // Deep copy triangles so in-place transforms don't mutate cache
        const copied = triangles.map(
          (t) =>
            new ln.Triangle(
              new ln.Vector(t.v1.x, t.v1.y, t.v1.z),
              new ln.Vector(t.v2.x, t.v2.y, t.v2.z),
              new ln.Vector(t.v3.x, t.v3.y, t.v3.z),
            ),
        );
        const mesh = new ln.Mesh(copied);
        mesh.fitInside(
          new ln.Box(new ln.Vector(-1.5, -1.5, -1.5), new ln.Vector(1.5, 1.5, 1.5)),
          new ln.Vector(0.5, 0.5, 0.5),
        );
        shape = mesh;
      } catch (e) {
        console.error('Failed to load mesh:', e);
        return null;
      }
      break;
    }

    case 'point-cloud': {
      const p = node.params as PointCloudParams;
      const pts = generatePointCloud(p.pattern, p.count, p.radius, p.gridSpacing);
      const vectors = pts.map((v: Vec3) => new ln.Vector(v[0], v[1], v[2]));
      shape = new PointCloud(vectors, p.pointSize) as unknown as ln.ShapeT;
      break;
    }

    case 'boolean': {
      const p = node.params as BooleanParams;
      const nodeA = allNodes.find((n) => n.id === p.childIds[0]);
      const nodeB = allNodes.find((n) => n.id === p.childIds[1]);
      if (!nodeA || !nodeB) return null;

      const shapeA = createShape(nodeA, allNodes);
      const shapeB = createShape(nodeB, allNodes);
      if (!shapeA || !shapeB) return null;

      const opMap = {
        intersection: ln.CSGOperation.Intersection,
        difference: ln.CSGOperation.Difference,
        union: ln.CSGOperation.Union,
      };
      shape = new ln.BooleanShape(opMap[p.operation], shapeA, shapeB);
      break;
    }

    case 'svg-extrude':
    case 'text-extrude': {
      const p = node.params as SvgExtrudeParams | TextExtrudeParams;
      if (!p.polylines || p.polylines.length === 0) return null;

      const cacheKey = `${node.id}|extrude|${paramsHash({
        polylines: p.polylines,
        extrudeDepth: p.extrudeDepth,
        fitToSize: p.fitToSize,
        centerOnOrigin: p.centerOnOrigin,
      })}`;
      let triangles = meshTriangleCache.get(cacheKey);
      if (!triangles) {
        triangles = extrudeFromParams(p);
        if (!triangles || triangles.length === 0) return null;
        // Drop other cache entries for this node (old extrude params)
        for (const k of meshTriangleCache.keys()) {
          if (k.startsWith(`${node.id}|`) && k !== cacheKey) meshTriangleCache.delete(k);
        }
        meshTriangleCache.set(cacheKey, triangles);
      }
      // Deep-copy triangles so transforms don't mutate cache
      const copied = triangles.map(
        (t) =>
          new ln.Triangle(
            new ln.Vector(t.v1.x, t.v1.y, t.v1.z),
            new ln.Vector(t.v2.x, t.v2.y, t.v2.z),
            new ln.Vector(t.v3.x, t.v3.y, t.v3.z),
          ),
      );
      shape = new ln.Mesh(copied);
      break;
    }

    case 'cube-grid':
      // Handled by createShapes (returns multiple shapes)
      return null;

    case 'line-grid':
      // Handled via extraPaths in renderScene (direct line segments)
      return null;

    case 'plane-grid':
      // Handled by createShapes (returns multiple cubes)
      return null;

    case 'automata-grid':
      // Handled by createShapes (returns multiple cubes)
      return null;
  }

  if (!shape) return null;

  // Apply transform if non-identity
  if (hasNonIdentityTransform(node.transform)) {
    const matrix = buildTransformMatrix(node.transform);
    shape = new ln.TransformedShape(shape, matrix);
  }

  return shape;
}

// --- Create multiple shapes for node types that produce many shapes ---

function getCachedCubes(
  nodeId: string,
  params: unknown,
  generator: () => ln.Cube[],
): ln.Cube[] {
  const hash = paramsHash(params);
  const entry = generatorCache.get(nodeId);
  if (entry && entry.paramsHash === hash && entry.cubes) return entry.cubes;
  const cubes = generator();
  generatorCache.set(nodeId, { paramsHash: hash, cubes });
  return cubes;
}

function createShapes(
  node: SceneNode,
  allNodes: SceneNode[],
): ln.ShapeT[] {
  if (node.type === 'cube-grid') {
    const p = node.params as CubeGridParams;
    const cubes = getCachedCubes(node.id, p, () => generateCubeGrid(p));
    const hasTransform = hasNonIdentityTransform(node.transform);
    const matrix = hasTransform ? buildTransformMatrix(node.transform) : null;

    return cubes.map((cube) => {
      if (matrix) return new ln.TransformedShape(cube, matrix);
      return cube;
    });
  }

  if (node.type === 'plane-grid') {
    const p = node.params as PlaneGridParams;
    const cubes = getCachedCubes(node.id, p, () => generatePlaneGrid(p));
    const hasTransform = hasNonIdentityTransform(node.transform);
    const matrix = hasTransform ? buildTransformMatrix(node.transform) : null;
    return cubes.map((cube) => matrix ? new ln.TransformedShape(cube, matrix) : cube);
  }

  if (node.type === 'automata-grid') {
    const p = node.params as AutomataGridParams;
    const cubes = getCachedCubes(node.id, p, () => generateAutomataGrid(p));
    const hasTransform = hasNonIdentityTransform(node.transform);
    const matrix = hasTransform ? buildTransformMatrix(node.transform) : null;

    return cubes.map((cube) => {
      if (matrix) return new ln.TransformedShape(cube, matrix);
      return cube;
    });
  }

  // Fallback: single shape
  const shape = createShape(node, allNodes);
  return shape ? [shape] : [];
}

// --- Handle slicing ---

function createSlicedPaths(
  node: SceneNode,
  allNodes: SceneNode[],
): ln.Paths {
  const shape = createShape(
    { ...node, slicing: { ...node.slicing, enabled: false } },
    allNodes,
  );
  if (!shape) return [];

  const box = shape.boundingBox();
  const slicing = node.slicing;
  const allPaths: ln.Paths = [];

  const axisMap = { x: 0, y: 1, z: 2 } as const;
  const axisIdx = axisMap[slicing.axis];

  const minVal = axisIdx === 0 ? box.min.x : axisIdx === 1 ? box.min.y : box.min.z;
  const maxVal = axisIdx === 0 ? box.max.x : axisIdx === 1 ? box.max.y : box.max.z;

  const step = (maxVal - minVal) / (slicing.count + 1);

  for (let i = 1; i <= slicing.count; i++) {
    const val = minVal + step * i;
    const point = new ln.Vector(
      axisIdx === 0 ? val : 0,
      axisIdx === 1 ? val : 0,
      axisIdx === 2 ? val : 0,
    );
    const normal = new ln.Vector(
      axisIdx === 0 ? 1 : 0,
      axisIdx === 1 ? 1 : 0,
      axisIdx === 2 ? 1 : 0,
    );
    const plane = new ln.Plane(point, normal);

    // intersectMesh only works on Mesh. Build a temp scene to get paths.
    if (node.type === 'mesh' || node.type === 'svg-extrude' || node.type === 'text-extrude') {
      const meshShape = createShape(
        { ...node, slicing: { ...node.slicing, enabled: false } },
        allNodes,
      );
      if (meshShape) {
        try {
          // Access underlying mesh for plane intersection
          const actualMesh = meshShape instanceof ln.TransformedShape
            ? (meshShape as unknown as { shape: ln.Mesh }).shape
            : meshShape as unknown as ln.Mesh;
          if (actualMesh && typeof actualMesh.triangles !== 'undefined') {
            const slicePaths = plane.intersectMesh(actualMesh);
            allPaths.push(...slicePaths);
          }
        } catch {
          // Fallback: skip this slice
        }
      }
    }
  }

  return allPaths;
}

// --- Generate plane grid (thin 3D rectangles stacked along an axis) ---

function generatePlaneGrid(p: PlaneGridParams): ln.Cube[] {
  const cubes: ln.Cube[] = [];
  const count = p.count;
  const totalSpan = (count - 1) * p.spacing;

  // Simple hash for random
  const hashRand = (a: number, seed: number): number => {
    let h = (a * 374761393 + seed * 904991) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h & 0x7fffffff) / 0x7fffffff;
  };

  for (let i = 0; i < count; i++) {
    const n = count > 1 ? i / (count - 1) : 0.5;
    const stackPos = i * p.spacing - totalSpan * 0.5;

    // Compute size multiplier (0..1) using the chosen method
    let tW = 1; // width multiplier
    let tH = 1; // height multiplier

    const computeT = (offset: number): number => {
      switch (p.sizeMethod) {
        case 'uniform': return 1;
        case 'noise':
          return noise3d(i * (p.noiseScale ?? 0.8) + offset, 0, 0, p.noiseSeed ?? 42);
        case 'random':
          return hashRand(i + offset * 1000, p.noiseSeed ?? 42);
        case 'sine': {
          const freq = (p.sineFreq ?? 2) * Math.PI * 2;
          return (Math.sin(n * freq + offset) + 1) * 0.5;
        }
        case 'radial': {
          // Distance from center of stack
          const d = Math.abs(n - 0.5) * 2;
          return 1 - d;
        }
        case 'gradient':
          return n;
        default:
          return 1;
      }
    };

    tW = Math.max(0, Math.min(1, computeT(0)));
    tH = p.anisotropic ? Math.max(0, Math.min(1, computeT(100))) : tW;

    const w = p.planeWidth * (p.sizeMin + tW * (p.sizeMax - p.sizeMin));
    const h = p.planeHeight * (p.sizeMin + tH * (p.sizeMax - p.sizeMin));
    const hw = w * 0.5;
    const hh = h * 0.5;
    const ht = p.thickness * 0.5;

    // Build the thin box based on stack axis
    let min: ln.Vector, max: ln.Vector;
    switch (p.stackAxis) {
      case 'x':
        min = new ln.Vector(stackPos - ht, -hw, -hh);
        max = new ln.Vector(stackPos + ht, hw, hh);
        break;
      case 'y':
        min = new ln.Vector(-hw, stackPos - ht, -hh);
        max = new ln.Vector(hw, stackPos + ht, hh);
        break;
      case 'z':
      default:
        min = new ln.Vector(-hw, -hh, stackPos - ht);
        max = new ln.Vector(hw, hh, stackPos + ht);
        break;
    }

    cubes.push(new ln.Cube(min, max));
  }

  return cubes;
}

// --- Generate line grid paths in world space ---

// Local-space line-grid paths (no transform applied here so they can be cached
// across camera moves; transform is applied at use-site in renderScene).
function generateLineGridLocalPaths(p: LineGridParams): ln.Paths {
  const paths: ln.Paths = [];

  const cx = p.countX;
  const cy = p.countY;
  const sp = p.spacing;
  const totalX = (cx - 1) * sp;
  const totalY = (cy - 1) * sp;

  // Simple hash for random methods
  const hashRand = (a: number, b: number, seed: number): number => {
    let h = (a * 374761393 + b * 668265263 + seed * 904991) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h & 0x7fffffff) / 0x7fffffff;
  };

  // Helper: compute the noise/method t-value (0..1) for a grid cell
  const computeT = (ix: number, iy: number): number => {
    const method = p.lengthMethod ?? 'uniform';
    if (method === 'uniform') return 0.5;

    const nx = cx > 1 ? ix / (cx - 1) : 0.5;
    const ny = cy > 1 ? iy / (cy - 1) : 0.5;

    switch (method) {
      case 'noise':
        return noise3d(
          ix * (p.lengthNoiseScale ?? 1),
          iy * (p.lengthNoiseScale ?? 1),
          0,
          p.lengthSeed ?? 42,
        );
      case 'random':
        return hashRand(ix, iy, p.lengthSeed ?? 42);
      case 'sine': {
        const freq = (p.lengthSineFreq ?? 2) * Math.PI * 2;
        return (Math.sin(nx * freq) * Math.cos(ny * freq) + 1) * 0.5;
      }
      case 'radial': {
        const dx = nx - 0.5;
        const dy = ny - 0.5;
        return 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      }
      case 'gradient': {
        const axis = p.lengthGradientAxis ?? 'x';
        return axis === 'x' ? nx : ny;
      }
      default:
        return 0.5;
    }
  };

  // Helper: make a point along the line axis at position `v` at grid cell (gx, gy)
  const makeVec = (v: number, gx: number, gy: number): ln.Vector => {
    switch (p.lineAxis) {
      case 'x': return new ln.Vector(v, gx, gy);
      case 'y': return new ln.Vector(gx, v, gy);
      case 'z': default: return new ln.Vector(gx, gy, v);
    }
  };

  const segmented = p.segmented ?? false;

  for (let iy = 0; iy < cy; iy++) {
    for (let ix = 0; ix < cx; ix++) {
      const gx = ix * sp - totalX * 0.5;
      const gy = iy * sp - totalY * 0.5;

      const t = Math.max(0, Math.min(1, computeT(ix, iy)));

      if (segmented) {
        // ============================================================
        // PIN ART MODE
        //
        // Total span is ALWAYS p.lineLength (constant for all lines).
        // The length method drives the first segment length:
        //   seg1 = lengthMin + t * (lengthMax - lengthMin)
        //   gap  = gapSize (fixed)
        //   seg2 = lineLength - seg1 - gap
        //
        // This creates a 3D "pin art" impression: the gap traces a
        // surface while top and bottom segments fill out a constant
        // total height.
        // ============================================================
        const total = p.lineLength;
        const gap = Math.min(p.gapSize ?? 0.3, total * 0.8);
        const maxSeg1 = total - gap - 0.001;

        // First segment driven by the length method
        const lMin = Math.max(0.001, p.lengthMin ?? 0.2);
        const lMax = Math.min(p.lengthMax ?? (total - gap), maxSeg1);
        const seg1Len = Math.max(0.001, Math.min(maxSeg1, lMin + t * (lMax - lMin)));
        const seg2Len = Math.max(0, total - seg1Len - gap);

        const halfTotal = total / 2;
        // Line goes from -halfTotal to +halfTotal
        // Segment 1: -halfTotal to -halfTotal + seg1Len
        // Gap:        -halfTotal + seg1Len  to  -halfTotal + seg1Len + gap
        // Segment 2: -halfTotal + seg1Len + gap  to  +halfTotal

        const seg1Start = -halfTotal;
        const seg1End = -halfTotal + seg1Len;
        const seg2Start = seg1End + gap;
        const seg2End = halfTotal;

        // Emit segment 1
        if (seg1Len > 0.001) {
          const a = makeVec(seg1Start, gx, gy);
          const b = makeVec(seg1End, gx, gy);
          paths.push([a, b]);
        }

        // Emit segment 2
        if (seg2Len > 0.001) {
          const a = makeVec(seg2Start, gx, gy);
          const b = makeVec(seg2End, gx, gy);
          paths.push([a, b]);
        }
      } else {
        // ============================================================
        // NORMAL MODE — length method varies total line length
        // ============================================================
        const method = p.lengthMethod ?? 'uniform';
        let lineLen = p.lineLength;
        if (method !== 'uniform') {
          const lMin = p.lengthMin ?? 0.5;
          const lMax = p.lengthMax ?? p.lineLength;
          lineLen = lMin + t * (lMax - lMin);
        }

        const half = lineLen / 2;
        const a = makeVec(-half, gx, gy);
        const b = makeVec(half, gx, gy);
        paths.push([a, b]);
      }
    }
  }

  return paths;
}

// --- Main render function ---

// Internal render options for multi-pen passes.
interface RenderOptions {
  // Only include fills with this pen number (undefined = all fills)
  penFilter?: number;
  // Wrap main mesh shapes as occluder-only (their silhouettes are not drawn).
  // Used for pen passes 2+ where the main shapes' lines belong to pen 1.
  suppressMainPaths?: boolean;
}

// Wrap a shape so it occludes but contributes no paths of its own.
class OccluderOnly {
  inner: ln.ShapeT;
  constructor(inner: ln.ShapeT) { this.inner = inner; }
  compile(): void {
    const c = (this.inner as { compile?: () => void }).compile;
    if (typeof c === 'function') c.call(this.inner);
  }
  paths(): ln.Paths { return []; }
  boundingBox(): ln.Box { return this.inner.boundingBox(); }
  contains(v: ln.Vector, f: number): boolean { return this.inner.contains(v, f); }
  intersect(r: ln.Ray): typeof ln.NoHit { return this.inner.intersect(r) as typeof ln.NoHit; }
}

export function renderScene(
  nodes: SceneNode[],
  camera: CameraConfig,
  width: number,
  height: number,
  settings: RenderSettings,
  options: RenderOptions = {},
): RenderResult {
  const start = performance.now();
  const scene = new ln.Scene();
  const extraPaths: ln.Paths = [];
  const suppress = options.suppressMainPaths === true;
  const wrap = (sh: ln.ShapeT): ln.ShapeT => (suppress ? (new OccluderOnly(sh) as unknown as ln.ShapeT) : sh);

  // Pre-compute boolean child IDs once (O(N) instead of O(N²) inside the loop)
  const booleanChildIds = new Set<string>();
  for (const n of nodes) {
    if (n.type === 'boolean' && n.visible) {
      const ids = (n.params as BooleanParams).childIds;
      booleanChildIds.add(ids[0]);
      booleanChildIds.add(ids[1]);
    }
  }

  for (const node of nodes) {
    if (!node.visible) continue;
    if (booleanChildIds.has(node.id)) continue;

    // Line grids generate direct paths (not scene shapes).
    // These are "main" paths so they're suppressed in pen passes 2+.
    if (node.type === 'line-grid') {
      if (suppress) continue;
      const lp = node.params as LineGridParams;
      const hash = paramsHash(lp);
      let localPaths: ln.Paths;
      const cached = generatorCache.get(node.id);
      if (cached && cached.paramsHash === hash && cached.paths) {
        localPaths = cached.paths;
      } else {
        localPaths = generateLineGridLocalPaths(lp);
        generatorCache.set(node.id, { paramsHash: hash, paths: localPaths });
      }
      // Apply transform (cached separately so a transform-only change still skips regeneration)
      const matrix = hasNonIdentityTransform(node.transform)
        ? buildTransformMatrix(node.transform)
        : null;
      if (matrix) {
        for (const path of localPaths) {
          const transformed: ln.Vector[] = [];
          for (const v of path) transformed.push(matrix.mulPosition(v));
          extraPaths.push(transformed);
        }
      } else {
        extraPaths.push(...localPaths);
      }
      continue;
    }

    if (node.slicing.enabled && !suppress) {
      const slicePaths = createSlicedPaths(node, nodes);
      extraPaths.push(...slicePaths);
      // Also add the shape for occlusion
    }

    // Use createShapes for types that produce multiple shapes (cube-grid)
    const shapes = createShapes(node, nodes);
    for (const sh of shapes) scene.add(wrap(sh));

    // Fills: generate, wrap in FillShape, add to scene so ln.js handles
    // inter-mesh occlusion automatically.
    if (node.fills && node.fills.length > 0) {
      const hostTris = getHostTriangles(node);
      if (hostTris && hostTris.length > 0) {
        const worldTris = transformTriangles(hostTris, node.transform);
        // Cache host hash (geometry only) — used to detect when fills need
        // regenerating because the host mesh changed.
        const hostHash = `${node.id}|host|${worldTris.length}|${paramsHash({
          tris: worldTris.length,
          t: node.transform,
        })}`;
        let host: ReturnType<typeof buildFillHost> | null = null;
        for (const fill of node.fills) {
          if (!fill.enabled) continue;
          if (options.penFilter !== undefined && fill.pen !== options.penFilter) continue;
          const fillHash = paramsHash(fill);
          const cacheKey = `${node.id}|fill|${fill.id}`;
          let cached = fillCache.get(cacheKey);
          if (!cached || cached.hostHash !== hostHash || cached.fillHash !== fillHash) {
            if (!host) host = buildFillHost(worldTris);
            const paths = generateFillPaths(fill, host);
            cached = { hostHash, fillHash, paths };
            fillCache.set(cacheKey, cached);
          }
          if (cached.paths.length > 0) {
            const aabb = host
              ? host.aabb
              : (() => {
                  // Compute a bbox without building the BVH if we got a cache hit
                  let minX = Infinity, minY = Infinity, minZ = Infinity;
                  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
                  for (const t of worldTris) {
                    minX = Math.min(minX, t.v1.x, t.v2.x, t.v3.x);
                    minY = Math.min(minY, t.v1.y, t.v2.y, t.v3.y);
                    minZ = Math.min(minZ, t.v1.z, t.v2.z, t.v3.z);
                    maxX = Math.max(maxX, t.v1.x, t.v2.x, t.v3.x);
                    maxY = Math.max(maxY, t.v1.y, t.v2.y, t.v3.y);
                    maxZ = Math.max(maxZ, t.v1.z, t.v2.z, t.v3.z);
                  }
                  return { minX, minY, minZ, maxX, maxY, maxZ };
                })();
            scene.add(new FillShape(cached.paths, aabb) as unknown as ln.ShapeT);
          }
        }
      }
    }
  }

  // Apply zoom: >1 = closer (zoomed in), <1 = further (zoomed out)
  const zoom = camera.zoom ?? 1;
  const rawEye: Vec3 = camera.eye;
  const dx = rawEye[0] - camera.center[0];
  const dy = rawEye[1] - camera.center[1];
  const dz = rawEye[2] - camera.center[2];
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const zoomedDist = dist > 0 ? dist / zoom : dist;
  const factor = dist > 0 ? zoomedDist / dist : 1;
  const zoomedEye: Vec3 = [
    camera.center[0] + dx * factor,
    camera.center[1] + dy * factor,
    camera.center[2] + dz * factor,
  ];

  const eye = new ln.Vector(zoomedEye[0], zoomedEye[1], zoomedEye[2]);
  const center = new ln.Vector(camera.center[0], camera.center[1], camera.center[2]);
  const up = new ln.Vector(camera.up[0], camera.up[1], camera.up[2]);

  let paths: ln.Paths;

  if (camera.ortho) {
    const s = (camera.orthoSize ?? 3) / zoom;
    const matrix = ln.lookAt(eye, center, up).orthographic(-s, s, -s, s, settings.near, settings.far);
    paths = scene.renderWithMatrix(matrix, eye, width, height, settings.step);
  } else {
    paths = scene.render(
      eye, center, up,
      width, height,
      camera.fovy,
      settings.near, settings.far,
      settings.step,
    );
  }

  // Combine rendered paths with extra paths (slicing)
  if (extraPaths.length > 0) {
    // Project extra paths using the camera matrix
    const s2 = (camera.orthoSize ?? 3) / zoom;
    const matrix = camera.ortho
      ? ln.lookAt(eye, center, up).orthographic(
          -s2, s2,
          -s2, s2,
          settings.near, settings.far,
        )
      : ln.lookAt(eye, center, up).perspective(
          ln.radians(camera.fovy),
          width / height,
          settings.near,
          settings.far,
        );

    for (const path of extraPaths) {
      const projected: ln.Vector[] = [];
      for (const v of path) {
        const p = matrix.mulPositionW(v);
        // Convert from NDC (-1 to 1) to screen coordinates
        const sx = (p.x + 1) * 0.5 * width;
        const sy = (p.y + 1) * 0.5 * height;
        projected.push(new ln.Vector(sx, sy, 0));
      }
      paths.push(projected);
    }
  }

  const svg = toStyledSVG(paths, width, height, settings);
  const elapsed = performance.now() - start;

  // Prune cache entries for nodes that no longer exist (auto-cleanup; works
  // even though clearMeshCache/clearGeneratorCache from the main thread are
  // no-ops in the worker context where these caches actually live).
  const liveIds = new Set(nodes.map((n) => n.id));
  for (const k of meshTriangleCache.keys()) {
    const nodeId = k.includes('|') ? k.slice(0, k.indexOf('|')) : k;
    if (!liveIds.has(nodeId)) meshTriangleCache.delete(k);
  }
  for (const id of generatorCache.keys()) {
    if (!liveIds.has(id)) generatorCache.delete(id);
  }

  return {
    svg,
    renderTimeMs: elapsed,
    pathCount: paths.length,
  };
}

// --- Custom SVG output with configurable styling ---

function toStyledSVG(
  paths: ln.Paths,
  width: number,
  height: number,
  settings: RenderSettings,
): string {
  const { strokeWidth, strokeColor, backgroundColor } = settings;
  const lines: string[] = [];

  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" ` +
    `style="background:${backgroundColor}">`,
  );
  lines.push(`<g transform="translate(0,${height}) scale(1,-1)">`);
  lines.push(`<g id="pen-1" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none">`);

  for (const path of paths) {
    if (path.length < 2) continue;
    const points = path.map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`).join(' ');
    lines.push(`<polyline points="${points}" />`);
  }

  lines.push('</g></g></svg>');
  return lines.join('\n');
}

// =============================================================================
// Per-pen export — renders the scene once per distinct pen number, producing
// an SVG with `<g id="pen-N">` groups suitable for multi-pen plotters.
// =============================================================================

export interface PenGroup { pen: number; paths: ln.Paths; }

export function renderScenePerPen(
  nodes: SceneNode[],
  camera: CameraConfig,
  width: number,
  height: number,
  settings: RenderSettings,
): { penGroups: PenGroup[]; totalRenderTimeMs: number } {
  const start = performance.now();
  const pens = new Set<number>([1]);
  for (const n of nodes) {
    if (!n.visible) continue;
    for (const f of n.fills ?? []) if (f.enabled) pens.add(f.pen);
  }
  const sortedPens = [...pens].sort((a, b) => a - b);
  const lowestPen = sortedPens[0];
  const penGroups: PenGroup[] = [];
  for (const pen of sortedPens) {
    const result = renderToProjectedPaths(nodes, camera, width, height, settings, {
      penFilter: pen,
      suppressMainPaths: pen !== lowestPen,
    });
    if (result.length > 0) penGroups.push({ pen, paths: result });
  }
  return { penGroups, totalRenderTimeMs: performance.now() - start };
}

// Render to projected (screen-space) paths only — same as renderScene but
// without SVG serialization. Used internally by per-pen rendering.
function renderToProjectedPaths(
  nodes: SceneNode[],
  camera: CameraConfig,
  width: number,
  height: number,
  settings: RenderSettings,
  options: RenderOptions,
): ln.Paths {
  // Parse-back trick is fragile; instead, do the same work as renderScene but
  // returning paths instead of SVG. We use a hidden flag-via-symbol mechanism:
  // simplest is just to call renderScene and re-parse, but better is to expose
  // the path array directly. For now, call a parallel internal path:
  const result = renderScene(nodes, camera, width, height, settings, options);
  return paths2DFromSVG(result.svg);
}

function paths2DFromSVG(svg: string): ln.Paths {
  // Extract polyline points from the styled SVG (we control its shape so this
  // regex match is safe). We don't need to undo the Y-flip — the export wrapper
  // will re-apply the same transform when composing the final multi-pen SVG.
  const out: ln.Paths = [];
  const re = /points="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const path: ln.Vector[] = [];
    const pairs = m[1].trim().split(/\s+/);
    for (const pair of pairs) {
      const [xs, ys] = pair.split(',');
      const x = parseFloat(xs);
      const y = parseFloat(ys);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      path.push(new ln.Vector(x, y, 0));
    }
    if (path.length >= 2) out.push(path);
  }
  return out;
}

// Compose an SVG with multiple <g id="pen-N"> groups from per-pen path lists.
// `penColors` maps pen number → stroke color; falls back to strokeColor.
export function multiPenSvg(
  penGroups: PenGroup[],
  width: number,
  height: number,
  settings: RenderSettings,
  penColors: Record<number, string> = {},
): string {
  const { strokeWidth, strokeColor, backgroundColor } = settings;
  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" style="background:${backgroundColor}">`,
  );
  lines.push(`<g transform="translate(0,${height}) scale(1,-1)">`);
  for (const grp of penGroups) {
    const color = penColors[grp.pen] ?? strokeColor;
    lines.push(
      `<g id="pen-${grp.pen}" stroke="${color}" stroke-width="${strokeWidth}" ` +
      `stroke-linecap="round" stroke-linejoin="round" fill="none">`,
    );
    for (const path of grp.paths) {
      if (path.length < 2) continue;
      const points = path.map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`).join(' ');
      lines.push(`<polyline points="${points}" />`);
    }
    lines.push(`</g>`);
  }
  lines.push('</g></svg>');
  return lines.join('\n');
}
