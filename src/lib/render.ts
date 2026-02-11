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

// =============================================================================
// Render Engine: SceneNode[] -> ln.js Scene -> SVG
// =============================================================================

// Cache parsed mesh triangle data to avoid re-parsing OBJ/STL on every render
const meshTriangleCache = new Map<string, ln.Triangle[]>();

export function clearMeshCache(nodeId?: string) {
  if (nodeId) meshTriangleCache.delete(nodeId);
  else meshTriangleCache.clear();
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
      const pts = p.pattern === 'custom'
        ? p.points
        : generatePointCloud(p.pattern, p.count, p.radius, p.gridSpacing);
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

function createShapes(
  node: SceneNode,
  allNodes: SceneNode[],
): ln.ShapeT[] {
  if (node.type === 'cube-grid') {
    const p = node.params as CubeGridParams;
    const cubes = generateCubeGrid(p);
    const hasTransform = hasNonIdentityTransform(node.transform);
    const matrix = hasTransform ? buildTransformMatrix(node.transform) : null;

    return cubes.map((cube) => {
      if (matrix) return new ln.TransformedShape(cube, matrix);
      return cube;
    });
  }

  if (node.type === 'plane-grid') {
    const p = node.params as PlaneGridParams;
    const cubes = generatePlaneGrid(p);
    const hasTransform = hasNonIdentityTransform(node.transform);
    const matrix = hasTransform ? buildTransformMatrix(node.transform) : null;
    return cubes.map((cube) => matrix ? new ln.TransformedShape(cube, matrix) : cube);
  }

  if (node.type === 'automata-grid') {
    const p = node.params as AutomataGridParams;
    const cubes = generateAutomataGrid(p);
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
    if (node.type === 'mesh') {
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

function generateLineGridPaths(node: SceneNode): ln.Paths {
  const p = node.params as LineGridParams;
  const paths: ln.Paths = [];

  const cx = p.countX;
  const cy = p.countY;
  const sp = p.spacing;
  const totalX = (cx - 1) * sp;
  const totalY = (cy - 1) * sp;

  const hasTransform = hasNonIdentityTransform(node.transform);
  const matrix = hasTransform ? buildTransformMatrix(node.transform) : null;

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
          let a = makeVec(seg1Start, gx, gy);
          let b = makeVec(seg1End, gx, gy);
          if (matrix) { a = matrix.mulPosition(a); b = matrix.mulPosition(b); }
          paths.push([a, b]);
        }

        // Emit segment 2
        if (seg2Len > 0.001) {
          let a = makeVec(seg2Start, gx, gy);
          let b = makeVec(seg2End, gx, gy);
          if (matrix) { a = matrix.mulPosition(a); b = matrix.mulPosition(b); }
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
        let a = makeVec(-half, gx, gy);
        let b = makeVec(half, gx, gy);
        if (matrix) { a = matrix.mulPosition(a); b = matrix.mulPosition(b); }
        paths.push([a, b]);
      }
    }
  }

  return paths;
}

// --- Main render function ---

export function renderScene(
  nodes: SceneNode[],
  camera: CameraConfig,
  width: number,
  height: number,
  settings: RenderSettings,
): RenderResult {
  const start = performance.now();
  const scene = new ln.Scene();
  const extraPaths: ln.Paths = [];

  for (const node of nodes) {
    if (!node.visible) continue;

    // Boolean child nodes are rendered via their parent boolean node
    const isBooleanChild = nodes.some(
      (n) =>
        n.type === 'boolean' &&
        n.visible &&
        (n.params as BooleanParams).childIds.includes(node.id),
    );
    if (isBooleanChild) continue;

    // Line grids generate direct paths (not scene shapes)
    if (node.type === 'line-grid') {
      const linePaths = generateLineGridPaths(node);
      extraPaths.push(...linePaths);
      continue;
    }

    if (node.slicing.enabled) {
      const slicePaths = createSlicedPaths(node, nodes);
      extraPaths.push(...slicePaths);
      // Also add the shape for occlusion
    }

    // Use createShapes for types that produce multiple shapes (cube-grid)
    const shapes = createShapes(node, nodes);
    for (const sh of shapes) scene.add(sh);
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

  for (const path of paths) {
    if (path.length < 2) continue;
    const points = path.map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`).join(' ');
    lines.push(
      `<polyline stroke="${strokeColor}" fill="none" ` +
      `stroke-width="${strokeWidth}" stroke-linecap="round" ` +
      `stroke-linejoin="round" points="${points}" />`,
    );
  }

  lines.push('</g></svg>');
  return lines.join('\n');
}
