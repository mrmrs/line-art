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
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

interface BVHNode {
  aabb: AABB;
  left: BVHNode | null;
  right: BVHNode | null;
  triIdx: number[];          // populated only on leaves
}

const LEAF_THRESHOLD = 8;

export class BVH {
  triangles: BVHTriangle[];
  private root: BVHNode;

  constructor(triangles: BVHTriangle[]) {
    this.triangles = triangles;
    const indices = triangles.map((_, i) => i);
    this.root = build(triangles, indices);
  }

  // World-space ray cast. Returns sorted hits {t, triIdx} along the ray,
  // for t in (tMin, tMax). Returns empty array if no hits.
  intersect(
    origin: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    tMin = 1e-4,
    tMax = 1e9,
  ): { t: number; triIdx: number }[] {
    const out: { t: number; triIdx: number }[] = [];
    traverse(this.root, this.triangles, origin, dir, tMin, tMax, out);
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  // True if `point` is inside the mesh (assumes closed/manifold).
  // Counts ray crossings along +X.
  containsPoint(point: { x: number; y: number; z: number }): boolean {
    const hits = this.intersect(point, { x: 1, y: 0, z: 0 });
    return hits.length % 2 === 1;
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
  let txMin = (aabb.minX - origin.x) / dir.x;
  let txMax = (aabb.maxX - origin.x) / dir.x;
  if (txMin > txMax) [txMin, txMax] = [txMax, txMin];
  let tyMin = (aabb.minY - origin.y) / dir.y;
  let tyMax = (aabb.maxY - origin.y) / dir.y;
  if (tyMin > tyMax) [tyMin, tyMax] = [tyMax, tyMin];
  if (txMin > tyMax || tyMin > txMax) return null;
  if (tyMin > txMin) txMin = tyMin;
  if (tyMax < txMax) txMax = tyMax;
  let tzMin = (aabb.minZ - origin.z) / dir.z;
  let tzMax = (aabb.maxZ - origin.z) / dir.z;
  if (tzMin > tzMax) [tzMin, tzMax] = [tzMax, tzMin];
  if (txMin > tzMax || tzMin > txMax) return null;
  if (tzMin > txMin) txMin = tzMin;
  if (tzMax < txMax) txMax = tzMax;
  if (txMax < tMin || txMin > tMax) return null;
  return [Math.max(txMin, tMin), Math.min(txMax, tMax)];
}

// Möller-Trumbore ray-triangle intersection
function rayTri(
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  t: BVHTriangle,
): number | null {
  const EPS = 1e-8;
  const e1x = t.v2.x - t.v1.x, e1y = t.v2.y - t.v1.y, e1z = t.v2.z - t.v1.z;
  const e2x = t.v3.x - t.v1.x, e2y = t.v3.y - t.v1.y, e2z = t.v3.z - t.v1.z;
  // h = dir × e2
  const hx = dir.y * e2z - dir.z * e2y;
  const hy = dir.z * e2x - dir.x * e2z;
  const hz = dir.x * e2y - dir.y * e2x;
  const a = e1x * hx + e1y * hy + e1z * hz;
  if (a > -EPS && a < EPS) return null;
  const f = 1 / a;
  const sx = origin.x - t.v1.x, sy = origin.y - t.v1.y, sz = origin.z - t.v1.z;
  const u = f * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return null;
  // q = s × e1
  const qx = sy * e1z - sz * e1y;
  const qy = sz * e1x - sx * e1z;
  const qz = sx * e1y - sy * e1x;
  const v = f * (dir.x * qx + dir.y * qy + dir.z * qz);
  if (v < 0 || u + v > 1) return null;
  const tHit = f * (e2x * qx + e2y * qy + e2z * qz);
  if (tHit < EPS) return null;
  return tHit;
}

function traverse(
  node: BVHNode,
  triangles: BVHTriangle[],
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  tMin: number,
  tMax: number,
  out: { t: number; triIdx: number }[],
) {
  const slab = rayAABB(origin, dir, node.aabb, tMin, tMax);
  if (!slab) return;
  if (node.left === null && node.right === null) {
    for (const i of node.triIdx) {
      const t = rayTri(origin, dir, triangles[i]);
      if (t !== null && t > tMin && t < tMax) out.push({ t, triIdx: i });
    }
    return;
  }
  if (node.left) traverse(node.left, triangles, origin, dir, tMin, tMax, out);
  if (node.right) traverse(node.right, triangles, origin, dir, tMin, tMax, out);
}

// Convenience: build BVH from ln.Triangle[]
export function buildBVHFromTriangles(triangles: ln.Triangle[]): BVH {
  // ln.Triangle has v1/v2/v3 with x/y/z — same shape as BVHTriangle
  return new BVH(triangles as unknown as BVHTriangle[]);
}
