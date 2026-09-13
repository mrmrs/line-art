import * as ln from '@lnjs/core';
import type { PenGroup } from './svg-output';
import type { PlotSettings, PlotStats } from './plot-settings';
import { optimizePathOrder } from './plotter-optimize';
import { bounded, LIMITS, assertPaths } from './limits';

const distance = (a: ln.Vector, b: ln.Vector) =>
  Math.hypot(a.x - b.x, a.y - b.y);
function pointSegment(p: ln.Vector, a: ln.Vector, b: ln.Vector) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function simplifyPath(
  path: ln.Vector[],
  tolerance: number,
): ln.Vector[] {
  if (path.length < 3 || tolerance === 0) return path;
  const keep = new Uint8Array(path.length);
  keep[0] = keep[path.length - 1] = 1;
  const stack = [[0, path.length - 1]];
  let work = 0;
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let best = tolerance,
      index = -1;
    for (let i = start + 1; i < end; i++) {
      if (++work > LIMITS.samples * 10)
        throw new Error('Simplification work budget exceeded');
      const d = pointSegment(path[i], path[start], path[end]);
      if (d > best) {
        best = d;
        index = i;
      }
    }
    if (index >= 0) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  const result = path.filter((_, i) => keep[i]);
  return path.length >= 4 &&
    distance(path[0], path[path.length - 1]) < 1e-9 &&
    result.length < 4
    ? path
    : result;
}
function clipPaper(
  a: ln.Vector,
  b: ln.Vector,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [ln.Vector, ln.Vector] | null {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  let lo = 0,
    hi = 1;
  for (const [p, q] of [
    [-dx, a.x - x0],
    [dx, x1 - a.x],
    [-dy, a.y - y0],
    [dy, y1 - a.y],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
  }
  return lo > hi
    ? null
    : [
        new ln.Vector(a.x + dx * lo, a.y + dy * lo, 0),
        new ln.Vector(a.x + dx * hi, a.y + dy * hi, 0),
      ];
}
function segmentDistance(
  a: ln.Vector,
  b: ln.Vector,
  c: ln.Vector,
  d: ln.Vector,
) {
  const cross = (p: ln.Vector, q: ln.Vector, r: ln.Vector) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  if (
    cross(a, b, c) * cross(a, b, d) < 0 &&
    cross(c, d, a) * cross(c, d, b) < 0
  )
    return 0;
  return Math.min(
    pointSegment(a, c, d),
    pointSegment(b, c, d),
    pointSegment(c, a, b),
    pointSegment(d, a, b),
  );
}
export function checkClearance(paths: ln.Paths, gap: number) {
  if (gap <= 0) return;
  const segments: {
    a: ln.Vector;
    b: ln.Vector;
    path: number;
    index: number;
  }[] = [];
  const grid = new Map<string, number[]>();
  let work = 0;
  for (let pi = 0; pi < paths.length; pi++)
    for (let i = 1; i < paths[pi].length; i++) {
      const a = paths[pi][i - 1],
        b = paths[pi][i];
      const keys = new Set<string>();
      const steps = Math.max(1, Math.ceil((distance(a, b) / gap) * 2));
      bounded(steps, 'Clearance samples', 1, LIMITS.samples);
      for (let j = 0; j <= steps; j++) {
        const x = Math.floor((a.x + ((b.x - a.x) * j) / steps) / gap),
          y = Math.floor((a.y + ((b.y - a.y) * j) / steps) / gap);
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++) keys.add(`${x + dx},${y + dy}`);
      }
      const tested = new Set<number>();
      for (const key of keys)
        for (const index of grid.get(key) ?? []) {
          if (tested.has(index)) continue;
          tested.add(index);
          if (++work > LIMITS.samples * 4)
            throw new Error('Clearance check budget exceeded');
          const other = segments[index];
          if (
            other.path === pi &&
            (Math.abs(other.index - i) <= 1 ||
              (i === paths[pi].length - 1 &&
                other.index === 1 &&
                distance(b, paths[pi][0]) < 1e-7))
          )
            continue;
          // Connected endpoints and intentional crossings are allowed only when clearance checking is off.
          if (segmentDistance(a, b, other.a, other.b) < gap - 1e-7)
            throw new Error(
              'Minimum pen clearance is not met. Increase spacing or set minimum clearance to 0 to allow overlaps.',
            );
        }
      const index = segments.length;
      segments.push({ a, b, path: pi, index: i });
      for (const key of keys) {
        const list = grid.get(key) ?? [];
        list.push(index);
        grid.set(key, list);
        if (++work > LIMITS.samples * 4)
          throw new Error('Clearance check budget exceeded');
      }
    }
}
export function preparePlot(
  groups: PenGroup[],
  pageWidthMm: number,
  pageHeightMm: number,
  width: number,
  height: number,
  settings: PlotSettings,
  optimize: boolean,
): { groups: PenGroup[]; stats: PlotStats } {
  bounded(
    settings.marginMm,
    'Margin',
    0,
    Math.min(pageWidthMm, pageHeightMm) / 2 - 0.1,
  );
  bounded(settings.penDiameterMm, 'Pen diameter', 0.01, 10);
  bounded(settings.maxErrorMm, 'Maximum error', 0, 1);
  bounded(settings.minimumGapMm, 'Minimum clearance', 0, 10);
  bounded(settings.drawSpeed, 'Draw speed', 0.1, 1000);
  bounded(settings.travelSpeed, 'Travel speed', 0.1, 1000);
  bounded(settings.liftSeconds, 'Lift time', 0, 60);
  const mmX = pageWidthMm / width,
    mmY = pageHeightMm / height;
  // Reserve half a pen width as well as the margin, keeping all ink inside it.
  const inset = settings.marginMm + settings.penDiameterMm / 2;
  const output: PenGroup[] = [];
  const stats: PlotStats = {
    strokes: 0,
    penLifts: 0,
    inkMm: 0,
    travelMm: 0,
    estimatedSeconds: 0,
  };
  for (const group of groups) {
    assertPaths(group.paths);
    let paths: ln.Paths = [];
    const seen = new Set<string>();
    const key = (p: ln.Vector) => `${p.x.toFixed(8)},${p.y.toFixed(8)}`;
    for (const original of group.paths) {
      const source = original.map(
        (v) => new ln.Vector(v.x * mmX, v.y * mmY, 0),
      );
      let stroke: ln.Vector[] = [];
      const flush = () => {
        if (stroke.length >= 2)
          paths.push(simplifyPath(stroke, settings.maxErrorMm));
        stroke = [];
      };
      for (let i = 1; i < source.length; i++) {
        const clipped = clipPaper(
          source[i - 1],
          source[i],
          inset,
          inset,
          pageWidthMm - inset,
          pageHeightMm - inset,
        );
        if (!clipped || distance(...clipped) < 1e-9) {
          flush();
          continue;
        }
        const [a, b] = clipped,
          forward = `${key(a)}|${key(b)}`,
          backward = `${key(b)}|${key(a)}`;
        if (
          settings.removeDuplicates &&
          (seen.has(forward) || seen.has(backward))
        ) {
          flush();
          continue;
        }
        seen.add(forward);
        if (stroke.length && distance(stroke[stroke.length - 1], a) > 1e-7)
          flush();
        if (!stroke.length) stroke.push(a);
        stroke.push(b);
      }
      flush();
    }
    if (optimize)
      paths = optimizePathOrder(paths, {
        allowReverse: !settings.lockDirection,
      });
    if (settings.joinTouching) {
      const degrees = new Map<string, number>();
      for (const path of paths)
        for (const endpoint of [path[0], path[path.length - 1]])
          degrees.set(key(endpoint), (degrees.get(key(endpoint)) ?? 0) + 1);
      const joined: ln.Paths = [];
      for (const path of paths) {
        const prev = joined[joined.length - 1];
        if (
          prev &&
          degrees.get(key(path[0])) === 2 &&
          distance(prev[prev.length - 1], path[0]) < 1e-8
        )
          for (const p of path.slice(1)) prev.push(p);
        else joined.push([...path]);
      }
      paths = joined;
    }
    checkClearance(
      paths,
      settings.minimumGapMm > 0
        ? settings.minimumGapMm + settings.penDiameterMm
        : 0,
    );
    let current = new ln.Vector(inset, inset, 0);
    for (const path of paths) {
      stats.strokes++;
      stats.travelMm += distance(current, path[0]);
      for (let i = 1; i < path.length; i++)
        stats.inkMm += distance(path[i - 1], path[i]);
      current = path[path.length - 1];
    }
    output.push({
      pen: group.pen,
      paths: paths.map((path) =>
        path.map((p) => new ln.Vector(p.x / mmX, p.y / mmY, 0)),
      ),
    });
  }
  stats.penLifts = stats.strokes;
  stats.estimatedSeconds =
    stats.inkMm / settings.drawSpeed +
    stats.travelMm / settings.travelSpeed +
    stats.penLifts * settings.liftSeconds;
  return { groups: output, stats };
}
