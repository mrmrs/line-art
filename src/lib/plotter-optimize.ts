import * as ln from '@lnjs/core';

// =============================================================================
// Greedy nearest-neighbor path order optimization for plotter output.
//
// Reorders an array of polylines so the pen-up travel between consecutive
// strokes is minimized. Each polyline may be reversed if its tail is closer
// to the previous end than its head. Optimal-TSP this is not, but greedy NN
// typically cuts plotter time 30–60% on real scenes and is O(N²) — fine for
// a few thousand paths.
// =============================================================================

export function optimizePathOrder(paths: ln.Paths): ln.Paths {
  if (paths.length < 2) return paths;
  // Pre-extract endpoints (avoid touching Vector internals in inner loop)
  const heads: Array<{ x: number; y: number }> = [];
  const tails: Array<{ x: number; y: number }> = [];
  for (const p of paths) {
    heads.push({ x: p[0].x, y: p[0].y });
    tails.push({ x: p[p.length - 1].x, y: p[p.length - 1].y });
  }

  const used = new Array(paths.length).fill(false);
  const order: { idx: number; reverse: boolean }[] = [];

  // Start at the path with smallest head (top-left-ish) to be deterministic
  let startIdx = 0;
  let bestScore = Infinity;
  for (let i = 0; i < paths.length; i++) {
    const s = heads[i].x + heads[i].y;
    if (s < bestScore) { bestScore = s; startIdx = i; }
  }
  used[startIdx] = true;
  order.push({ idx: startIdx, reverse: false });
  let cur = tails[startIdx];

  for (let i = 1; i < paths.length; i++) {
    let bestIdx = -1, bestReverse = false, bestDist = Infinity;
    for (let j = 0; j < paths.length; j++) {
      if (used[j]) continue;
      const dh = (heads[j].x - cur.x) ** 2 + (heads[j].y - cur.y) ** 2;
      const dt = (tails[j].x - cur.x) ** 2 + (tails[j].y - cur.y) ** 2;
      if (dh < bestDist) { bestDist = dh; bestIdx = j; bestReverse = false; }
      if (dt < bestDist) { bestDist = dt; bestIdx = j; bestReverse = true; }
    }
    if (bestIdx === -1) break;
    used[bestIdx] = true;
    order.push({ idx: bestIdx, reverse: bestReverse });
    cur = bestReverse ? heads[bestIdx] : tails[bestIdx];
  }

  const result: ln.Paths = [];
  for (const o of order) {
    const p = paths[o.idx];
    result.push(o.reverse ? [...p].reverse() : p);
  }
  return result;
}
