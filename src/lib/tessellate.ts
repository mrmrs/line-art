import * as ln from '@lnjs/core';
import type { CubeParams, SphereParams, ConeParams, CylinderParams } from './types';

// =============================================================================
// Tessellation of ln.js primitives into ln.Triangle[] for Fill / slicing /
// BVH use. ln.js renders these shapes via analytic edge equations, but our
// Fill system and BVH need explicit triangles. Each tessellator produces a
// closed manifold mesh (with caps) so volumetric inside-tests work.
// =============================================================================

// --- Cube: 12 triangles ---
export function tessellateCube(p: CubeParams): ln.Triangle[] {
  const [x0, y0, z0] = p.min;
  const [x1, y1, z1] = p.max;
  const v = (x: number, y: number, z: number) => new ln.Vector(x, y, z);
  const tri = (a: ln.Vector, b: ln.Vector, c: ln.Vector) => new ln.Triangle(a, b, c);
  // Vertices
  const a = v(x0, y0, z0), b = v(x1, y0, z0), c = v(x1, y1, z0), d = v(x0, y1, z0);
  const e = v(x0, y0, z1), f = v(x1, y0, z1), g = v(x1, y1, z1), h = v(x0, y1, z1);
  return [
    // -Z (bottom)
    tri(a, c, b), tri(a, d, c),
    // +Z (top)
    tri(e, f, g), tri(e, g, h),
    // -Y (front)
    tri(a, b, f), tri(a, f, e),
    // +Y (back)
    tri(d, h, g), tri(d, g, c),
    // -X (left)
    tri(a, e, h), tri(a, h, d),
    // +X (right)
    tri(b, c, g), tri(b, g, f),
  ];
}

// --- Sphere: lat-lon, capped at poles ---
const SPHERE_LON_SEGMENTS = 32;
const SPHERE_LAT_SEGMENTS = 16;

export function tessellateSphere(p: SphereParams): ln.Triangle[] {
  const { center, radius } = p;
  const [cx, cy, cz] = center;
  const lat = SPHERE_LAT_SEGMENTS;
  const lon = SPHERE_LON_SEGMENTS;
  const verts: ln.Vector[][] = [];
  for (let i = 0; i <= lat; i++) {
    const phi = (i / lat) * Math.PI; // 0..π
    const row: ln.Vector[] = [];
    for (let j = 0; j <= lon; j++) {
      const theta = (j / lon) * 2 * Math.PI;
      const x = cx + radius * Math.sin(phi) * Math.cos(theta);
      const y = cy + radius * Math.sin(phi) * Math.sin(theta);
      const z = cz + radius * Math.cos(phi);
      row.push(new ln.Vector(x, y, z));
    }
    verts.push(row);
  }
  const out: ln.Triangle[] = [];
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = verts[i][j];
      const b = verts[i + 1][j];
      const c = verts[i + 1][j + 1];
      const d = verts[i][j + 1];
      // Two triangles per quad. Pole rows degenerate (one vertex repeated).
      if (i !== 0) out.push(new ln.Triangle(a, b, d));
      if (i !== lat - 1) out.push(new ln.Triangle(b, c, d));
    }
  }
  return out;
}

// --- Cone: side faces + bottom cap. Base at z=0 radius r, apex at z=h. ---
const CONE_SEGMENTS = 48;

export function tessellateCone(p: ConeParams): ln.Triangle[] {
  const r = p.radius;
  const h = p.height;
  const out: ln.Triangle[] = [];
  const apex = new ln.Vector(0, 0, h);
  const center = new ln.Vector(0, 0, 0);
  const segs = CONE_SEGMENTS;
  for (let i = 0; i < segs; i++) {
    const t0 = (i / segs) * 2 * Math.PI;
    const t1 = ((i + 1) / segs) * 2 * Math.PI;
    const a = new ln.Vector(r * Math.cos(t0), r * Math.sin(t0), 0);
    const b = new ln.Vector(r * Math.cos(t1), r * Math.sin(t1), 0);
    // Side face (outward normal)
    out.push(new ln.Triangle(a, b, apex));
    // Bottom cap (inward — winding so normal faces -Z)
    out.push(new ln.Triangle(center, b, a));
  }
  return out;
}

// --- Cylinder: side + two caps. z from z0 to z1. ---
const CYL_SEGMENTS = 48;

export function tessellateCylinder(p: CylinderParams): ln.Triangle[] {
  const r = p.radius;
  const z0 = p.z0, z1 = p.z1;
  const out: ln.Triangle[] = [];
  const c0 = new ln.Vector(0, 0, z0);
  const c1 = new ln.Vector(0, 0, z1);
  const segs = CYL_SEGMENTS;
  for (let i = 0; i < segs; i++) {
    const t0 = (i / segs) * 2 * Math.PI;
    const t1 = ((i + 1) / segs) * 2 * Math.PI;
    const a0 = new ln.Vector(r * Math.cos(t0), r * Math.sin(t0), z0);
    const b0 = new ln.Vector(r * Math.cos(t1), r * Math.sin(t1), z0);
    const a1 = new ln.Vector(r * Math.cos(t0), r * Math.sin(t0), z1);
    const b1 = new ln.Vector(r * Math.cos(t1), r * Math.sin(t1), z1);
    // Side (two triangles per quad)
    out.push(new ln.Triangle(a0, b0, b1));
    out.push(new ln.Triangle(a0, b1, a1));
    // Bottom cap (normal -Z)
    out.push(new ln.Triangle(c0, b0, a0));
    // Top cap (normal +Z)
    out.push(new ln.Triangle(c1, a1, b1));
  }
  return out;
}
