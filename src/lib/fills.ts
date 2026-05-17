import * as ln from '@lnjs/core';
import PoissonDiskSampling from 'poisson-disk-sampling';
import { BVH, buildBVHFromTriangles } from './bvh';
import type { FillConfig } from './types';

// =============================================================================
// Universal Fill engine.
//
// Given a host mesh (triangles) and a FillConfig, produce ln.Paths in world
// space. These are wrapped in a `FillShape` (custom ln.ShapeT) and added to
// the scene so ln.js's hidden-line removal handles inter-mesh occlusion for
// free — the same trick PointCloud uses.
// =============================================================================

interface AABB { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number; }

interface FillHost {
  triangles: ln.Triangle[];
  bvh: BVH;
  aabb: AABB;
}

export function buildFillHost(triangles: ln.Triangle[]): FillHost {
  const bvh = buildBVHFromTriangles(triangles);
  return { triangles, bvh, aabb: bvh.bbox() };
}

// Generate fill paths in world space.
export function generateFillPaths(fill: FillConfig, host: FillHost): ln.Paths {
  if (!fill.enabled) return [];
  switch (fill.type) {
    case 'cross-hatch':   return crossHatch(fill, host);
    case 'surface-hatch': return surfaceHatch(fill, host);
    case 'stipple':       return stipple(fill, host);
    case 'contour':       return contour(fill, host);
  }
}

// ---------- Cross-hatch (volumetric, along one or more axes) ----------

function crossHatch(fill: FillConfig, host: FillHost): ln.Paths {
  const axes = fill.crossHatchAxes && fill.crossHatchAxes.length > 0
    ? fill.crossHatchAxes
    : [fill.axis];
  const paths: ln.Paths = [];
  for (const axis of axes) paths.push(...rayCrossHatch(host, axis, fill.spacing));
  return paths;
}

function rayCrossHatch(host: FillHost, axis: 'x' | 'y' | 'z', spacing: number): ln.Paths {
  const a = host.aabb;
  // Slight inset so rays start clearly outside mesh
  const eps = 1e-3;
  const result: ln.Paths = [];

  // Define which two axes form the orthogonal sampling plane, and the ray axis.
  let uMin: number, uMax: number, vMin: number, vMax: number, wMin: number, wMax: number;
  let makeOrigin: (u: number, v: number) => { x: number; y: number; z: number };
  let dir: { x: number; y: number; z: number };
  let endpoint: (u: number, v: number, w: number) => ln.Vector;
  if (axis === 'z') {
    uMin = a.minX; uMax = a.maxX; vMin = a.minY; vMax = a.maxY; wMin = a.minZ - eps; wMax = a.maxZ + eps;
    makeOrigin = (u, v) => ({ x: u, y: v, z: wMin });
    dir = { x: 0, y: 0, z: 1 };
    endpoint = (u, v, w) => new ln.Vector(u, v, w);
  } else if (axis === 'y') {
    uMin = a.minX; uMax = a.maxX; vMin = a.minZ; vMax = a.maxZ; wMin = a.minY - eps; wMax = a.maxY + eps;
    makeOrigin = (u, v) => ({ x: u, y: wMin, z: v });
    dir = { x: 0, y: 1, z: 0 };
    endpoint = (u, v, w) => new ln.Vector(u, w, v);
  } else {
    uMin = a.minY; uMax = a.maxY; vMin = a.minZ; vMax = a.maxZ; wMin = a.minX - eps; wMax = a.maxX + eps;
    makeOrigin = (u, v) => ({ x: wMin, y: u, z: v });
    dir = { x: 1, y: 0, z: 0 };
    endpoint = (u, v, w) => new ln.Vector(w, u, v);
  }

  const sx = Math.max(spacing, 1e-3);
  for (let u = uMin + sx * 0.5; u <= uMax; u += sx) {
    for (let v = vMin + sx * 0.5; v <= vMax; v += sx) {
      const origin = makeOrigin(u, v);
      const hits = host.bvh.intersect(origin, dir, 0, wMax - wMin);
      // Pair consecutive hits as enter/exit
      for (let i = 0; i + 1 < hits.length; i += 2) {
        const t1 = hits[i].t, t2 = hits[i + 1].t;
        if (t2 - t1 < 1e-4) continue;
        const w1 = wMin + t1;
        const w2 = wMin + t2;
        result.push([endpoint(u, v, w1), endpoint(u, v, w2)]);
      }
    }
  }
  return result;
}

// ---------- Surface hatch (face-aligned parallel lines on each triangle) ----------

function surfaceHatch(fill: FillConfig, host: FillHost): ln.Paths {
  const result: ln.Paths = [];
  const spacing = Math.max(fill.spacing, 1e-3);
  const angle = (fill.angleDeg * Math.PI) / 180;

  for (const t of host.triangles) {
    // Triangle normal
    const e1x = t.v2.x - t.v1.x, e1y = t.v2.y - t.v1.y, e1z = t.v2.z - t.v1.z;
    const e2x = t.v3.x - t.v1.x, e2y = t.v3.y - t.v1.y, e2z = t.v3.z - t.v1.z;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nLen < 1e-9) continue;
    nx /= nLen; ny /= nLen; nz /= nLen;

    // Build an in-plane basis (u, v) orthonormal to n. Pick u as the longer
    // projection of world X or Y onto the plane to be predictable.
    let ux: number, uy: number, uz: number;
    if (Math.abs(nx) < 0.9) {
      // u = normalize(X - (X·n)*n)
      ux = 1 - nx * nx; uy = -nx * ny; uz = -nx * nz;
    } else {
      ux = -ny * nx; uy = 1 - ny * ny; uz = -ny * nz;
    }
    const ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
    if (ul < 1e-9) continue;
    ux /= ul; uy /= ul; uz /= ul;
    // v = n × u
    const vx = ny * uz - nz * uy;
    const vy = nz * ux - nx * uz;
    const vz = nx * uy - ny * ux;

    // Rotate (u, v) by `angle` around n
    const cs = Math.cos(angle), sn = Math.sin(angle);
    const ux2 = ux * cs + vx * sn, uy2 = uy * cs + vy * sn, uz2 = uz * cs + vz * sn;
    const vx2 = -ux * sn + vx * cs, vy2 = -uy * sn + vy * cs, vz2 = -uz * sn + vz * cs;

    // Project triangle vertices onto (u, v)
    const proj = (px: number, py: number, pz: number): [number, number] => {
      const dx = px - t.v1.x, dy = py - t.v1.y, dz = pz - t.v1.z;
      return [
        dx * ux2 + dy * uy2 + dz * uz2,
        dx * vx2 + dy * vy2 + dz * vz2,
      ];
    };
    const A = proj(t.v1.x, t.v1.y, t.v1.z);
    const B = proj(t.v2.x, t.v2.y, t.v2.z);
    const C = proj(t.v3.x, t.v3.y, t.v3.z);

    // Lines are vertical in (u, v) space: u = const. We need u range.
    const minU = Math.min(A[0], B[0], C[0]);
    const maxU = Math.max(A[0], B[0], C[0]);
    const minV = Math.min(A[1], B[1], C[1]);
    const maxV = Math.max(A[1], B[1], C[1]);

    // Triangle edges as (v = f(u)) lines for clipping
    const edges: Array<{ p: [number, number]; q: [number, number] }> = [
      { p: A, q: B }, { p: B, q: C }, { p: C, q: A },
    ];

    for (let u = Math.ceil(minU / spacing) * spacing; u <= maxU; u += spacing) {
      // Find intersections of vertical line u=const with triangle edges
      const vs: number[] = [];
      for (const e of edges) {
        const [px, pv] = e.p; const [qx, qv] = e.q;
        if (px === qx) continue;
        const tt = (u - px) / (qx - px);
        if (tt < -1e-6 || tt > 1 + 1e-6) continue;
        vs.push(pv + tt * (qv - pv));
      }
      if (vs.length < 2) continue;
      vs.sort((a, b) => a - b);
      const v0 = vs[0], v1 = vs[vs.length - 1];
      if (v1 - v0 < 1e-4) continue;
      if (v0 > maxV + 1e-6 || v1 < minV - 1e-6) continue;

      // Convert back to world
      const ax = t.v1.x + ux2 * u + vx2 * v0;
      const ay = t.v1.y + uy2 * u + vy2 * v0;
      const az = t.v1.z + uz2 * u + vz2 * v0;
      const bx = t.v1.x + ux2 * u + vx2 * v1;
      const by = t.v1.y + uy2 * u + vy2 * v1;
      const bz = t.v1.z + uz2 * u + vz2 * v1;
      result.push([new ln.Vector(ax, ay, az), new ln.Vector(bx, by, bz)]);
    }
  }
  return result;
}

// ---------- Stipple (Poisson disc sampling) ----------

function stipple(fill: FillConfig, host: FillHost): ln.Paths {
  const result: ln.Paths = [];
  const a = host.aabb;
  const w = a.maxX - a.minX, h = a.maxY - a.minY, d = a.maxZ - a.minZ;
  if (w < 1e-6 || h < 1e-6 || d < 1e-6) return result;

  // density: target points per cubic world unit (heuristic).
  // minDistance: derived from density so denser → tighter packing.
  const target = Math.max(1, fill.density);
  const volume = w * h * d;
  const targetCount = Math.floor(target * (fill.surfaceMode ? Math.sqrt(volume) : volume) * 0.5);
  const minDist = Math.max(
    fill.dotSize * 1.5,
    fill.surfaceMode
      ? Math.pow(volume / Math.max(1, targetCount), 1 / 2)
      : Math.pow(volume / Math.max(1, targetCount), 1 / 3),
  );

  let candidates: Array<[number, number, number]> = [];
  try {
    const sampler = new PoissonDiskSampling({
      shape: [w, h, d],
      minDistance: minDist,
      maxDistance: minDist * 2,
      tries: 8,
    });
    const points = sampler.fill();
    for (const p of points) {
      candidates.push([a.minX + p[0], a.minY + p[1], a.minZ + p[2]]);
    }
  } catch {
    // Fall back to a coarse grid if Poisson fails
    candidates = [];
    for (let z = a.minZ; z <= a.maxZ; z += minDist)
      for (let y = a.minY; y <= a.maxY; y += minDist)
        for (let x = a.minX; x <= a.maxX; x += minDist)
          candidates.push([x, y, z]);
  }

  const accept = (x: number, y: number, z: number): boolean => {
    if (fill.surfaceMode) {
      // Surface mode: keep points near the mesh (within ~spacing of a triangle).
      // Approximate: ray-cast inward from outside the bbox; keep if very close.
      // Cheap heuristic — inside-test instead, and keep boundary points using
      // a tiny offset test. For v1, just keep all interior points and call it.
      return host.bvh.containsPoint({ x, y, z });
    }
    return host.bvh.containsPoint({ x, y, z });
  };

  const s = fill.dotSize;
  for (const [x, y, z] of candidates) {
    if (!accept(x, y, z)) continue;
    // 3-axis cross
    result.push([new ln.Vector(x - s, y, z), new ln.Vector(x + s, y, z)]);
    result.push([new ln.Vector(x, y - s, z), new ln.Vector(x, y + s, z)]);
    result.push([new ln.Vector(x, y, z - s), new ln.Vector(x, y, z + s)]);
  }
  return result;
}

// ---------- Contour (plane-mesh intersection at evenly spaced planes) ----------

function contour(fill: FillConfig, host: FillHost): ln.Paths {
  const a = host.aabb;
  const result: ln.Paths = [];
  const mesh = new ln.Mesh(host.triangles);

  const axisIdx = fill.axis === 'x' ? 0 : fill.axis === 'y' ? 1 : 2;
  const lo = axisIdx === 0 ? a.minX : axisIdx === 1 ? a.minY : a.minZ;
  const hi = axisIdx === 0 ? a.maxX : axisIdx === 1 ? a.maxY : a.maxZ;
  const count = Math.max(1, Math.floor(fill.count));
  const step = (hi - lo) / (count + 1);
  for (let i = 1; i <= count; i++) {
    const v = lo + step * i;
    const point = new ln.Vector(
      axisIdx === 0 ? v : 0,
      axisIdx === 1 ? v : 0,
      axisIdx === 2 ? v : 0,
    );
    const normal = new ln.Vector(
      axisIdx === 0 ? 1 : 0,
      axisIdx === 1 ? 1 : 0,
      axisIdx === 2 ? 1 : 0,
    );
    const plane = new ln.Plane(point, normal);
    try {
      const slicePaths = plane.intersectMesh(mesh);
      result.push(...slicePaths);
    } catch { /* skip bad slices */ }
  }
  return result;
}

// =============================================================================
// FillShape — custom ln.ShapeT that emits fill paths without occluding others
// =============================================================================

export class FillShape {
  paths_: ln.Paths;
  box: ln.Box;

  constructor(paths: ln.Paths, aabb: AABB) {
    this.paths_ = paths;
    this.box = new ln.Box(
      new ln.Vector(aabb.minX, aabb.minY, aabb.minZ),
      new ln.Vector(aabb.maxX, aabb.maxY, aabb.maxZ),
    );
  }

  compile(): void {
    // No acceleration structure needed
  }

  boundingBox(): ln.Box {
    return this.box;
  }

  contains(_v: ln.Vector, _f: number): boolean {
    void _v; void _f;
    return false; // Fills don't occlude other shapes
  }

  intersect(_r: ln.Ray): typeof ln.NoHit {
    void _r;
    return ln.NoHit;
  }

  paths(): ln.Paths {
    return this.paths_;
  }
}
