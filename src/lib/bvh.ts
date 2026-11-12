import * as ln from '@lnjs/core';

// =============================================================================
// Tiny BVH for triangle meshes.
//
// Built once per mesh; used for inside-tests (volume sampling), ray-AABB
// pruning, and ray-triangle hit queries for fill-line clipping against the
// rest of the scene.
//
// Construction: median split on the longest axis (no SAH — keeps it small).
// Good enough for the few thousand triangles per mesh we deal with here.
// =============================================================================

export interface BVHTriangle {
  v1: { x: number; y: number; z: number };
  v2: { x: number; y: number; z: number };
  v3: { x: number; y: number; z: number };
}

interface AABB {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

interface BVHNode {
  aabb: AABB;
  left: BVHNode | null;
  right: BVHNode | null;
  triIdx: number[]; // populated only on leaves
}

const LEAF_THRESHOLD = 8;

export class BVH {
  triangles: ln.Triangle[];
  private root: BVHNode;

  constructor(triangles: BVHTriangle[]) {
    this.triangles = triangles.map((t) =>
      t instanceof ln.Triangle
        ? t
        : new ln.Triangle(
            new ln.Vector(t.v1.x, t.v1.y, t.v1.z),
            new ln.Vector(t.v2.x, t.v2.y, t.v2.z),
            new ln.Vector(t.v3.x, t.v3.y, t.v3.z),
          ),
    );
    const indices = triangles.map((_, i) => i);
    this.root = build(triangles, indices);
  }

  // World-space ray cast. Returns sorted hits {t, triIdx} along the ray,
  // for t in (tMin, tMax). Returns empty array if no hits.
  intersect(
    origin: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    tMin?: number,
    tMax = Infinity,
  ): { t: number; triIdx: number }[] {
    const out: { t: number; triIdx: number }[] = [];
    const ray = new ln.Ray(
      new ln.Vector(origin.x, origin.y, origin.z),
      new ln.Vector(dir.x, dir.y, dir.z),
    );
    traverse(
      this.root,
      this.triangles,
      ray,
      tMin ?? ln.rayEpsilon(ray),
      tMax,
      out,
    );
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  // Merge coincident hits on triangulated faces. Raw intersect() retains
  // individual triangle IDs for callers that need them.
  crossings(
    ...args: Parameters<BVH['intersect']>
  ): { t: number; triIdx: number }[] {
    const hits = this.intersect(...args);
    return hits.filter(
      (hit, i) =>
        i === 0 ||
        hit.t - hits[i - 1].t >
          32 *
            Number.EPSILON *
            Math.max(1, Math.abs(hit.t), Math.abs(hits[i - 1].t)),
    );
  }

  // Assumes a closed manifold; boundary/tangent points are not classified.
  containsPoint(point: { x: number; y: number; z: number }): boolean {
    return this.crossings(point, { x: 1, y: 0, z: 0 }).length % 2 === 1;
  }

  bbox(): AABB {
    return this.root.aabb;
  }
}

function aabbForTri(t: BVHTriangle): AABB {
  return {
    minX: Math.min(t.v1.x, t.v2.x, t.v3.x),
    minY: Math.min(t.v1.y, t.v2.y, t.v3.y),
    minZ: Math.min(t.v1.z, t.v2.z, t.v3.z),
    maxX: Math.max(t.v1.x, t.v2.x, t.v3.x),
    maxY: Math.max(t.v1.y, t.v2.y, t.v3.y),
    maxZ: Math.max(t.v1.z, t.v2.z, t.v3.z),
  };
}

function mergeAABB(a: AABB, b: AABB): AABB {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    minZ: Math.min(a.minZ, b.minZ),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

function build(triangles: BVHTriangle[], indices: number[]): BVHNode {
  let aabb: AABB | null = null;
  for (const i of indices) {
    const a = aabbForTri(triangles[i]);
    aabb = aabb ? mergeAABB(aabb, a) : a;
  }
  if (!aabb) aabb = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };

  if (indices.length <= LEAF_THRESHOLD) {
    return { aabb, left: null, right: null, triIdx: indices };
  }

  // Longest-axis median split
  const ex = aabb.maxX - aabb.minX;
  const ey = aabb.maxY - aabb.minY;
  const ez = aabb.maxZ - aabb.minZ;
  const axis = ex > ey && ex > ez ? 0 : ey > ez ? 1 : 2;
  const centroid = (i: number) => {
    const t = triangles[i];
    if (axis === 0) return (t.v1.x + t.v2.x + t.v3.x) / 3;
    if (axis === 1) return (t.v1.y + t.v2.y + t.v3.y) / 3;
    return (t.v1.z + t.v2.z + t.v3.z) / 3;
  };
  indices.sort((a, b) => centroid(a) - centroid(b));
  const mid = indices.length >> 1;
  const leftIdx = indices.slice(0, mid);
  const rightIdx = indices.slice(mid);
  return {
    aabb,
    left: build(triangles, leftIdx),
    right: build(triangles, rightIdx),
    triIdx: [],
  };
}

// Ray-AABB slab test. Returns [tEnter, tExit] or null.
function rayAABB(
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  aabb: AABB,
  tMin: number,
  tMax: number,
): [number, number] | null {
  for (const axis of ['x', 'y', 'z'] as const) {
    const lo = axis === 'x' ? aabb.minX : axis === 'y' ? aabb.minY : aabb.minZ;
    const hi = axis === 'x' ? aabb.maxX : axis === 'y' ? aabb.maxY : aabb.maxZ;
    if (dir[axis] === 0) {
      if (origin[axis] < lo || origin[axis] > hi) return null;
      continue; // Avoid 0/0 when a parallel ray lies on a slab boundary.
    }
    let enter = (lo - origin[axis]) / dir[axis];
    let leave = (hi - origin[axis]) / dir[axis];
    if (enter > leave) [enter, leave] = [leave, enter];
    tMin = Math.max(tMin, enter);
    tMax = Math.min(tMax, leave);
    if (tMin > tMax) return null;
  }
  return [tMin, tMax];
}

// Share the fork's watertight triangle kernel with rendering. Containment and
// surface sampling must not silently apply a different minimum feature size.
function traverse(
  node: BVHNode,
  triangles: ln.Triangle[],
  ray: ln.Ray,
  tMin: number,
  tMax: number,
  out: { t: number; triIdx: number }[],
) {
  const slab = rayAABB(ray.origin, ray.direction, node.aabb, tMin, tMax);
  if (!slab) return;
  if (node.left === null && node.right === null) {
    for (const i of node.triIdx) {
      const hit = triangles[i].intersect(ray, tMin, tMax);
      if (hit.ok()) out.push({ t: hit.t, triIdx: i });
    }
    return;
  }
  if (node.left) traverse(node.left, triangles, ray, tMin, tMax, out);
  if (node.right) traverse(node.right, triangles, ray, tMin, tMax, out);
}

// Convenience: build BVH from ln.Triangle[]
export function buildBVHFromTriangles(triangles: ln.Triangle[]): BVH {
  // ln.Triangle has v1/v2/v3 with x/y/z — same shape as BVHTriangle
  return new BVH(triangles as unknown as BVHTriangle[]);
}
