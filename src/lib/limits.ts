import type {
  CameraConfig,
  RenderSettings,
  SceneNode,
  BooleanParams,
} from './types';
import { compileExpression } from './expression';
export const LIMITS = {
  nodes: 500,
  cells: 50000,
  triangles: 100000,
  paths: 250000,
  vertices: 2000000,
  samples: 2000000,
  inputBytes: 20000000,
  depth: 32,
};
export function bounded(
  value: number,
  label: string,
  min: number,
  max: number,
  integer = false,
) {
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(
      `${label} must be ${integer ? 'an integer ' : ''}between ${min} and ${max}`,
    );
}
export function assertData(
  value: unknown,
  depth = 0,
  budget = { left: LIMITS.vertices, text: LIMITS.inputBytes * 3 },
) {
  if (depth > 40 || --budget.left < 0)
    throw new Error('Scene data exceeds nesting or element budget');
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) || Math.abs(value) > 1e12)
  )
    throw new Error('Scene contains a non-finite or out-of-range number');
  if (typeof value === 'string' && (budget.text -= value.length) < 0)
    throw new Error('Scene text exceeds input budget');
  if (value && typeof value === 'object')
    for (const v of Object.values(value)) assertData(v, depth + 1, budget);
}
export function validateGraph(nodes: SceneNode[]) {
  const map = new Map(nodes.map((n) => [n.id, n]));
  if (map.size !== nodes.length)
    throw new Error('Scene node IDs must be unique');
  const active = new Set<string>();
  const completed = new Map<string, { depth: number; instances: number }>();
  const visit = (id: string): { depth: number; instances: number } => {
    if (active.has(id)) throw new Error('Boolean cycle detected');
    const cached = completed.get(id);
    if (cached) return cached;
    const n = map.get(id);
    if (!n) throw new Error(`Missing Boolean child: ${id}`);
    active.add(id);
    let depth = 0,
      instances = 1;
    if (n.type === 'boolean') {
      const p = n.params as BooleanParams;
      if (
        !['union', 'difference', 'intersection'].includes(p.operation) ||
        !Array.isArray(p.childIds) ||
        p.childIds.length !== 2
      )
        throw new Error('Invalid Boolean operation');
      for (const child of p.childIds) {
        const result = visit(child);
        depth = Math.max(depth, result.depth + 1);
        instances += result.instances;
      }
    }
    if (depth > LIMITS.depth || instances > LIMITS.nodes)
      throw new Error('Boolean recursion or expanded-instance budget exceeded');
    active.delete(id);
    const result = { depth, instances };
    completed.set(id, result);
    return result;
  };
  for (const n of nodes) visit(n.id);
}
export function validateNodes(nodes: SceneNode[]) {
  if (!Array.isArray(nodes)) throw new Error('Scene nodes must be an array');
  bounded(nodes.length, 'Scene nodes', 0, LIMITS.nodes, true);
  assertData(nodes);
  let cells = 0;
  const vector = (v: number[], name: string) => {
    if (!Array.isArray(v) || v.length !== 3)
      throw new Error(`${name} must have three coordinates`);
    v.forEach((x) => bounded(x, name, -10000, 10000));
  };
  for (const n of nodes) {
    if (
      !n ||
      typeof n.id !== 'string' ||
      !/^[\w-]{1,100}$/.test(n.id) ||
      typeof n.name !== 'string' ||
      typeof n.visible !== 'boolean'
    )
      throw new Error('Invalid scene node');
    if (!n.params || !n.transform || !n.slicing)
      throw new Error(`Missing node configuration: ${n.name}`);
    vector(n.transform.translate, 'Translate');
    vector(n.transform.rotate, 'Rotate');
    vector(n.transform.scale, 'Scale');
    n.transform.scale.forEach((x) => {
      if (Math.abs(x) < 0.00001) throw new Error('Scale cannot be zero');
    });
    bounded(n.slicing.count, 'Slice count', 1, 100, true);
    if (!['x', 'y', 'z'].includes(n.slicing.axis))
      throw new Error('Invalid slicing axis');
    if (n.pathVisibility && !['through', 'occluded'].includes(n.pathVisibility))
      throw new Error('Invalid path visibility');
    const p = n.params as unknown as Record<string, number>;
    const formula = n.params as {
      sizeMethod?: string;
      sizeExpression?: string;
      presenceMethod?: string;
      presenceExpression?: string;
    };
    for (const expression of [
      formula.sizeMethod === 'expression' ? formula.sizeExpression : undefined,
      formula.presenceMethod === 'expression'
        ? formula.presenceExpression
        : undefined,
    ]) {
      if (expression !== undefined)
        compileExpression(expression, [
          'x',
          'y',
          'z',
          'ix',
          'iy',
          'iz',
          'nx',
          'ny',
          'nz',
          'size',
        ]);
    }
    const count = (key: string, max = LIMITS.cells) => {
      bounded(p[key], key, 1, max, true);
      return p[key];
    };
    switch (n.type) {
      case 'cube-grid':
        cells +=
          count('countX') *
          count('countY') *
          ((n.params as { dimensions: string }).dimensions === '3d'
            ? count('countZ')
            : 1);
        bounded(p.spacing, 'spacing', 0.001, 1000);
        bounded(p.mengerDepth, 'mengerDepth', 1, 4, true);
        bounded(p.heightmapOctaves, 'heightmapOctaves', 1, 8, true);
        break;
      case 'automata-grid':
        cells +=
          count('gridWidth') * count('gridHeight') * count('generations');
        bounded(p.spacing, 'spacing', 0.001, 1000);
        break;
      case 'line-grid':
        cells += count('countX') * count('countY');
        bounded(p.spacing, 'spacing', 0.001, 1000);
        break;
      case 'plane-grid':
        cells += count('count');
        bounded(p.spacing, 'spacing', 0.001, 1000);
        break;
      case 'point-cloud': {
        bounded(p.radius, 'radius', 0.001, 1000);
        count('count');
        bounded(p.gridSpacing, 'gridSpacing', 0.001, 1000);
        cells +=
          (n.params as { pattern: string }).pattern === 'grid'
            ? (Math.floor((2 * p.radius) / p.gridSpacing) + 1) ** 3
            : p.count;
        break;
      }
      case 'cube': {
        const q = n.params as { min: number[]; max: number[] };
        vector(q.min, 'Cube minimum');
        vector(q.max, 'Cube maximum');
        if (q.min.some((x, i) => x >= q.max[i]))
          throw new Error('Cube bounds must have positive volume');
        break;
      }
      case 'sphere':
        vector((n.params as { center: number[] }).center, 'Sphere center');
        bounded(p.radius, 'radius', 0.001, 1000);
        break;
      case 'cone':
        bounded(p.radius, 'radius', 0.001, 1000);
        bounded(p.height, 'height', 0.001, 1000);
        break;
      case 'cylinder':
        bounded(p.radius, 'radius', 0.001, 1000);
        if (p.z1 <= p.z0) throw new Error('Cylinder bounds must be increasing');
        break;
      case 'function': {
        const q = n.params as {
          expression: string;
          bounds: { min: number[]; max: number[] };
        };
        vector(q.bounds.min, 'Function bounds');
        vector(q.bounds.max, 'Function bounds');
        if (q.bounds.min.some((x, i) => x >= q.bounds.max[i]))
          throw new Error('Function bounds must be increasing');
        if (q.bounds.max.some((x, i) => x - q.bounds.min[i] > 20))
          throw new Error('Function span exceeds 20 units');
        compileExpression(q.expression, ['x', 'y']);
        break;
      }
      case 'mesh': {
        const q = n.params as { data: string; format: string };
        if (
          !['obj', 'stl'].includes(q.format) ||
          typeof q.data !== 'string' ||
          q.data.length > LIMITS.inputBytes * 1.4
        )
          throw new Error('Invalid or oversized mesh');
        break;
      }
      case 'svg-extrude':
      case 'text-extrude':
        bounded(p.fitToSize, 'fitToSize', 0.001, 1000);
        bounded(p.extrudeDepth, 'extrudeDepth', 0.001, 1000);
        break;
      case 'boolean':
        break;
      default:
        throw new Error(`Unknown shape type: ${n.type}`);
    }
    const lines = (n.params as { polylines?: number[][][] }).polylines;
    if (lines) {
      if (!Array.isArray(lines) || lines.length > 5000)
        throw new Error('Polyline count exceeds 5000');
      let vertices = 0;
      for (const line of lines) {
        if (!Array.isArray(line)) throw new Error('Invalid polyline');
        vertices += line.length;
        for (const point of line)
          if (
            !Array.isArray(point) ||
            point.length !== 2 ||
            !point.every(Number.isFinite)
          )
            throw new Error('Invalid polyline point');
      }
      if (vertices > LIMITS.triangles / 4)
        throw new Error('Input contour vertex budget exceeded');
    }
    if ((n.fills?.length ?? 0) > 32)
      throw new Error('Fill count exceeds 32 per object');
    for (const fill of n.fills ?? []) {
      bounded(fill.spacing, 'Fill spacing', 0.005, 1000);
      bounded(fill.density, 'Fill density', 1, 10000);
      bounded(fill.dotSize, 'Dot size', 0.001, 100);
      bounded(fill.count, 'Contour count', 1, 100, true);
      bounded(fill.pen, 'Pen', 1, 8, true);
      if (
        !['cross-hatch', 'surface-hatch', 'stipple', 'contour'].includes(
          fill.type,
        )
      )
        throw new Error('Unknown fill type');
    }
  }
  bounded(cells, 'Generated cells', 0, LIMITS.cells, true);
  validateGraph(nodes);
}
export function validateView(
  camera: CameraConfig,
  width: number,
  height: number,
  settings: RenderSettings,
) {
  assertData({ camera, settings });
  bounded(width, 'Width', 1, 10000);
  bounded(height, 'Height', 1, 10000);
  bounded(settings.step, 'Render step', 0.001, 10);
  bounded(settings.near, 'Near plane', 0.0001, 10000);
  bounded(settings.far, 'Far plane', settings.near + 0.0001, 100000);
  bounded(settings.strokeWidth, 'Stroke width', 0.001, 100);
  for (const color of [settings.strokeColor, settings.backgroundColor])
    if (!/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(color))
      throw new Error('Colors must be hex RGB');
  bounded(camera.zoom ?? 1, 'Zoom', 0.01, 50);
  bounded(camera.orthoSize ?? 3, 'Orthographic size', 0.01, 10000);
  bounded(camera.fovy, 'Field of view', 1, 179);
  if (
    ![camera.eye, camera.center, camera.up].every(
      (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite),
    )
  )
    throw new Error('Invalid camera vectors');
  const d = camera.eye.map((v, i) => v - camera.center[i]),
    u = camera.up;
  if (
    Math.hypot(...d) < 1e-6 ||
    Math.hypot(
      d[1] * u[2] - d[2] * u[1],
      d[2] * u[0] - d[0] * u[2],
      d[0] * u[1] - d[1] * u[0],
    ) < 1e-6
  )
    throw new Error('Camera eye and up must define a view');
}
export function assertPaths(paths: { x: number; y: number; z: number }[][]) {
  bounded(paths.length, 'Path count', 0, LIMITS.paths, true);
  let vertices = 0;
  for (const path of paths) {
    vertices += path.length;
    if (vertices > LIMITS.vertices) throw new Error('Vertex budget exceeded');
    for (const v of path)
      if (![v.x, v.y, v.z].every(Number.isFinite))
        throw new Error('Geometry contains non-finite coordinates');
  }
}
