import type * as ln from '@lnjs/core';

interface Endpoint {
  x: number;
  y: number;
  path: number;
  reverse: boolean;
  rank: number;
}

interface Tree {
  point: Endpoint;
  axis: 'x' | 'y';
  left: Tree | null;
  right: Tree | null;
  parent: Tree | null;
  remaining: number;
}

// Exact greedy nearest-neighbor ordering with a balanced endpoint k-d tree.
// Removing both endpoints of a visited path lets queries skip exhausted
// subtrees. Typical queries are sublinear; worst-case searches remain O(N).
// Tie-breaking matches the original linear search (input order, head first).
export function optimizePathOrder(
  input: ln.Paths,
  options: { allowReverse?: boolean } = {},
): ln.Paths {
  const paths = input.filter((p) => p.length >= 2);
  if (paths.length < 2) return paths;
  const endpoints = paths.flatMap((p, path) => [
    { x: p[0].x, y: p[0].y, path, reverse: false, rank: path * 2 },
    {
      x: p[p.length - 1].x,
      y: p[p.length - 1].y,
      path,
      reverse: true,
      rank: path * 2 + 1,
    },
  ]);
  if (endpoints.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    throw new Error('Cannot optimize paths with non-finite endpoints');
  }
  const locations: Tree[] = new Array(endpoints.length);
  function build(
    points: Endpoint[],
    depth: number,
    parent: Tree | null,
  ): Tree | null {
    if (!points.length) return null;
    const axis = depth % 2 ? 'y' : 'x';
    points.sort((a, b) => a[axis] - b[axis] || a.rank - b.rank);
    const mid = points.length >> 1;
    const node: Tree = {
      point: points[mid],
      axis,
      left: null,
      right: null,
      parent,
      remaining: points.length,
    };
    locations[node.point.rank] = node;
    node.left = build(points.slice(0, mid), depth + 1, node);
    node.right = build(points.slice(mid + 1), depth + 1, node);
    return node;
  }
  const root = build(endpoints, 0, null);
  const used = new Uint8Array(paths.length);
  function remove(path: number) {
    used[path] = 1;
    for (const rank of [path * 2, path * 2 + 1]) {
      let node: Tree | null = locations[rank];
      while (node) {
        node.remaining--;
        node = node.parent;
      }
    }
  }
  let start = 0;
  for (let i = 1; i < paths.length; i++) {
    if (paths[i][0].x + paths[i][0].y < paths[start][0].x + paths[start][0].y)
      start = i;
  }
  const result: ln.Paths = [paths[start]];
  remove(start);
  let current = paths[start][paths[start].length - 1];
  while (result.length < paths.length) {
    let best: Endpoint | null = null;
    let bestDistance = Infinity;
    function visit(node: Tree | null) {
      if (!node || !node.remaining) return;
      const p = node.point;
      if (!used[p.path] && (!p.reverse || options.allowReverse !== false)) {
        const distance = (p.x - current.x) ** 2 + (p.y - current.y) ** 2;
        if (
          distance < bestDistance ||
          (distance === bestDistance && (!best || p.rank < best.rank))
        ) {
          best = p;
          bestDistance = distance;
        }
      }
      const delta = current[node.axis] - p[node.axis];
      visit(delta <= 0 ? node.left : node.right);
      if (delta * delta <= bestDistance)
        visit(delta <= 0 ? node.right : node.left);
    }
    visit(root);
    // The tree has at least one live endpoint until all paths are emitted.
    const next = best as Endpoint | null;
    if (!next) break;
    const path = next.reverse
      ? [...paths[next.path]].reverse()
      : paths[next.path];
    result.push(path);
    current = path[path.length - 1];
    remove(next.path);
  }
  return result;
}
