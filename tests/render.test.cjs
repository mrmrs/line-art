const { test } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const load = (name) => require(join(process.env.AUDIT_TEST_OUTPUT, name));
const ln = require('@lnjs/core');
const { optimizePathOrder } = load('plotter-optimize.js');
const { BVH } = load('bvh.js');
const { tessellateCube } = load('tessellate.js');
const { generatePointCloud } = load('point-cloud.js');
const {
  renderScene,
  renderScenePerPen,
  multiPenSvg,
  clearMeshCache,
  clearGeneratorCache,
} = load('render.js');
const { generateCubeGrid, noise3d } = load('cube-grid.js');
const {
  DEFAULT_TRANSFORM,
  DEFAULT_SLICING,
  DEFAULT_RENDER_SETTINGS,
  DEFAULT_CUBE_GRID_PARAMS,
  makeDefaultFill,
} = load('types.js');
const camera = {
  name: 'Test',
  eye: [6, 5, 7],
  center: [0, 0, 0],
  up: [0, 0, 1],
  ortho: true,
  orthoSize: 3,
  fovy: 45,
};
const settings = { ...DEFAULT_RENDER_SETTINGS, step: 0.2 };
const cube = (params) => ({
  id: 'cube',
  type: 'cube',
  visible: true,
  name: 'Cube',
  params,
  transform: DEFAULT_TRANSFORM,
  slicing: DEFAULT_SLICING,
  fills: [makeDefaultFill('cross-hatch', 'hatch')],
});
const render = (node) => renderScene([node], camera, 160, 160, settings).svg;

function bruteOrder(paths) {
  const remaining = paths.map((p, i) => ({ p, i }));
  remaining.sort(
    (a, b) => a.p[0].x + a.p[0].y - (b.p[0].x + b.p[0].y) || a.i - b.i,
  );
  const result = [remaining.shift().p];
  remaining.sort((a, b) => a.i - b.i);
  while (remaining.length) {
    const end = result.at(-1).at(-1);
    let best = Infinity,
      index = 0,
      reverse = false;
    for (let i = 0; i < remaining.length; i++) {
      for (const flip of [false, true]) {
        const p = flip ? remaining[i].p.at(-1) : remaining[i].p[0];
        const d = (end.x - p.x) ** 2 + (end.y - p.y) ** 2;
        if (d < best) {
          best = d;
          index = i;
          reverse = flip;
        }
      }
    }
    const p = remaining.splice(index, 1)[0].p;
    result.push(reverse ? [...p].reverse() : p);
  }
  return result;
}
function fixture(count) {
  let seed = 42;
  const rand = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  return Array.from({ length: count }, () => {
    const x = Math.floor(rand() * 1000),
      y = Math.floor(rand() * 1000);
    return [
      new ln.Vector(x, y, 0),
      new ln.Vector(
        x + Math.floor(rand() * 10),
        y + Math.floor(rand() * 10),
        0,
      ),
    ];
  });
}
test('indexed optimizer matches exhaustive greedy ordering, ties and reversals; does not mutate', () => {
  for (const paths of [
    fixture(600),
    Array.from({ length: 50 }, () => [
      new ln.Vector(0, 0, 0),
      new ln.Vector(1, 1, 0),
    ]),
  ]) {
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
  assert.ok(
    bvh
      .intersect({ x: -2, y: 1, z: 0 }, { x: 1, y: 0, z: 0 })
      .every((h) => Number.isFinite(h.t)),
  );
  assert.equal(
    bvh.intersect({ x: -2, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }).length,
    0,
  );
});
test('warm fill caches match cold renders after geometry and transform changes', () => {
  const first = cube({ min: [-1, -1, -1], max: [1, 1, 1] });
  render(first);
  for (const changed of [
    cube({ min: [-0.4, -0.5, -0.6], max: [0.4, 0.5, 0.6] }),
    { ...first, transform: { ...DEFAULT_TRANSFORM, translate: [0.5, 0, 0] } },
  ]) {
    const warm = render(changed);
    clearMeshCache();
    clearGeneratorCache();
    assert.equal(warm, render(changed));
  }
});
test('mesh source replacement under the same node ID invalidates parsed geometry', () => {
  const node = {
    ...cube({}),
    type: 'mesh',
    fills: [],
    params: {
      format: 'obj',
      fileName: 'triangle.obj',
      data: 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3',
    },
  };
  render(node);
  const changed = {
    ...node,
    params: { ...node.params, data: 'v 0 0 0\nv 1 0 0\nv 0 0 1\nf 1 2 3' },
  };
  const warm = render(changed);
  clearMeshCache();
  assert.equal(warm, render(changed));
});
test('outlines remain on pen 1 when the only fill uses pen 2', () => {
  const node = cube({ min: [-1, -1, -1], max: [1, 1, 1] });
  node.fills[0].pen = 2;
  const { penGroups } = renderScenePerPen([node], camera, 160, 160, settings);
  assert.deepEqual(
    penGroups.map((g) => g.pen),
    [1, 2],
  );
  const svg = multiPenSvg(
    penGroups,
    160,
    160,
    settings,
    {},
    { width: '210mm', height: '297mm' },
  );
  assert.match(svg, /width="210mm" height="297mm"/);
  assert.match(svg, /id="pen-2"/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});
test('point-cloud edge cases remain finite and terminate', () => {
  assert.deepEqual(generatePointCloud('fibonacci-sphere', 1, 2, 1), [
    [2, 0, 0],
  ]);
  assert.equal(generatePointCloud('grid', 1, 0.25, -1).length, 27);
});
test('compiled expressions preserve size and presence semantics; noise survives cache eviction', () => {
  const params = {
    ...DEFAULT_CUBE_GRID_PARAMS,
    countX: 3,
    countY: 3,
    countZ: 3,
    sizeMethod: 'expression',
    sizeExpression: '0.5',
    presenceMethod: 'expression',
    presenceExpression: 'ix === 1',
  };
  assert.equal(generateCubeGrid(params).length, 9);
  assert.equal(
    generateCubeGrid({ ...params, presenceExpression: '(' }).length,
    27,
  );
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
  console.log(
    `10,000 strokes: brute ${baseline.toFixed(1)}ms; indexed ${indexed.toFixed(1)}ms; ${(baseline / indexed).toFixed(1)}x speedup`,
  );
});
test('orthographic projection preserves proportions on rectangular pages', () => {
  const node = { ...cube({ min: [-1, -1, -1], max: [1, 1, 1] }), fills: [] };
  const svg = renderScene(
    [node],
    { ...camera, eye: [0, 0, 6], up: [0, 1, 0] },
    320,
    160,
    settings,
  ).svg;
  const points = [...svg.matchAll(/points="([^"]+)"/g)].flatMap((m) =>
    m[1].split(' ').map((p) => p.split(',').map(Number)),
  );
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  assert.ok(points.length > 0);
  assert.ok(
    Math.abs(
      Math.max(...xs) - Math.min(...xs) - (Math.max(...ys) - Math.min(...ys)),
    ) < 0.03,
  );
});
test('stipple regeneration is deterministic and cross-hatches span shared face diagonals', () => {
  const { buildFillHost, generateFillPaths } = load('fills.js');
  const host = buildFillHost(
    tessellateCube({ min: [-1, -1, -1], max: [1, 1, 1] }),
  );
  const fill = {
    ...makeDefaultFill('stipple', 's'),
    density: 10,
    surfaceMode: false,
  };
  const paths = generateFillPaths(fill, host);
  assert.ok(paths.length > 0);
  assert.deepEqual(paths, generateFillPaths(fill, host));
  const hatches = generateFillPaths(
    { ...makeDefaultFill('cross-hatch', 'h'), spacing: 2 },
    host,
  );
  assert.equal(hatches.length, 1);
  assert.equal(hatches[0][1].z - hatches[0][0].z, 2);
});
test('direct line-grid paths use the same rectangular projection as scene shapes', () => {
  const { DEFAULT_LINE_GRID_PARAMS } = load('types.js');
  const node = {
    ...cube({}),
    type: 'line-grid',
    fills: [],
    params: {
      ...DEFAULT_LINE_GRID_PARAMS,
      countX: 2,
      countY: 1,
      spacing: 1,
      lineAxis: 'x',
      lineLength: 2,
    },
  };
  const svg = renderScene(
    [node],
    { ...camera, eye: [0, 0, 6], up: [0, 1, 0] },
    320,
    160,
    settings,
  ).svg;
  const points = [...svg.matchAll(/points="([^"]+)"/g)].flatMap((m) =>
    m[1].split(' ').map((p) => p.split(',').map(Number)),
  );
  assert.deepEqual(
    [...new Set(points.map((p) => +p[1].toFixed(2)))].sort((a, b) => a - b),
    [66.67, 93.33],
  );
});
test('surface stipples lie on mesh faces, including flat meshes', () => {
  const { buildFillHost, generateFillPaths } = load('fills.js');
  const host = buildFillHost(
    tessellateCube({ min: [-1, -1, -1], max: [1, 1, 1] }),
  );
  const paths = generateFillPaths(
    {
      ...makeDefaultFill('stipple', 'surface'),
      density: 10,
      surfaceMode: true,
    },
    host,
  );
  assert.ok(paths.length > 0);
  for (const path of paths) {
    const center = {
      x: (path[0].x + path[1].x) / 2,
      y: (path[0].y + path[1].y) / 2,
      z: (path[0].z + path[1].z) / 2,
    };
    assert.ok(
      Math.abs(
        Math.max(Math.abs(center.x), Math.abs(center.y), Math.abs(center.z)) -
          1,
      ) < 1e-6,
    );
  }
});
test('engine rejects invalid work and unsafe expressions', () => {
  const node = cube({ min: [-1, -1, -1], max: [1, 1, 1] });
  assert.throws(
    () => renderScene([node], camera, 160, 160, { ...settings, step: 0 }),
    /step/i,
  );
  const fn = {
    ...node,
    type: 'function',
    params: {
      expression: 'globalThis.fetch("https://example.com")',
      bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
      direction: 'above',
    },
  };
  assert.throws(() => render(fn), /expression|unknown|allowed/i);
});
test('direct paths clip at the frustum and obey optional occlusion', () => {
  const { DEFAULT_LINE_GRID_PARAMS } = load('types.js');
  const occluder = {
    ...cube({ min: [-1, -1, -1], max: [1, 1, 1] }),
    fills: [],
  };
  const line = {
    ...cube({}),
    id: 'line',
    type: 'line-grid',
    fills: [],
    params: {
      ...DEFAULT_LINE_GRID_PARAMS,
      countX: 1,
      countY: 1,
      lineAxis: 'x',
      lineLength: 1,
    },
    transform: { ...DEFAULT_TRANSFORM, translate: [0, 0, -2] },
    pathVisibility: 'occluded',
  };
  const view = { ...camera, eye: [0, 0, 6], up: [0, 1, 0] };
  const { computeProjectedPaths } = load('render.js');
  assert.deepEqual(
    computeProjectedPaths([occluder, line], view, 160, 160, settings),
    computeProjectedPaths([occluder], view, 160, 160, settings),
  );
  assert.ok(
    computeProjectedPaths(
      [{ ...line, pathVisibility: 'through' }],
      view,
      160,
      160,
      settings,
    ).length > 0,
  );
  assert.equal(
    computeProjectedPaths(
      [{ ...line, transform: { ...DEFAULT_TRANSFORM, translate: [0, 0, 10] } }],
      { ...view, ortho: false },
      160,
      160,
      settings,
    ).length,
    0,
  );
  const crossing = {
    ...line,
    pathVisibility: 'through',
    params: { ...line.params, lineAxis: 'z', lineLength: 30 },
    transform: { ...DEFAULT_TRANSFORM, translate: [0.5, 0, 0] },
  };
  const paths = computeProjectedPaths(
    [crossing],
    { ...view, ortho: false },
    160,
    160,
    settings,
  );
  assert.ok(paths.length > 0);
  assert.ok(
    paths
      .flat()
      .every(
        (p) =>
          p.x >= -1e-6 &&
          p.x <= 160 + 1e-6 &&
          p.y >= -1e-6 &&
          p.y <= 160 + 1e-6,
      ),
  );
});
test('expression parser permits math but cannot access JavaScript', () => {
  const { compileExpression } = load('expression.js');
  assert.equal(
    compileExpression('x > 0 ? Math.sqrt(x ** 2) : 0', ['x'])({ x: 3 }),
    3,
  );
  assert.equal(compileExpression('Math.PI', ['x'])({ x: 0 }), Math.PI);
  for (const source of [
    'globalThis',
    'Math.constructor',
    'x=1',
    '(()=>1)()',
    'while(true){}',
    'Math.random()',
    '1;2',
    '('.repeat(40) + '1' + ')'.repeat(40),
  ])
    assert.throws(() => compileExpression(source, ['x']));
  assert.throws(() => compileExpression('1/0', [])({}), /finite/);
});
test('STL parser rejects truncated counts and non-finite vertices', () => {
  const { parseSTL } = load('stl-loader.js');
  assert.throws(() => parseSTL(new ArrayBuffer(20)), /header/);
  const data = new ArrayBuffer(134),
    view = new DataView(data);
  view.setUint32(80, 2, true);
  assert.throws(() => parseSTL(data), /size/);
  view.setUint32(80, 1, true);
  view.setFloat32(96, NaN, true);
  assert.throws(() => parseSTL(data), /finite/);
});
test('Boolean import remaps references and rejects cycles or missing children', () => {
  const { remapNodes } = load('scene-file.js');
  let id = 0;
  const a = cube({ min: [-1, -1, -1], max: [1, 1, 1] }),
    b = { ...a, id: 'second' },
    boolean = {
      ...a,
      id: 'bool',
      type: 'boolean',
      params: { operation: 'union', childIds: [a.id, b.id] },
    };
  const next = remapNodes([a, b, boolean], () => `new-${++id}`);
  assert.deepEqual(next[2].params.childIds, [next[0].id, next[1].id]);
  assert.deepEqual(boolean.params.childIds, ['cube', 'second']);
  assert.throws(() => remapNodes([a, boolean], () => `new-${++id}`), /Missing/);
  assert.throws(
    () =>
      remapNodes(
        [
          a,
          {
            ...boolean,
            params: { operation: 'union', childIds: ['bool', 'cube'] },
          },
        ],
        () => `new-${++id}`,
      ),
    /cycle/,
  );
});
test('IndexedDB round-trip retains meshes and scene file round-trip is versioned', async () => {
  require('fake-indexeddb/auto');
  const { saveScene, loadScene } = load('persistence.js');
  const { serializeScene, parseScene } = load('scene-file.js');
  const { CAMERA_PRESETS } = load('cameras.js');
  const mesh = {
    ...cube({}),
    type: 'mesh',
    fills: [],
    params: {
      format: 'obj',
      fileName: 'a.obj',
      data: 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3',
    },
  };
  const scene = {
    nodes: [mesh],
    cameras: CAMERA_PRESETS,
    renderSettings: settings,
    activeCameraIndex: 0,
    viewMode: 'single',
  };
  await saveScene(scene);
  assert.deepEqual(await loadScene(), scene);
  assert.deepEqual(parseScene(serializeScene(scene)), scene);
  assert.throws(
    () => parseScene('{"format":"ln-studio","version":2}'),
    /version/,
  );
});
test('import/undo/redo preserves a Boolean scene and saves restored assets', async () => {
  require('fake-indexeddb/auto');
  global.localStorage = { getItem: () => null };
  const { useSceneStore, storageReady, flushSceneSave } = load('store.js');
  await storageReady;
  const before = useSceneStore.getState().nodes;
  const a = cube({ min: [-1, -1, -1], max: [1, 1, 1] }),
    b = { ...a, id: 'second' },
    boolean = {
      ...a,
      id: 'bool',
      type: 'boolean',
      params: { operation: 'union', childIds: ['cube', 'second'] },
    };
  useSceneStore.getState().loadNodes([a, b, boolean]);
  const imported = useSceneStore.getState().nodes;
  assert.equal(imported.length, 3);
  useSceneStore.temporal.getState().undo();
  assert.deepEqual(useSceneStore.getState().nodes, before);
  useSceneStore.temporal.getState().redo();
  assert.deepEqual(useSceneStore.getState().nodes, imported);
  await flushSceneSave();
  assert.deepEqual((await load('persistence.js').loadScene()).nodes, imported);
});
test('latest render scheduler never runs an old final after a newer draft', async () => {
  const { LatestRender } = load('latest-render.js');
  const events = [];
  let release;
  const gate = new Promise((r) => (release = r));
  const queue = new LatestRender(
    async (value, current) => {
      events.push(`draft-${value}`);
      if (value === 1) await gate;
      if (current()) events.push(`final-${value}`);
    },
    (e) => {
      throw e;
    },
  );
  queue.submit(1);
  await new Promise((r) => setTimeout(r, 5));
  queue.submit(2);
  release();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(events, ['draft-1', 'draft-2', 'final-2']);
});
test('physical cleanup clips margins, deduplicates, joins without bridging gaps and respects direction', () => {
  const { preparePlot, simplifyPath, checkClearance } = load('plot-output.js');
  const { DEFAULT_PLOT_SETTINGS } = load('plot-settings.js');
  const v = (x, y) => new ln.Vector(x, y, 0);
  const plot = {
    ...DEFAULT_PLOT_SETTINGS,
    marginMm: 10,
    penDiameterMm: 0.2,
    maxErrorMm: 0,
  };
  const paths = [
    [v(0, 50), v(50, 50)],
    [v(50, 50), v(90, 50)],
    [v(0, 50), v(50, 50)],
    [v(90.01, 50), v(100, 50)],
  ];
  const result = preparePlot(
    [{ pen: 1, paths }],
    100,
    100,
    100,
    100,
    plot,
    false,
  );
  assert.equal(result.groups[0].paths.length, 1);
  assert.ok(
    result.groups[0].paths.flat().every((p) => p.x >= 10.1 && p.x <= 89.9),
  );
  assert.ok(result.stats.inkMm > 79 && result.stats.inkMm < 80);
  const gap = preparePlot(
    [
      {
        pen: 1,
        paths: [
          [v(20, 20), v(30, 20)],
          [v(30.01, 20), v(40, 20)],
        ],
      },
    ],
    100,
    100,
    100,
    100,
    plot,
    false,
  );
  assert.equal(gap.groups[0].paths.length, 2);
  const locked = optimizePathOrder(
    [
      [v(0, 0), v(2, 0)],
      [v(8, 0), v(3, 0)],
    ],
    { allowReverse: false },
  );
  assert.equal(locked[1][0].x, 8);
  const closed = [v(0, 0), v(1, 0), v(1, 1), v(0, 1), v(0, 0)];
  const simple = simplifyPath(closed, 0.01);
  assert.deepEqual(simple[0], simple.at(-1));
  assert.ok(simple.length >= 4);
  assert.throws(
    () =>
      checkClearance(
        [
          [v(0, 0), v(10, 0)],
          [v(0, 0.05), v(10, 0.05)],
        ],
        0.1,
      ),
    /clearance/,
  );
});
test('nonzero and even-odd fills handle nested contour directions', () => {
  const { filledRings } = load('svg-parse.js');
  const outer = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    inner = [
      [2, 2],
      [8, 2],
      [8, 8],
      [2, 8],
      [2, 2],
    ];
  assert.equal(filledRings([outer, inner], 'nonzero')[0].length, 1);
  assert.equal(filledRings([outer, inner], 'evenodd')[0].length, 2);
  assert.equal(
    filledRings([outer, [...inner].reverse()], 'nonzero')[0].length,
    2,
  );
});
test('positive and negative function surfaces produce finite bounded paths', () => {
  const { HeightField } = load('height-field.js');
  const box = new ln.Box(new ln.Vector(-1, -1, -1), new ln.Vector(1, 1, 1));
  const field = new HeightField(
    (x, y) => Math.sin(x) * Math.cos(y),
    box,
    false,
  );
  assert.ok(field.paths().length > 0);
  assert.ok(
    field
      .paths()
      .flat()
      .every((p) => box.contains(p)),
  );
  assert.equal(field.contains(new ln.Vector(0, 0, -0.5)), true);
  assert.equal(field.contains(new ln.Vector(0, 0, 0.5)), false);
});
test('Boolean depth and expanded work remain bounded even for cached shared children', () => {
  const { validateGraph } = load('limits.js');
  const a = cube({ min: [-1, -1, -1], max: [1, 1, 1] });
  const nodes = [a];
  for (let i = 0; i < 40; i++)
    nodes.push({
      ...a,
      id: `b-${i}`,
      type: 'boolean',
      params: { operation: 'union', childIds: [nodes.at(-1).id, a.id] },
    });
  assert.throws(() => validateGraph(nodes), /budget|recursion/);
  const shared = [a];
  for (let i = 0; i < 10; i++)
    shared.push({
      ...a,
      id: `s-${i}`,
      type: 'boolean',
      params: {
        operation: 'union',
        childIds: [shared.at(-1).id, shared.at(-1).id],
      },
    });
  assert.throws(() => validateGraph(shared), /budget/);
});

test('heightmap octave work is bounded before generation', () => {
  const { validateNodes } = load('limits.js');
  const node = { ...cube({}), type: 'cube-grid', params: { ...DEFAULT_CUBE_GRID_PARAMS, heightmapOctaves: 1000000000 } };
  assert.throws(() => validateNodes([node]), /heightmapOctaves/);
});
