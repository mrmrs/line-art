import * as ln from '@lnjs/core';
import { LIMITS } from './limits';

// Clip against all six homogeneous frustum planes BEFORE dividing by w.
export function clipSegment(
  a: ln.Vector,
  b: ln.Vector,
  m: ln.Matrix,
): [ln.Vector, ln.Vector] | null {
  const clip = (p: ln.Vector) => [
    m.x00 * p.x + m.x01 * p.y + m.x02 * p.z + m.x03,
    m.x10 * p.x + m.x11 * p.y + m.x12 * p.z + m.x13,
    m.x20 * p.x + m.x21 * p.y + m.x22 * p.z + m.x23,
    m.x30 * p.x + m.x31 * p.y + m.x32 * p.z + m.x33,
  ];
  const ca = clip(a),
    cb = clip(b);
  let lo = 0,
    hi = 1;
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [-1, 1]) {
      const fa = ca[3] + sign * ca[axis],
        fb = cb[3] + sign * cb[axis];
      if (fa < 0 && fb < 0) return null;
      if (fa < 0) lo = Math.max(lo, fa / (fa - fb));
      if (fb < 0) hi = Math.min(hi, fa / (fa - fb));
    }
  if (lo > hi) return null;
  return [lerp(a, b, lo), lerp(a, b, hi)];
}
function lerp(a: ln.Vector, b: ln.Vector, t: number) {
  return new ln.Vector(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t,
  );
}
export function projectPaths(
  paths: ln.Paths,
  matrix: ln.Matrix,
  eye: ln.Vector,
  width: number,
  height: number,
  _step: number,
  scene?: ln.Scene,
  budget = { samples: 0 },
  options: ln.VisibilityOptions = {},
): ln.Paths {
  if (!paths.length) return [];
  const orthographic = matrix.x30 === 0 && matrix.x31 === 0 && matrix.x32 === 0;
  const inverse = matrix.inverse();
  const direction = inverse
    .mulPositionW(new ln.Vector(0, 0, -1))
    .sub(inverse.mulPositionW(new ln.Vector(0, 0, 1)))
    .normalize();
  const visibility = scene
    ? new ln.Visibility(scene, matrix, eye, width, height, {
        orthographic,
        direction,
        maxTests: LIMITS.samples * 10,
        maxTriangles: LIMITS.triangles * 10,
        ...options,
      })
    : undefined;
  const output = ln.renderPaths(
    paths,
    matrix,
    width,
    height,
    visibility,
    LIMITS.vertices,
  );
  budget.samples += visibility
    ? visibility.stats.tests + visibility.stats.fallbackRays
    : output.length;
  if (budget.samples > (options.maxTests ?? LIMITS.samples * 10))
    throw new Error('Occlusion work budget exceeded');
  if (output.length > LIMITS.paths)
    throw new Error('Projected path budget exceeded');
  return output;
}
