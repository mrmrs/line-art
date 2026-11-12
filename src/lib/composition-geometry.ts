import * as ln from '@lnjs/core';
import { motifBoxes, frameOpening, CUT_ORB_HEIGHT } from './composition-motifs';
import type { CompositionInstance, CompositionParams, MotifKind } from './composition-types';
import { COMPOSITION_SCALE, instanceMatrix } from './composition';

const v = (x: number, y: number, z: number) => new ln.Vector(x, y, z);

// Subclass the analytic solids so visibility and Boolean boundary ownership
// retain the exact cube/sphere models, independently of decorative paths.
class FacetedBox extends ln.Cube {
  detail: number;
  engravedFace: number;
  constructor(min: ln.Vector, max: ln.Vector, detail: number, engravedFace: number) {
    super(min, max); this.detail = detail; this.engravedFace = engravedFace;
  }
  paths() {
    const paths = super.paths();
    // Shared construction engraves world +X consistently across base turns.
    // Legacy free construction retains its original local +X decoration.
    for (let j = 1; j <= this.detail; j++) {
      const z = this.min.z + (this.max.z - this.min.z) * j / (this.detail + 1);
      if (this.engravedFace === 0) paths.push([v(this.max.x, this.min.y, z), v(this.max.x, this.max.y, z)]);
      else if (this.engravedFace === 1) paths.push([v(this.min.x, this.max.y, z), v(this.max.x, this.max.y, z)]);
      else if (this.engravedFace === 2) paths.push([v(this.min.x, this.min.y, z), v(this.min.x, this.max.y, z)]);
      else paths.push([v(this.min.x, this.min.y, z), v(this.max.x, this.min.y, z)]);
    }
    return paths;
  }
}
class RibbedSphere extends ln.Sphere {
  detail: number;
  segments: number;
  constructor(detail: number, segments: number) {
    super(v(0, 0, 0), 1); this.detail = detail; this.segments = segments;
  }
  paths() {
    const paths: ln.Vector[][] = [];
    const circle = (point: (a: number) => ln.Vector) => {
      const path = Array.from({ length: this.segments }, (_, j) => point(j * Math.PI * 2 / this.segments));
      path.push(path[0]); paths.push(path);
    };
    for (let j = 1; j < this.detail + 1; j++) {
      const lat = -Math.PI / 2 + Math.PI * j / (this.detail + 1);
      circle(a => v(Math.cos(lat) * Math.cos(a), Math.cos(lat) * Math.sin(a), Math.sin(lat)));
    }
    for (let j = 0; j < this.detail + 1; j++) {
      const lng = Math.PI * j / (this.detail + 1);
      circle(a => v(Math.cos(lng) * Math.cos(a), Math.sin(lng) * Math.cos(a), Math.sin(a)));
    }
    return paths;
  }
}
// Bounded reusable geometry cache. Instance scale/rotation never mutate it.
const libraries = new Map<string, Record<MotifKind, ln.ShapeT[]>>();
function motifLibrary(detail: number, segments: number, instance: CompositionInstance) {
  const [innerX, innerY] = frameOpening(instance);
  const engravedFace = instance.construction === 'shared' ? ((Math.round(instance.angle / (Math.PI / 2)) % 4) + 4) % 4 : 0;
  const key = `${detail}:${segments}:${instance.motif === 'frame' ? `${innerX}:${innerY}` : 'standard'}:${engravedFace}`;
  const cached = libraries.get(key);
  if (cached) return cached;
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
    new FacetedBox(v(x0, y0, z0), v(x1, y1, z1), detail, engravedFace);
  const library: Record<MotifKind, ln.ShapeT[]> = {
    prism: motifBoxes({ ...instance, motif: 'prism' }).map(b => box(...b)),
    orb: [new RibbedSphere(detail, segments)],
    'cut-orb': [new ln.BooleanShape(ln.CSGOperation.Intersection,
      new RibbedSphere(detail, segments), new ln.Cube(v(-2, -2, -2), v(2, 2, CUT_ORB_HEIGHT)),
      { contourTolerance: 1 - Math.cos(Math.PI / segments) })],
    frame: motifBoxes({ ...instance, motif: 'frame' }).map(b => box(...b)),
    steps: motifBoxes({ ...instance, motif: 'steps' }).map(b => box(...b)),
  };
  if (libraries.size >= 32) libraries.delete(libraries.keys().next().value!);
  libraries.set(key, library);
  return library;
}
export function compositionShapes(p: CompositionParams): ln.ShapeT[] {
  return p.instances.flatMap(i => {
    // Spectral norm of this rotation × diagonal scale bounds curve error in
    // every projected direction. Chord sagitta <= 0.01 mm before simplification.
    const radius = i.size * Math.max(Math.sqrt(i.aspect), i.depth) / 2;
    const segments = Math.max(32, Math.ceil(Math.PI / Math.acos(1 - 0.01 / radius) / 16) * 16);
    const library = motifLibrary(p.detail, segments, i);
    const matrix = instanceMatrix(i).translate(v(i.x - p.widthMm / 2, i.y - p.heightMm / 2, 0))
      .scale(v(COMPOSITION_SCALE, COMPOSITION_SCALE, COMPOSITION_SCALE));
    return library[i.motif].map(shape => new ln.TransformedShape(shape, matrix));
  });
}
