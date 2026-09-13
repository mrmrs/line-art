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
  step: number,
  scene?: ln.Scene,
  budget = { samples: 0 },
): ln.Paths {
  const output: ln.Paths = [];
  const project = (p: ln.Vector) => {
    const q = matrix.mulPositionW(p);
    return new ln.Vector(((q.x + 1) * width) / 2, ((q.y + 1) * height) / 2, 0);
  };
  for (const path of paths) {
    let stroke: ln.Vector[] = [];
    const flush = () => {
      if (stroke.length > 1) output.push(stroke);
      stroke = [];
    };
    for (let i = 1; i < path.length; i++) {
      const segment = clipSegment(path[i - 1], path[i], matrix);
      if (!segment) {
        flush();
        continue;
      }
      const [a, b] = segment;
      const count = scene ? Math.max(1, Math.ceil(a.distance(b) / step)) : 1;
      budget.samples += count + 1;
      if (budget.samples > LIMITS.samples)
        throw new Error(
          'Render sample budget exceeded; increase render step or reduce geometry',
        );
      // Keep visibility runs connected while preserving gaps and clipping.
      for (let j = 0; j <= count; j++) {
        const point = lerp(a, b, j / count);
        if (scene && !scene.visible(eye, point)) {
          flush();
          continue;
        }
        const screen = project(point);
        if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) {
          flush();
          continue;
        }
        const last = stroke[stroke.length - 1];
        if (j === 0 && last && last.distance(screen) > 1e-7) flush();
        if (!last || last.distance(screen) > 1e-9) {
          const prev = stroke[stroke.length - 2];
          if (
            prev &&
            Math.abs(
              (last.x - prev.x) * (screen.y - last.y) -
                (last.y - prev.y) * (screen.x - last.x),
            ) < 1e-9 &&
            (last.x - prev.x) * (screen.x - last.x) +
              (last.y - prev.y) * (screen.y - last.y) >=
              0
          )
            stroke[stroke.length - 1] = screen;
          else stroke.push(screen);
        }
      }
    }
    flush();
    if (output.length > LIMITS.paths)
      throw new Error('Projected path budget exceeded');
  }
  return output;
}
