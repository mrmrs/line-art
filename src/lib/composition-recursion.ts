import type { CompositionInstance, CompositionParams, Point2 } from './composition-types';
import { mulberry32 } from './random';

/** The solver owns the spatial index; recursion only proposes resolved instances. */
export interface AssemblyPlacementHooks {
  footprint: (instance: CompositionInstance) => Point2[];
  cavities: (instance: CompositionInstance) => Point2[][];
  fits: (instance: CompositionInstance) => boolean;
  accept: (instance: CompositionInstance) => boolean;
}

export function validateAssemblyLineage(instances: readonly CompositionInstance[],
  geometry?: Pick<AssemblyPlacementHooks, 'footprint' | 'cavities'>): void {
  const byId = new Map(instances.map(instance => [instance.id, instance]));
  for (const instance of instances) {
    const generation = instance.generation ?? 0;
    if (!Number.isInteger(generation) || generation < 0 || generation > 5)
      throw new Error('Assembly generation must be an integer between 0 and 5');
    if (instance.parentId === undefined) {
      if (generation !== 0) throw new Error('Assembly descendants must have a parent');
      continue;
    }
    if (typeof instance.parentId !== 'string' || !byId.has(instance.parentId))
      throw new Error('Assembly parent is missing');
    const parent = byId.get(instance.parentId)!;
    if (parent.motif !== 'frame') throw new Error('Only frames support nested assembly children');
    if (generation !== (parent.generation ?? 0) + 1)
      throw new Error('Assembly generation must follow its parent');
    if (geometry && !geometry.cavities(parent).some(cavity =>
      insideCavity(geometry.footprint(instance), cavity)))
      throw new Error('Assembly child must stay inside its parent aperture');
    const visited = new Set([instance.id]);
    let ancestor: CompositionInstance | undefined = parent;
    while (ancestor) {
      if (visited.has(ancestor.id)) throw new Error('Assembly ancestry contains a cycle');
      visited.add(ancestor.id);
      ancestor = ancestor.parentId === undefined ? undefined : byId.get(ancestor.parentId);
    }
  }
}

/** A kept descendant keeps its physical support chain, without changing pin flags. */
export function retainedAssemblyInstances(p: CompositionParams, refill: boolean): CompositionInstance[] {
  if (refill) return [...p.instances];
  const byId = new Map(p.instances.map(instance => [instance.id, instance]));
  const keep = new Set<string>();
  for (const instance of p.instances) {
    if (!instance.pinned) continue;
    let ancestor: CompositionInstance | undefined = instance;
    while (ancestor && !keep.has(ancestor.id)) {
      keep.add(ancestor.id);
      ancestor = ancestor.parentId === undefined ? undefined : byId.get(ancestor.parentId);
    }
  }
  return p.instances.filter(instance => keep.has(instance.id));
}

function branchSeed(seed: number, id: string): number {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let j = 0; j < id.length; j++) hash = Math.imul(hash ^ id.charCodeAt(j), 16777619) >>> 0;
  return hash;
}

/** Cavity polygons are convex; all vertices inside implies the entire hull is inside. */
function insideCavity(poly: Point2[], cavity: Point2[]): boolean {
  const winding = Math.sign(cavity.reduce((sum, a, j) => {
    const b = cavity[(j + 1) % cavity.length];
    return sum + a[0] * b[1] - a[1] * b[0];
  }, 0));
  if (!winding) return false;
  return poly.every(point => cavity.every((a, j) => {
    const b = cavity[(j + 1) % cavity.length];
    return winding * ((b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0])) >= -1e-9;
  }));
}

// Direct siblings must have separate envelopes: a frame's opening belongs to
// its descendants, rather than accidentally receiving a sibling of that frame.
function separateEnvelopes(a: Point2[], b: Point2[], clearance: number): boolean {
  for (const polygon of [a, b]) for (let j = 0; j < polygon.length; j++) {
    const u = polygon[j], v = polygon[(j + 1) % polygon.length];
    const dx = v[0] - u[0], dy = v[1] - u[1], length = Math.hypot(dx, dy);
    if (!length) continue;
    const project = (point: Point2) => (point[0] * -dy + point[1] * dx) / length;
    const pa = a.map(project), pb = b.map(project);
    if (Math.min(...pb) - Math.max(...pa) >= clearance - 1e-9 ||
        Math.min(...pa) - Math.max(...pb) >= clearance - 1e-9) return true;
  }
  return false;
}

/**
 * Recursively populate actual projected apertures. Each parent has independent
 * random channels and stable slot IDs. Attempts, generations and physical size
 * are bounded independently; every proposal still passes the global solver.
 */
export function populateRecursiveAssemblies(p: CompositionParams,
  existing: readonly CompositionInstance[], hooks: AssemblyPlacementHooks):
  { added: CompositionInstance[]; attempts: number } {
  const added: CompositionInstance[] = [];
  const maxDepth = p.recursionDepth ?? 0;
  if (!p.nesting || maxDepth === 0) return { added, attempts: 0 };
  const scale = p.recursionScale ?? 0.5;
  const queue = [...existing].sort((a, b) => (a.generation ?? 0) - (b.generation ?? 0));
  const ids = new Set(queue.map(instance => instance.id));
  const children = new Map<string, Point2[][]>();
  for (const instance of queue) if (instance.parentId) {
    if (!children.has(instance.parentId)) children.set(instance.parentId, []);
    children.get(instance.parentId)!.push(hooks.footprint(instance));
  }
  const initialCount = existing.length;
  let attempts = 0;
  const attemptLimit = 24000;
  for (let index = 0; index < queue.length && attempts < attemptLimit; index++) {
    if (initialCount + added.length >= p.maxInstances) break;
    const parent = queue[index], generation = (parent.generation ?? 0) + 1;
    if (generation > maxDepth || parent.size * scale < p.minSizeMm) continue;
    const cavities = hooks.cavities(parent);
    for (let cavityIndex = 0; cavityIndex < cavities.length; cavityIndex++) {
      const cavity = cavities[cavityIndex];
      if (cavity.length < 3) continue;
      const x0 = Math.min(...cavity.map(point => point[0])), x1 = Math.max(...cavity.map(point => point[0]));
      const y0 = Math.min(...cavity.map(point => point[1])), y1 = Math.max(...cavity.map(point => point[1]));
      const center: Point2 = [cavity.reduce((sum, point) => sum + point[0], 0) / cavity.length,
        cavity.reduce((sum, point) => sum + point[1], 0) / cavity.length];
      for (let slot = 0; slot < 3; slot++) {
        if (initialCount + added.length >= p.maxInstances || attempts >= attemptLimit) break;
        const id = `${parent.id}/r${cavityIndex}_${slot}`;
        if (ids.has(id) || id.length > 100) continue;
        const random = mulberry32(branchSeed(p.seed, id));
        const motif = slot === 0 && generation < maxDepth && p.motifs.includes('frame')
          ? 'frame' : p.motifs[Math.floor(random() * p.motifs.length)];
        const siblings = children.get(parent.id) ?? [];
        const side = slot === 0 ? 0 : slot === 1 ? -0.27 : 0.27;
        const baseX = center[0] + (x1 - x0 >= y1 - y0 ? side * (x1 - x0) : 0);
        const baseY = center[1] + (x1 - x0 < y1 - y0 ? side * (y1 - y0) : 0);
        let placed = false;
        for (let shrink = 0; shrink < 7 && !placed && attempts < attemptLimit; shrink++) {
          const size = Math.max(p.minSizeMm, Math.min(p.maxSizeMm, parent.size * scale) * 0.78 ** shrink);
          for (let position = 0; position < 9 && attempts < attemptLimit; position++) {
            attempts++;
            const candidate: CompositionInstance = { id, parentId: parent.id, generation, motif,
              x: baseX + (position === 0 ? 0 : (random() - 0.5) * (x1 - x0) * 0.65),
              y: baseY + (position === 0 ? 0 : (random() - 0.5) * (y1 - y0) * 0.65),
              size, ...(parent.construction === undefined ? {} : { construction: parent.construction }),
              aspect: parent.aspect, depth: parent.depth, angle: parent.angle,
              tilt: parent.tilt, pinned: false };
            const envelope = hooks.footprint(candidate);
            if (!insideCavity(envelope, cavity) || siblings.some(sibling =>
              !separateEnvelopes(envelope, sibling, p.clearanceMm)) || !hooks.fits(candidate)) continue;
            if (!hooks.accept(candidate)) continue;
            // Complete a branch before spending the finite work budget on
            // unrelated roots. Breadth-first traversal can starve deep levels
            // on a large page even when their apertures are readily usable.
            ids.add(id); added.push(candidate); queue.splice(index + 1, 0, candidate); siblings.push(envelope);
            children.set(parent.id, siblings); placed = true; break;
          }
          if (size === p.minSizeMm) break;
        }
      }
    }
  }
  return { added, attempts };
}
