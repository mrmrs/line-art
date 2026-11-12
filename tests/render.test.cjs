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

test("continuous occlusion handles thin blockers, orthographic rays and height-field boundary roots", () => {
  const { projectPaths } = require(
    `${process.env.AUDIT_TEST_OUTPUT}/projection.js`,
  );
  const { HeightField } = require(
    `${process.env.AUDIT_TEST_OUTPUT}/height-field.js`,
  );
  const v = (x, y, z) => new ln.Vector(x, y, z);
  const eye = v(0, 0, 10);
  const matrix = ln
    .lookAt(eye, v(0, 0, 0), v(0, 1, 0))
    .orthographic(-2, 2, -2, 2, 0.1, 100);
  const scene = new ln.Scene();
  scene.add(new ln.Cube(v(0.049, -0.1, 0.9), v(0.051, 0.1, 1.1)));
  scene.compile();
  const paths = projectPaths(
    [[v(-1, 0, 0), v(1, 0, 0)]],
    matrix,
    eye,
    800,
    800,
    0.1,
    scene,
  );
  assert.equal(paths.length, 2);
  assert.ok(Math.abs(paths[0].at(-1).x - 409.8) < 1e-8);
  assert.ok(Math.abs(paths[1][0].x - 410.2) < 1e-8);
  const field = new HeightField(
    () => 0,
    new ln.Box(v(-1, -1, 0), v(1, 1, 2)),
    false,
  );
  assert.ok(
    Math.abs(field.intersect(new ln.Ray(v(0.2, 0.3, 2), v(0, 0, -1))).t - 2) <
      1e-8,
  );
});

test('SVG serialization drops fragments that collapse to a dot', () => {
  const { toStyledSVG, multiPenSvg } = load('svg-output.js');
  const paths = [[new ln.Vector(1, 1, 0), new ln.Vector(1 + 1e-9, 1, 0)]];
  assert.ok(!toStyledSVG(paths, 100, 100, settings).includes('<polyline'));
  assert.ok(!multiPenSvg([{ pen: 1, paths }], 100, 100, settings).includes('<polyline'));
});

test('vendored Boolean clipping preserves subpixel windows through app projection', () => {
  const { projectPaths } = load('projection.js');
  const v = (x, y, z) => new ln.Vector(x, y, z);
  const eye = v(0, 0, 10);
  const matrix = ln.lookAt(eye, v(0, 0, 0), v(0, 1, 0)).orthographic(-2, 2, -2, 2, 0.1, 100);
  const scene = new ln.Scene();
  scene.add(new ln.BooleanShape(ln.CSGOperation.Difference,
    new ln.Cube(v(-1, -1, 1), v(1, 1, 2)),
    new ln.Cube(v(0.051, -2, 0), v(0.051001, 2, 3))));
  scene.compile();
  const paths = projectPaths([[v(-1.5, 0, 0), v(1.5, 0, 0)]], matrix, eye, 800, 800, 100, scene);
  assert.equal(paths.length, 3);
  assert.ok(Math.abs(paths[1][0].x - 410.2) < 1e-9);
  assert.ok(Math.abs(paths[1].at(-1).x - 410.2002) < 1e-9);
});

test('Boolean graph rendering is identical at Fast and Ultra curve tolerances', () => {
  const a = { ...cube({ radius: 0.8, height: 1.5 }), id: 'cone', type: 'cone', fills: [] };
  const b = { ...cube({ min: [0.05, -2, -1], max: [0.2, 2, 3] }), id: 'cutter', fills: [] };
  const result = { ...a, id: 'result', type: 'boolean', params: { operation: 'difference', childIds: [a.id, b.id] } };
  const fast = renderScene([a, b, result], camera, 320, 320, { ...settings, curveTolerance: 1 }).svg;
  const ultra = renderScene([a, b, result], camera, 320, 320, { ...settings, curveTolerance: 0.025 }).svg;
  assert.equal(fast, ultra);
  assert.ok(fast.includes('polyline'));
  assert.ok(!/NaN|Infinity/.test(fast));
});

test('vendored contour generation draws the new circular boundary of a cut', () => {
  const { projectPaths } = load('projection.js');
  const v = (x, y, z) => new ln.Vector(x, y, z);
  const eye = v(0, 0, 5), matrix = ln.lookAt(eye, v(0, 0, 0), v(0, 1, 0)).orthographic(-2, 2, -2, 2, 0.1, 100);
  const scene = new ln.Scene();
  scene.add(new ln.BooleanShape(ln.CSGOperation.Difference,
    new ln.Sphere(v(0, 0, 0), 1), new ln.Cube(v(-2, -2, 0.23), v(2, 2, 2))));
  scene.compile();
  const result = projectPaths(scene.paths(), matrix, eye, 800, 800, 0.1, scene);
  const radius = 200 * Math.sqrt(1 - 0.23 ** 2);
  assert.ok(result.some(path => path.length > 20 && path[0].distance(path.at(-1)) < 1e-7 &&
    path.every(p => Math.abs(Math.hypot(p.x - 400, p.y - 400) - radius) < 1e-7)));
});

test('packed composition is repeatable, maintains physical clearance and protects quiet regions', () => {
  const { packComposition, footprint, quietFootprints } = load('composition.js');
  const { DEFAULT_COMPOSITION } = load('composition-types.js');
  const p = { ...DEFAULT_COMPOSITION, nesting: false, widthMm: 140, heightMm: 180, density: .6,
    motifs: ['prism', 'orb', 'frame', 'steps', 'cut-orb'],
    quiet: [{ id: 'clearing', x: 55, y: 65, width: 30, height: 40 }] };
  const a = packComposition(p), b = packComposition(p);
  assert.deepEqual(a, b);
  assert.ok(a.instances.length > 20);
  const polygons = a.instances.map(footprint);
  // Independent segment-distance oracle, rather than reusing the solver SAT.
  function pointSegment(p, a, b) {
    const dx=b[0]-a[0], dy=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
    return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
  }
  function inside(p, poly) {
    let c=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
      const a=poly[i],b=poly[j];
      if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;
    }
    return c;
  }
  for (let i=0;i<polygons.length;i++) {
    const poly=polygons[i];
    for(const [x,y] of poly) assert.ok(x>=p.marginMm && y>=p.marginMm && x<=p.widthMm-p.marginMm && y<=p.heightMm-p.marginMm);
    for(const other of [...polygons.slice(i+1),...quietFootprints(p)]) {
      assert.ok(!inside(poly[0],other) && !inside(other[0],poly));
      for(const [from,to] of [[poly,other],[other,poly]]) for(const v of from) for(let j=0;j<to.length;j++)
        assert.ok(pointSegment(v,to[j],to[(j+1)%to.length])>=p.clearanceMm-1e-7);
    }
  }
  console.log('Packing fixture:', a.instances.length, 'forms, coverage', a.coverage.toFixed(3), 'attempts', a.attempts);
});

test('packing preserves pinned instances, refill preserves all originals, and invalid pins fail without mutation', () => {
  const { packComposition } = load('composition.js');
  const { DEFAULT_COMPOSITION } = load('composition-types.js');
  const p = { ...DEFAULT_COMPOSITION, widthMm: 120, heightMm: 160, density: .3 };
  const initial = packComposition(p).instances;
  const pinned = { ...initial[0], pinned: true };
  const next = packComposition({ ...p, seed: 200, instances: [pinned] });
  assert.deepEqual(next.instances.find(i => i.id === pinned.id), pinned);
  const filled = packComposition({ ...p, density: .6, instances: initial }, true);
  assert.ok(filled.instances.length > initial.length);
  for(const i of initial) assert.deepEqual(filled.instances.find(x=>x.id===i.id),i);
  const before=JSON.stringify(pinned);
  assert.throws(()=>packComposition({...p, widthMm:40, instances:[pinned]}), /Kept forms/);
  assert.equal(JSON.stringify(pinned),before);
});

test('composition silhouettes contain transformed geometry and render through the standard plot pipeline', () => {
  const { footprint, compositionCamera, COMPOSITION_SCALE } = load('composition.js');
  const { compositionShapes } = load('composition-geometry.js');
  const { DEFAULT_COMPOSITION } = load('composition-types.js');
  for(const motif of ['prism','orb','cut-orb','frame','steps']) {
    const i={id:motif,motif,x:60,y:80,size:30,aspect:3,depth:.7,angle:.4,tilt:.6,pinned:false};
    const p={...DEFAULT_COMPOSITION,widthMm:120,heightMm:160,instances:[i]};
    const poly=footprint(i);
    for(const shape of compositionShapes(p)) for(const path of shape.paths()) for(const v of path) {
      const x=v.x/COMPOSITION_SCALE+p.widthMm/2,y=v.y/COMPOSITION_SCALE+p.heightMm/2;
      for(let j=0;j<poly.length;j++) {
        const a=poly[j],b=poly[(j+1)%poly.length];
        assert.ok((b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0])>=-1e-6,`${motif} escaped footprint`);
      }
    }
    const node={id:'packed',type:'packed-composition',name:'Composition',params:p,visible:true,transform:DEFAULT_TRANSFORM,slicing:DEFAULT_SLICING};
    const result=renderScene([node],compositionCamera(p),300,400,settings);
    assert.ok(result.pathCount>0,motif);
    assert.ok(!result.svg.includes('NaN'));
    const { serializeScene, parseScene }=load('scene-file.js');
    const { CAMERA_PRESETS }=load('cameras.js');
    const saved={nodes:[node],cameras:CAMERA_PRESETS,renderSettings:settings,viewMode:'single',activeCameraIndex:0};
    assert.deepEqual(parseScene(serializeScene(saved)).nodes[0].params,p);
  }
});

test('composition validation bounds imported recipes and rejects malformed instances', () => {
  const { validateComposition }=load('composition.js');
  const { DEFAULT_COMPOSITION }=load('composition-types.js');
  for(const patch of [{seed:NaN},{version:2},{maxInstances:2000},{motifs:['missing']},{clearanceMm:0},{quiet:[{id:'x',x:0,y:0,width:9999,height:10}]}])
    assert.throws(()=>validateComposition({...DEFAULT_COMPOSITION,...patch}));
});


test('composition curves bound paper chord error while avoiding default sphere oversampling', () => {
  const { compositionShapes } = load('composition-geometry.js');
  const { compositionResolution } = load('composition.js');
  const { DEFAULT_COMPOSITION } = load('composition-types.js');
  for (const size of [2, 38, 300]) {
    const i = { id: 'orb', motif: 'orb', x: 1000, y: 1000, size, aspect: 6, depth: 1.5, angle: .9, tilt: .7, pinned: false };
    const p = { ...DEFAULT_COMPOSITION, widthMm: 2000, heightMm: 2000, instances: [i] };
    const shape = compositionShapes(p)[0];
    const paths = shape.shape.paths();
    for (let k=0;k<paths.length;k++) for (let j=1;j<paths[k].length;j++) {
      const path=paths[k];
      // Each sampled circle has constant speed. Its midpoint sagitta is bounded
      // by the transformed unit-sphere radius even for the smaller latitudes.
      const chord = path[j].sub(path[j-1]).length();
      const radius = size * Math.sqrt(i.aspect) / 2;
      const localRadius = k < p.detail ? Math.hypot(path[0].x,path[0].y) : 1;
      assert.ok(radius * (localRadius - Math.sqrt(localRadius*localRadius - chord*chord/4)) <= .01000001);
    }
    if(size === 38) assert.ok(paths.reduce((n,p)=>n+p.length,0)<2500);
  }
  for(const [widthMm,heightMm] of [[40,2000],[2000,40],[210,297]]) {
    const resolution = compositionResolution({...DEFAULT_COMPOSITION,widthMm,heightMm});
    assert.ok(Math.max(resolution.width,resolution.height)<=1200.000001);
    assert.ok(Math.abs(resolution.width/resolution.height-widthMm/heightMm)<1e-10);
  }
});

test('navigation preview is bounded, evenly sampled and preserves original segments', () => {
  const { renderNavigationPreview } = load('render.js');
  const { DEFAULT_SVG_EXTRUDE_PARAMS } = load('types.js');
  const segments = 18000;
  const node = { ...cube({}), id: 'navigation-dense', type: 'svg-extrude', fills: [],
    params: { ...DEFAULT_SVG_EXTRUDE_PARAMS, importMode: 'lines', fitToSize: 4,
      bounds: { minX: -2, maxX: 2, minY: -1, maxY: 1 },
      polylines: [Array.from({ length: segments + 1 }, (_, j) => [-2 + 4 * j / segments, j % 2 ? 1 : -1])] } };
  const nodes = [node, { ...node, id: 'navigation-dense-occluded', pathVisibility: 'occluded' }],
    view = { ...camera, eye: [0, 0, 6], up: [0, 1, 0], zoom: 1 };
  const first = renderNavigationPreview(nodes, view, 800, 400, settings);
  const warm = renderNavigationPreview(nodes, view, 800, 400, settings);
  assert.equal(first.svg, warm.svg, 'cached sampling must be deterministic');
  assert.equal(first.pathCount, 6000, 'the dense fixture should fully exercise one scene-wide segment budget');
  assert.equal((first.svg.match(/<path /g) ?? []).length, 1, 'preview should batch its SVG DOM');
  const edges = [...first.svg.matchAll(/M([\d.-]+),([\d.-]+)L([\d.-]+),([\d.-]+)/g)]
    .map(m => m.slice(1).map(Number));
  assert.equal(edges.length, first.pathCount);
  assert.ok(edges.flat().every(Number.isFinite));
  for (const [x0, y0, x1, y1] of edges) {
    assert.ok(Math.abs(x1 - x0) <= 0.03, 'sampling connected dropped polyline vertices into a fake chord');
    assert.ok(Math.abs(y1 - y0) > 100, 'sample did not retain an original zigzag segment');
  }
  assert.ok(edges[0][0] < 267 && edges.at(-1)[2] > 533, 'sampling lost the ends of the scene extent');
  const perspective = renderNavigationPreview(nodes, { ...view, ortho: false, zoom: 2 }, 800, 400, settings);
  assert.ok(perspective.pathCount > 0 && perspective.pathCount <= 6000);
  assert.doesNotMatch(perspective.svg, /NaN|Infinity/);
  assert.throws(() => renderNavigationPreview(nodes, { ...view, eye: view.center }, 800, 400, settings), /Camera/);
  assert.throws(() => renderNavigationPreview(nodes, view, 0, 400, settings), /Width/);
});

test('navigation preview includes every path channel and leaves exact rendering unchanged', () => {
  const { renderNavigationPreview } = load('render.js');
  const { DEFAULT_LINE_GRID_PARAMS } = load('types.js');
  const host = { ...cube({ min: [-.6, -.6, -.6], max: [.6, .6, .6] }),
    fills: [{ ...makeDefaultFill('cross-hatch', 'navigation-fill'), spacing: .4 }] };
  const line = { ...cube({}), type: 'line-grid', fills: [], params: { ...DEFAULT_LINE_GRID_PARAMS,
    countX: 2, countY: 2, spacing: .4, lineLength: .5, lineAxis: 'x' } };
  const extra = { ...line, id: 'navigation-extra', pathVisibility: 'through',
    transform: { ...DEFAULT_TRANSFORM, translate: [-2, 0, 0] } };
  const occluded = { ...line, id: 'navigation-occluded', pathVisibility: 'occluded',
    transform: { ...DEFAULT_TRANSFORM, translate: [2, 0, 0] } };
  const nodes = [host, extra, occluded], view = { ...camera, orthoSize: 5 };
  const exactBefore = renderScene(nodes, view, 320, 160, settings).svg;
  const preview = renderNavigationPreview(nodes, view, 320, 160, settings);
  const exactAfter = renderScene(nodes, view, 320, 160, settings).svg;
  assert.equal(exactAfter, exactBefore, 'preview mutated exact geometry or visibility caches');
  const standalone = nodes.map(node => renderNavigationPreview([node], view, 320, 160, settings).pathCount);
  assert.equal(preview.pathCount, standalone.reduce((a, b) => a + b, 0), 'a prepared path channel was omitted');
  assert.ok(standalone.every(count => count > 0));
  const bare = renderNavigationPreview([{ ...host, fills: [] }], view, 320, 160, settings);
  assert.ok(standalone[0] > bare.pathCount, 'the fill channel was omitted');
  const frontal = { ...view, eye: [0, 0, 6], up: [0, 1, 0] };
  const behind = { ...line, id: 'navigation-behind', pathVisibility: 'occluded',
    params: { ...line.params, countX: 1, countY: 1 },
    transform: { ...DEFAULT_TRANSFORM, translate: [0, 0, -2] } };
  const solid = { ...host, fills: [] };
  assert.equal(renderScene([solid, behind], frontal, 320, 160, settings).svg,
    renderScene([solid], frontal, 320, 160, settings).svg, 'fixture needs a completely occluded line');
  assert.equal(renderNavigationPreview([solid, behind], frontal, 320, 160, settings).pathCount,
    renderNavigationPreview([solid], frontal, 320, 160, settings).pathCount + 1,
    'navigation preview unexpectedly performed hidden-line removal');
  for (const zoom of [.5, 1, 2]) {
    const onlyDirect = [extra], zoomed = { ...view, zoom };
    const exact = renderScene(onlyDirect, zoomed, 320, 160, settings).svg;
    const navigation = renderNavigationPreview(onlyDirect, zoomed, 320, 160, settings).svg;
    const exactEdges = [...exact.matchAll(/points="([^"]+)"/g)].map(m => m[1].split(' ').map(pair => pair.split(',').map(Number)));
    const previewEdges = [...navigation.matchAll(/M([\d.-]+),([\d.-]+)L([\d.-]+),([\d.-]+)/g)]
      .map(m => [[+m[1], +m[2]], [+m[3], +m[4]]]);
    assert.equal(previewEdges.length, exactEdges.length);
    exactEdges.forEach((edge, j) => edge.forEach((point, k) => point.forEach((value, axis) =>
      assert.ok(Math.abs(value - previewEdges[j][k][axis]) <= .005001, 'preview and exact camera projections differ'))));
  }
});
