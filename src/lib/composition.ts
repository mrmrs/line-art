import * as ln from '@lnjs/core';
import { createNoise2D } from 'simplex-noise';
import { mulberry32 } from './random';
import { motifBoxes, frameOpening, CUT_ORB_HEIGHT } from './composition-motifs';
import { MOTIFS } from './composition-types';
import { populateRecursiveAssemblies, retainedAssemblyInstances, validateAssemblyLineage } from './composition-recursion';
import type { CompositionParams, CompositionInstance, Point2 } from './composition-types';
import type { CameraConfig } from './types';

// Layout uses millimeters; Studio geometry uses 40 mm per world unit.
export const COMPOSITION_SCALE = 1 / 40;
export function compositionCamera(p: CompositionParams): CameraConfig {
  return { name: 'Composition', eye: [0, 0, 50], center: [0, 0, 0], up: [0, 1, 0],
    ortho: true, orthoSize: p.heightMm * COMPOSITION_SCALE / 2, fovy: 50, zoom: 1 };
}
// Keep preview/export work bounded without changing the paper aspect ratio.
export function compositionResolution(p: CompositionParams) {
  const scale = 1200 / Math.max(p.widthMm, p.heightMm);
  return { width: p.widthMm * scale, height: p.heightMm * scale };
}
// One right-handed orthonormal view basis for all shared-axis objects.
// Local +Z is up; world quarter-turns occur BEFORE this common projection.
const ISOMETRIC_BASIS = new ln.Matrix(
  -1 / Math.sqrt(2), 1 / Math.sqrt(2), 0, 0,
  -1 / Math.sqrt(6), -1 / Math.sqrt(6), Math.sqrt(2 / 3), 0,
  1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3), 0,
  0, 0, 0, 1,
);
export function instanceMatrix(i: CompositionInstance): ln.Matrix {
  const scale = ln.identity().scale(new ln.Vector(i.size * Math.sqrt(i.aspect) / 2,
    i.size / Math.sqrt(i.aspect) / 2, i.size * i.depth / 2));
  if (i.construction === 'shared')
    return ISOMETRIC_BASIS.mul(scale.rotate(new ln.Vector(0, 0, 1), i.angle));
  return scale.rotate(new ln.Vector(1, 0, 0), i.tilt)
    .rotate(new ln.Vector(0, 1, 0), -0.48)
    .rotate(new ln.Vector(0, 0, 1), i.angle);
}
const cross = (a: Point2, b: Point2, c: Point2) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function hull(points: Point2[]): Point2[] {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (ps: Point2[]) => {
    const out: Point2[] = [];
    for (const v of ps) {
      while (out.length > 1 && cross(out[out.length - 2], out[out.length - 1], v) <= 0) out.pop();
      out.push(v);
    }
    out.pop(); return out;
  };
  return [...half(points), ...half([...points].reverse())];
}
function projectedBox(i: CompositionInstance, lo: Point3, hi: Point3): Point2[] {
  const m = instanceMatrix(i), points: Point2[] = [];
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
    const v = m.mulPosition(new ln.Vector(x, y, z)); points.push([v.x + i.x, v.y + i.y]);
  }
  return hull(points);
}
type Point3 = [number, number, number];
/** Convex occupied pieces; overlapping pieces deliberately remain separate. */
export function footprintParts(i: CompositionInstance, nesting = true): Point2[][] {
  if (i.motif === 'orb' || i.motif === 'cut-orb') {
    const m = instanceMatrix(i);
    const axes = [new ln.Vector(1, 0, 0), new ln.Vector(0, 1, 0), new ln.Vector(0, 0, 1)].map(v => m.mulPosition(v));
    // Analytic support of the unit sphere, optionally clipped at local z=.35.
    // Consecutive support lines circumscribe the exact projected solid.
    const lines = Array.from({ length: 48 }, (_, j) => {
      const a = j * Math.PI / 24, x = Math.cos(a), y = Math.sin(a);
      const c = axes.map(v => v.x * x + v.y * y), length = Math.hypot(...c);
      const h = nesting && i.motif === 'cut-orb' && c[2] / length > CUT_ORB_HEIGHT
        ? Math.hypot(c[0], c[1]) * Math.sqrt(1 - CUT_ORB_HEIGHT ** 2) + c[2] * CUT_ORB_HEIGHT : length;
      return { x, y, h };
    });
    return [lines.map((a, j) => {
      const b = lines[(j + 1) % lines.length], d = a.x * b.y - a.y * b.x;
      return [(a.h * b.y - a.y * b.h) / d + i.x, (a.x * b.h - a.h * b.x) / d + i.y];
    })];
  }
  if (nesting) return motifBoxes(i).map(b => projectedBox(i, [b[0], b[1], b[2]], [b[3], b[4], b[5]]));
  return [projectedBox(i, [-1, -1, -1], [1, 1, 1])];
}
export function footprint(i: CompositionInstance): Point2[] {
  return hull(footprintParts(i).flat());
}
/** The visible aperture is the intersection of the near/far inner openings. */
export function footprintCavities(i: CompositionInstance): Point2[][] {
  if (i.motif !== 'frame') return [];
  const m = instanceMatrix(i);
  const [innerX, innerY] = frameOpening(i);
  const aperture = (z: number) => hull(([-1, 1].flatMap(x => [-1, 1].map(y => {
    const v = m.mulPosition(new ln.Vector(x * innerX, y * innerY, z));
    return [v.x + i.x, v.y + i.y] as Point2;
  }))));
  let polygon = aperture(-1);
  const clip = aperture(1);
  for (let j = 0; j < clip.length && polygon.length; j++) {
    const a = clip[j], b = clip[(j + 1) % clip.length], next: Point2[] = [];
    for (let k = 0; k < polygon.length; k++) {
      const u = polygon[k], v = polygon[(k + 1) % polygon.length];
      const du = cross(a, b, u), dv = cross(a, b, v);
      if (du >= 0) next.push(u);
      if ((du < 0) !== (dv < 0)) {
        const t = du / (du - dv); next.push([u[0] + t * (v[0] - u[0]), u[1] + t * (v[1] - u[1])]);
      }
    }
    polygon = next;
  }
  return polygon.length >= 3 && polygonArea(polygon) > 1e-8 ? [polygon] : [];
}
const pointSegmentDistance = (p: Point2, a: Point2, b: Point2) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
function pointPolygonDistance(point: Point2, polygon: Point2[]) {
  let inside = true, distance = Infinity;
  for (let j = 0; j < polygon.length; j++) {
    const a = polygon[j], b = polygon[(j + 1) % polygon.length];
    if (cross(a, b, point) < -1e-9) inside = false;
    distance = Math.min(distance, pointSegmentDistance(point, a, b));
  }
  return inside ? 0 : distance;
}
export function polygonsConflict(a: Point2[], b: Point2[], gap: number): boolean {
  let separated = false;
  for (const p of [a, b]) for (let j = 0; j < p.length; j++) {
    const u = p[j], v = p[(j + 1) % p.length], dx = v[0] - u[0], dy = v[1] - u[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-10) continue;
    const nx = -dy / length, ny = dx / length;
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const q of a) { const d = (q[0] - u[0]) * nx + (q[1] - u[1]) * ny; amin = Math.min(amin, d); amax = Math.max(amax, d); }
    for (const q of b) { const d = (q[0] - u[0]) * nx + (q[1] - u[1]) * ny; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); }
    const separation = Math.max(bmin - amax, amin - bmax);
    if (separation > 0) separated = true;
    if (separation >= gap - 1e-9) return false;
  }
  if (!separated) return true;
  // SAT axes alone reject valid diagonal corner gaps. The exact distance of
  // disjoint convex polygons is attained by an endpoint and an opposing edge.
  for (const [p, q] of [[a, b], [b, a]]) for (const point of p)
    for (let j = 0; j < q.length; j++)
      if (pointSegmentDistance(point, q[j], q[(j + 1) % q.length]) < gap - 1e-9) return true;
  return false;
}
const bounds = (p: Point2[]) => ({ x0: Math.min(...p.map(v => v[0])), x1: Math.max(...p.map(v => v[0])),
  y0: Math.min(...p.map(v => v[1])), y1: Math.max(...p.map(v => v[1])) });
export const polygonArea = (p: Point2[]) => Math.abs(p.reduce((s, v, j) => {
  const w = p[(j + 1) % p.length]; return s + v[0] * w[1] - v[1] * w[0];
}, 0)) / 2;
/** Exact area of a union of convex pieces by vertical arrangement integration. */
export function footprintArea(i: CompositionInstance, nesting = true): number {
  const parts = footprintParts(i, nesting);
  if (parts.length === 1) return polygonArea(parts[0]);
  const edges = parts.flatMap(p => p.map((a, j) => [a, p[(j + 1) % p.length]]));
  const xs = parts.flat().map(v => v[0]);
  for (let j = 0; j < edges.length; j++) for (let k = j + 1; k < edges.length; k++) {
    const [a, b] = edges[j], [c, d] = edges[k];
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = d[0] - c[0], vy = d[1] - c[1];
    const det = ux * vy - uy * vx;
    if (Math.abs(det) < 1e-12) continue;
    const t = ((c[0] - a[0]) * vy - (c[1] - a[1]) * vx) / det;
    const u = ((c[0] - a[0]) * uy - (c[1] - a[1]) * ux) / det;
    if (t > 0 && t < 1 && u > 0 && u < 1) xs.push(a[0] + t * ux);
  }
  xs.sort((a, b) => a - b);
  let area = 0;
  for (let j = 1; j < xs.length; j++) {
    const width = xs[j] - xs[j - 1]; if (width < 1e-10) continue;
    const x = (xs[j] + xs[j - 1]) / 2;
    const intervals: [number, number][] = [];
    for (const poly of parts) {
      const ys: number[] = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], b = poly[(k + 1) % poly.length];
        if (x > Math.min(a[0], b[0]) && x < Math.max(a[0], b[0])) ys.push(a[1] + (x - a[0]) * (b[1] - a[1]) / (b[0] - a[0]));
      }
      if (ys.length) intervals.push([Math.min(...ys), Math.max(...ys)]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let length = 0, end = -Infinity;
    for (const [lo, hi] of intervals) { length += Math.max(0, hi - Math.max(end, lo)); end = Math.max(end, hi); }
    area += length * width;
  }
  return area;
}
export function quietFootprints(p: CompositionParams): Point2[][] {
  return p.quiet.map(q => [[q.x, q.y], [q.x + q.width, q.y],
    [q.x + q.width, q.y + q.height], [q.x, q.y + q.height]]);
}
export function validateComposition(p: CompositionParams) {
  if (p.version !== 1) throw new Error('Unsupported composition version');
  if (p.construction !== undefined && !['shared', 'free'].includes(p.construction)) throw new Error('Invalid composition construction');
  if (p.nesting !== undefined && typeof p.nesting !== 'boolean') throw new Error('Nesting must be boolean');
  const range = (v: number, lo: number, hi: number, label: string) => {
    if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${label} must be between ${lo} and ${hi}`);
  };
  range(p.seed, 0, 4294967295, 'Seed');
  range(p.widthMm, 40, 2000, 'Paper width'); range(p.heightMm, 40, 2000, 'Paper height');
  range(p.marginMm, 0, Math.min(p.widthMm, p.heightMm) / 3, 'Margin');
  range(p.clearanceMm, 0.1, 20, 'Clearance'); range(p.minSizeMm, 2, 100, 'Minimum size');
  range(p.maxSizeMm, p.minSizeMm, 300, 'Maximum size'); range(p.aspect, 1, 6, 'Aspect ratio');
  range(p.detail, 1, 12, 'Surface detail');
  if (p.recursionDepth !== undefined) { range(p.recursionDepth, 0, 5, 'Recursion depth'); if (!Number.isInteger(p.recursionDepth)) throw new Error('Recursion depth must be an integer'); }
  if (p.recursionScale !== undefined) range(p.recursionScale, 0.25, 0.7, 'Recursion scale');
  if (!Number.isInteger(p.detail)) throw new Error('Surface detail must be an integer');
  range(p.density, 0.1, 0.85, 'Density'); range(p.coherence, 0, 1, 'Coherence'); range(p.depth, 0.1, 1.5, 'Depth');
  range(p.maxInstances, 1, 1500, 'Instance limit');
  if (!Number.isInteger(p.seed) || !Number.isInteger(p.maxInstances)) throw new Error('Seed and instance limit must be integers');
  if (!Array.isArray(p.motifs) || !p.motifs.length || p.motifs.length > 5 || p.motifs.some(m => !MOTIFS.some(x => x.value === m))) throw new Error('Choose valid motifs');
  if (!Array.isArray(p.quiet) || p.quiet.length > 32 || !Array.isArray(p.instances) || p.instances.length > 1500) throw new Error('Composition exceeds region or instance budget');
  const ids = new Set<string>();
  for (const i of p.instances) {
    if (!i || typeof i.id !== 'string' || i.id.length === 0 || i.id.length > 100 || ids.has(i.id) || !MOTIFS.some(m => m.value === i.motif) || typeof i.pinned !== 'boolean') throw new Error('Invalid composition instance');
    if (i.construction !== undefined && !['shared', 'free'].includes(i.construction)) throw new Error('Invalid instance construction');
    if (i.construction === 'shared' && (Math.abs(i.angle / (Math.PI / 2) - Math.round(i.angle / (Math.PI / 2))) > 1e-8 || i.tilt !== 0))
      throw new Error('Shared construction requires world-axis quarter turns and zero individual tilt');
    ids.add(i.id); range(i.x, 0, 2000, 'Position'); range(i.y, 0, 2000, 'Position');
    range(i.size, 2, 300, 'Instance size'); range(i.aspect, 1, 6, 'Instance aspect');
    range(i.depth, 0.1, 1.5, 'Instance depth'); range(i.angle, -100, 100, 'Angle'); range(i.tilt, -2, 2, 'Tilt');
  }
  validateAssemblyLineage(p.instances, { footprint, cavities: footprintCavities });
  for (const q of p.quiet) {
    if (!q || typeof q.id !== 'string' || q.id.length > 100) throw new Error('Invalid quiet region');
    range(q.x, 0, p.widthMm, 'Region X'); range(q.y, 0, p.heightMm, 'Region Y');
    range(q.width, 1, p.widthMm - q.x, 'Region width'); range(q.height, 1, p.heightMm - q.y, 'Region height');
  }
}
export interface PackingResult {
  instances: CompositionInstance[];
  attempts: number;
  coverage: number;
  limited: boolean;
  repairAdded: number;
  repairAttempts: number;
  recursiveAdded: number;
}
export function packComposition(p: CompositionParams, refill = false,
  progress?: (count: number) => void, options: { repair?: boolean } = {}): PackingResult {
  validateComposition(p);
  const random = mulberry32(p.seed), noise = createNoise2D(mulberry32(p.seed ^ 0x5f3759df));
  const nesting = p.nesting === true;
  const instances: CompositionInstance[] = [], polygons: Point2[][] = [], polygonBounds: ReturnType<typeof bounds>[] = [];
  const grid = new Map<string, Set<number>>(), cell = Math.max(12, p.minSizeMm * 2);
  const keys = (poly: Point2[], gap = 0) => {
    const b = bounds(poly), result: string[] = [];
    for (let x = Math.floor((b.x0 - gap) / cell); x <= Math.floor((b.x1 + gap) / cell); x++)
      for (let y = Math.floor((b.y0 - gap) / cell); y <= Math.floor((b.y1 + gap) / cell); y++) result.push(`${x}:${y}`);
    return result;
  };
  const addPoly = (poly: Point2[]) => {
    const id = polygons.length; polygons.push(poly); polygonBounds.push(bounds(poly));
    for (const k of keys(poly)) { if (!grid.has(k)) grid.set(k, new Set()); grid.get(k)!.add(id); }
  };
  quietFootprints(p).forEach(addPoly);
  const fitsPolygon = (poly: Point2[]) => {
    const b = bounds(poly), m = p.marginMm;
    if (b.x0 < m - 1e-9 || b.y0 < m - 1e-9 || b.x1 > p.widthMm - m + 1e-9 || b.y1 > p.heightMm - m + 1e-9) return false;
    const neighbors = new Set<number>();
    for (const k of keys(poly, p.clearanceMm)) for (const id of grid.get(k) ?? []) neighbors.add(id);
    for (const id of neighbors) if (polygonsConflict(poly, polygons[id], p.clearanceMm)) return false;
    return true;
  };
  const reservedCavities: Point2[][] = [], rootEnvelopes: Point2[][] = [];
  const grammarEnabled = nesting && (p.recursionDepth ?? 0) > 0;
  const fits = (i: CompositionInstance, reserve = true) => {
    if (!footprintParts(i, nesting).every(fitsPolygon)) return false;
    if (!reserve || !grammarEnabled || i.parentId) return true;
    // In recursive mode, aperture contents belong to an explicit assembly.
    // Test both directions: a new root cannot enter an existing opening, nor
    // can a newly placed root frame silently wrap an earlier unowned root.
    const envelope = footprint(i);
    if (reservedCavities.some(cavity => polygonsConflict(envelope, cavity, 0))) return false;
    return !footprintCavities(i).some(cavity => rootEnvelopes.some(root => polygonsConflict(cavity, root, 0)));
  };
  let area = 0, attempts = 0, serial = 0, recursiveAdded = 0;
  const ids = new Set<string>();
  const accept = (i: CompositionInstance, reserve = true) => {
    if (instances.length >= p.maxInstances || (i.id && ids.has(i.id)) || !fits(i, reserve)) return false;
    if (!i.id) { do { i.id = `c${p.seed}_${serial++}`; } while (ids.has(i.id)); }
    ids.add(i.id); instances.push(i); footprintParts(i, nesting).forEach(addPoly); area += footprintArea(i, nesting);
    if (grammarEnabled) {
      reservedCavities.push(...footprintCavities(i));
      if (!i.parentId) rootEnvelopes.push(footprint(i));
    }
    return true;
  };
  const retained = retainedAssemblyInstances(p, refill);
  if (retained.length > p.maxInstances) throw new Error('Instance limit is smaller than the kept composition');
  for (const i of retained) {
    if (!accept({ ...i }, false)) throw new Error('Kept forms conflict with the paper, clearance or quiet regions. Unpin them or restore the previous settings.');
  }
  const available = (p.widthMm - 2 * p.marginMm) * (p.heightMm - 2 * p.marginMm);
  const target = p.density * available;
  const candidate = (x: number, y: number, size: number): CompositionInstance => {
    const field = noise(x / 90, y / 90);
    return { id: '', construction: p.construction ?? 'free', motif: p.motifs[Math.floor(random() * p.motifs.length)], x, y, size,
      aspect: 1 + random() ** 1.5 * (p.aspect - 1), depth: p.depth,
      angle: p.construction === 'shared'
        ? Math.round(field * 2 * p.coherence + (random() - 0.5) * 4 * (1 - p.coherence)) * Math.PI / 2
        : Math.round(field * 2) * Math.PI / 3 * p.coherence + (random() - 0.5) * Math.PI * (1 - p.coherence),
      tilt: p.construction === 'shared' ? 0 : 0.5 + field * 0.12, pinned: false };
  };
  const recurse = () => {
    if (!nesting || !p.recursionDepth) return;
    const result = populateRecursiveAssemblies(p, instances, { footprint, cavities: footprintCavities, fits, accept });
    attempts += result.attempts; recursiveAdded += result.added.length;
    progress?.(instances.length);
  };
  // Reserve first-pass capacity for descendants. Existing kept frames get
  // their assembly slots first; otherwise a small cap can fill with roots
  // before the recursion control ever has a chance to produce a child.
  const reserveNewDescendants = grammarEnabled && p.motifs.includes('frame');
  const rootAllowance = () => reserveNewDescendants
    ? Math.ceil((p.maxInstances - instances.length) / ((p.recursionDepth ?? 0) + 1))
    : p.maxInstances - instances.length;
  const firstPassRootLimit = instances.length + (grammarEnabled && instances.some(i => i.motif === 'frame')
    ? 0 : rootAllowance());
  let remainingRootSlots = p.maxInstances;
  // Establish large forms first; reserve their apertures for recursive children
  // before smaller unrelated objects compete for the same space.
  for (let pass = 0; pass < 8 && area < target && instances.length < p.maxInstances; pass++) {
    const scale = p.maxSizeMm * (p.minSizeMm / p.maxSizeMm) ** (pass / 7);
    for (let j = 0; j < 650 && area < target && instances.length < (pass === 0 ? firstPassRootLimit : p.maxInstances)
      && (pass === 0 || remainingRootSlots > 0); j++) {
      attempts++;
      const accepted = accept(candidate(random() * p.widthMm, random() * p.heightMm,
        Math.max(p.minSizeMm, scale * (0.78 + random() * 0.22))));
      if (accepted && pass > 0) remainingRootSlots--;
    }
    if (pass === 0) {
      recurse();
      // Later anchor passes share a quota so the final recursion call still
      // has room to grow their children, including after pinned regeneration.
      remainingRootSlots = rootAllowance();
    }
    progress?.(instances.length);
  }
  recurse();
  const beforeRepair = instances.length, beforeRepairAttempts = attempts;
  if (options.repair !== false && area < target && instances.length < p.maxInstances) {
    const clearanceAt = (x: number, y: number) => {
      let radius = Math.min(x - p.marginMm, y - p.marginMm, p.widthMm - p.marginMm - x, p.heightMm - p.marginMm - y);
      if (radius <= 0) return 0;
      for (let j = 0; j < polygons.length; j++) {
        const b = polygonBounds[j];
        const lower = Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1)) - p.clearanceMm;
        if (lower >= radius) continue;
        radius = Math.min(radius, pointPolygonDistance([x, y], polygons[j]) - p.clearanceMm);
        if (radius <= 0) return 0;
      }
      return radius;
    };
    // A bounded clearance field prioritizes residual pockets across the entire
    // page, independent of paper dimensions. Explicit aperture seeds rescue
    // holes smaller than a field cell. Exact occupied-piece checks are final.
    const usableWidth = p.widthMm - 2 * p.marginMm, usableHeight = p.heightMm - 2 * p.marginMm;
    const cols = Math.max(2, Math.round(Math.sqrt(2304 * usableWidth / usableHeight)));
    const rows = Math.max(2, Math.floor(2304 / cols));
    const seeds: { x: number; y: number; radius: number; order: number }[] = [];
    const addSeed = (x: number, y: number) => {
      const radius = clearanceAt(x, y);
      if (radius > p.minSizeMm / 10) seeds.push({ x, y, radius, order: seeds.length });
    };
    if (nesting) for (const i of instances) for (const cavity of footprintCavities(i))
      addSeed(cavity.reduce((s, v) => s + v[0], 0) / cavity.length, cavity.reduce((s, v) => s + v[1], 0) / cavity.length);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++)
      addSeed(p.marginMm + (x + 0.5) * usableWidth / cols, p.marginMm + (y + 0.5) * usableHeight / rows);
    seeds.sort((a, b) => b.radius - a.radius || a.order - b.order);
    for (const seed of seeds.slice(0, 640)) {
      if (area >= target || instances.length >= p.maxInstances) break;
      const radius = clearanceAt(seed.x, seed.y);
      if (radius < p.minSizeMm / 10) continue;
      // Fit multiple orientations and aspect ratios at minimum size, then
      // search larger sizes about the same center with bounded bisection.
      const base = candidate(seed.x, seed.y, p.minSizeMm);
      let best: CompositionInstance | undefined, bestArea = 0;
      for (let variant = 0; variant < 8; variant++) {
        const i = { ...base, motif: p.motifs[(Math.floor(random() * p.motifs.length) + variant) % p.motifs.length],
          angle: base.angle + (variant % 4) * Math.PI / (base.construction === 'shared' ? 2 : 4),
          aspect: variant < 4 ? 1 : p.aspect };
        attempts++;
        if (!fits(i)) continue;
        let lo = p.minSizeMm, hi = Math.min(p.maxSizeMm, Math.max(p.minSizeMm, radius * Math.sqrt(p.aspect) * 3));
        for (let iteration = 0; iteration < 5; iteration++) {
          const mid = (lo + hi) / 2; attempts++;
          if (fits({ ...i, size: mid })) lo = mid; else hi = mid;
        }
        i.size = lo;
        const occupied = footprintArea(i, nesting);
        if (occupied > bestArea) { best = i; bestArea = occupied; }
      }
      if (best) accept(best);
      if (attempts % 64 < 8) progress?.(instances.length);
    }
  }
  return { instances, attempts, coverage: area / available, limited: area < target,
    repairAdded: instances.length - beforeRepair, repairAttempts: attempts - beforeRepairAttempts, recursiveAdded };
}
