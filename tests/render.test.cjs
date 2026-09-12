const { test } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const load = (name) => require(join(process.env.AUDIT_TEST_OUTPUT, name));
const ln = require('@lnjs/core');
const { optimizePathOrder } = load('plotter-optimize.js');
const { BVH } = load('bvh.js');
const { tessellateCube } = load('tessellate.js');
const { generatePointCloud } = load('point-cloud.js');
const { renderScene, renderScenePerPen, multiPenSvg, clearMeshCache, clearGeneratorCache } = load('render.js');
const { generateCubeGrid, noise3d } = load('cube-grid.js');
const { DEFAULT_TRANSFORM, DEFAULT_SLICING, DEFAULT_RENDER_SETTINGS, DEFAULT_CUBE_GRID_PARAMS, makeDefaultFill } = load('types.js');
const camera = { name: 'Test', eye: [6, 5, 7], center: [0, 0, 0], up: [0, 0, 1], ortho: true, orthoSize: 3, fovy: 45 };
const settings = { ...DEFAULT_RENDER_SETTINGS, step: 0.2 };
const cube = (params) => ({ id: 'cube', type: 'cube', visible: true, name: 'Cube', params,
  transform: DEFAULT_TRANSFORM, slicing: DEFAULT_SLICING, fills: [makeDefaultFill('cross-hatch', 'hatch')] });
const render = (node) => renderScene([node], camera, 160, 160, settings).svg;

function bruteOrder(paths) {
  const remaining = paths.map((p, i) => ({ p, i }));
  remaining.sort((a, b) => (a.p[0].x + a.p[0].y) - (b.p[0].x + b.p[0].y) || a.i - b.i);
  const result = [remaining.shift().p];
  remaining.sort((a, b) => a.i - b.i);
  while (remaining.length) {
    const end = result.at(-1).at(-1);
    let best = Infinity, index = 0, reverse = false;
    for (let i = 0; i < remaining.length; i++) {
      for (const flip of [false, true]) {
        const p = flip ? remaining[i].p.at(-1) : remaining[i].p[0];
        const d = (end.x - p.x) ** 2 + (end.y - p.y) ** 2;
        if (d < best) { best = d; index = i; reverse = flip; }
      }
    }
    const p = remaining.splice(index, 1)[0].p;
    result.push(reverse ? [...p].reverse() : p);
  }
  return result;
}
function fixture(count) {
  let seed = 42;
  const rand = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 2 ** 32);
  return Array.from({ length: count }, () => {
    const x = Math.floor(rand() * 1000), y = Math.floor(rand() * 1000);
    return [new ln.Vector(x, y, 0), new ln.Vector(x + Math.floor(rand() * 10), y + Math.floor(rand() * 10), 0)];
  });
}
test('indexed optimizer matches exhaustive greedy ordering, ties and reversals; does not mutate', () => {
  for (const paths of [fixture(600), Array.from({ length: 50 }, () => [new ln.Vector(0, 0, 0), new ln.Vector(1, 1, 0)])]) {
    const before = JSON.stringify(paths);
    assert.deepEqual(optimizePathOrder(paths), bruteOrder(paths));
    assert.equal(JSON.stringify(paths), before);
  }
  assert.deepEqual(optimizePathOrder([[], [new ln.Vector(0, 0, 0)]]), []);
});
test('mesh containment counts shared triangle edges once and handles parallel rays', () => {
  const bvh = new BVH(tessellateCube({ min: [-1, -1, -1], max: [1, 1, 1] }));
  assert.equal(bvh.containsPoint({ x: 0, y: 0, z: 0 }), true);
  assert.equal(bvh.containsPoint({ x: -2, y: 0, z: 0 }), false);
  assert.equal(bvh.containsPoint({ x: 0, y: 2, z: 0 }), false);
  assert.ok(bvh.intersect({ x: -2, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }).every((h) => Number.isFinite(h.t)));
  assert.equal(bvh.intersect({ x: -2, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }).length, 0);
});
test('warm fill caches match cold renders after geometry and transform changes', () => {
  const first = cube({ min: [-1, -1, -1], max: [1, 1, 1] });
  render(first);
  for (const changed of [cube({ min: [-0.4, -0.5, -0.6], max: [0.4, 0.5, 0.6] }),
    { ...first, transform: { ...DEFAULT_TRANSFORM, translate: [0.5, 0, 0] } }]) {
    const warm = render(changed);
    clearMeshCache(); clearGeneratorCache();
    assert.equal(warm, render(changed));
  }
});
test('mesh source replacement under the same node ID invalidates parsed geometry', () => {
  const node = { ...cube({}), type: 'mesh', fills: [], params: { format: 'obj', fileName: 'triangle.obj', data: 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3' } };
  render(node);
  const changed = { ...node, params: { ...node.params, data: 'v 0 0 0\nv 1 0 0\nv 0 0 1\nf 1 2 3' } };
  const warm = render(changed);
  clearMeshCache();
  assert.equal(warm, render(changed));
});
test('outlines remain on pen 1 when the only fill uses pen 2', () => {
  const node = cube({ min: [-1, -1, -1], max: [1, 1, 1] });
  node.fills[0].pen = 2;
  const { penGroups } = renderScenePerPen([node], camera, 160, 160, settings);
  assert.deepEqual(penGroups.map((g) => g.pen), [1, 2]);
  const svg = multiPenSvg(penGroups, 160, 160, settings, {}, { width: '210mm', height: '297mm' });
  assert.match(svg, /width="210mm" height="297mm"/);
  assert.match(svg, /id="pen-2"/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});
test('point-cloud edge cases remain finite and terminate', () => {
  assert.deepEqual(generatePointCloud('fibonacci-sphere', 1, 2, 1), [[2, 0, 0]]);
  assert.equal(generatePointCloud('grid', 1, 0.25, -1).length, 27);
});
test('compiled expressions preserve size and presence semantics; noise survives cache eviction', () => {
  const params = { ...DEFAULT_CUBE_GRID_PARAMS, countX: 3, countY: 3, countZ: 3, sizeMethod: 'expression', sizeExpression: '0.5', presenceMethod: 'expression', presenceExpression: 'ix === 1' };
  assert.equal(generateCubeGrid(params).length, 9);
  assert.equal(generateCubeGrid({ ...params, presenceExpression: '(' }).length, 27);
  const before = noise3d(0.3, 0.7, 0.9, 42);
  for (let seed = 100; seed < 200; seed++) noise3d(0.3, 0.7, 0.9, seed);
  assert.equal(noise3d(0.3, 0.7, 0.9, 42), before);
});
test('path-order benchmark (reports time, no machine-dependent threshold)', () => {
  const paths = fixture(10000);
  const start = performance.now();
  const expected = bruteOrder(paths);
  const baseline = performance.now() - start;
  const indexedStart = performance.now();
  const actual = optimizePathOrder(paths);
  const indexed = performance.now() - indexedStart;
  assert.deepEqual(actual, expected);
  console.log(`10,000 strokes: brute ${baseline.toFixed(1)}ms; indexed ${indexed.toFixed(1)}ms; ${(baseline / indexed).toFixed(1)}x speedup`);
});
test('orthographic projection preserves proportions on rectangular pages', () => {
  const node = { ...cube({ min: [-1, -1, -1], max: [1, 1, 1] }), fills: [] };
  const svg = renderScene([node], { ...camera, eye: [0, 0, 6], up: [0, 1, 0] }, 320, 160, settings).svg;
  const points = [...svg.matchAll(/points="([^"]+)"/g)].flatMap((m) => m[1].split(' ').map((p) => p.split(',').map(Number)));
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  assert.ok(points.length > 0);
  assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) - (Math.max(...ys) - Math.min(...ys))) < 0.03);
});
test('stipple regeneration is deterministic and cross-hatches span shared face diagonals', () => {
  const { buildFillHost, generateFillPaths } = load('fills.js');
  const host = buildFillHost(tessellateCube({ min: [-1, -1, -1], max: [1, 1, 1] }));
  const fill = { ...makeDefaultFill('stipple', 's'), density: 10, surfaceMode: false };
  const paths = generateFillPaths(fill, host);
  assert.ok(paths.length > 0);
  assert.deepEqual(paths, generateFillPaths(fill, host));
  const hatches = generateFillPaths({ ...makeDefaultFill('cross-hatch', 'h'), spacing: 2 }, host);
  assert.equal(hatches.length, 1);
  assert.equal(hatches[0][1].z - hatches[0][0].z, 2);
});
test('direct line-grid paths use the same rectangular projection as scene shapes', () => {
  const { DEFAULT_LINE_GRID_PARAMS } = load('types.js');
  const node = { ...cube({}), type: 'line-grid', fills: [], params: { ...DEFAULT_LINE_GRID_PARAMS, countX: 2, countY: 1, spacing: 1, lineAxis: 'x', lineLength: 2 } };
  const svg = renderScene([node], { ...camera, eye: [0, 0, 6], up: [0, 1, 0] }, 320, 160, settings).svg;
  const points = [...svg.matchAll(/points="([^"]+)"/g)].flatMap((m) => m[1].split(' ').map((p) => p.split(',').map(Number)));
  assert.deepEqual([...new Set(points.map((p) => p[1]))].sort((a, b) => a - b), [66.67, 93.33]);
});
