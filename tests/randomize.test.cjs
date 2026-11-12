const { test } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const load = name => require(join(process.env.AUDIT_TEST_OUTPUT, name));
const { randomizeShape, randomizeFill, randomizeComposition } = load('randomize.js');
const { PRESETS } = load('presets.js');
const { validateNodes } = load('limits.js');
const { mulberry32 } = load('random.js');
const types = load('types.js');
const { buildFillHost, generateFillPaths } = load('fills.js');
const { tessellateCube } = load('tessellate.js');
const { renderScenePerPen } = load('render.js');

test('randomized presets keep dependent bounds valid over repeated exploration', () => {
  const random = mulberry32(42);
  for (const preset of PRESETS) {
    const original = preset.create().map((node, i) => ({ ...node, id: `n${i}` }));
    for (let attempt = 0; attempt < 30; attempt++) {
      const nodes = original.map(node => ({ ...node, ...randomizeShape(node, random) }));
      validateNodes(nodes);
    }
  }
});

test('randomization preserves imported data and updates a shape in one undo step', () => {
  const { useSceneStore } = load('store.js');
  const store = useSceneStore.getState();
  const id = store.addNode('cube', 'cube', { min: [-1, -1, -1], max: [1, 1, 1] });
  const node = useSceneStore.getState().nodes.find(n => n.id === id);
  useSceneStore.temporal.getState().clear();
  store.updateNode(id, randomizeShape(node, mulberry32(3)));
  assert.equal(useSceneStore.temporal.getState().pastStates.length, 1);
  useSceneStore.temporal.getState().undo();
  assert.deepEqual(useSceneStore.getState().nodes.find(n => n.id === id).params, node.params);
  const svg = { ...node, type: 'svg-extrude', params: { ...types.DEFAULT_SVG_EXTRUDE_PARAMS, polylines: [[[0,0],[1,0],[1,1]]], sourceSvg: '<svg/>' } };
  assert.deepEqual(randomizeShape(svg).params.polylines, svg.params.polylines);
  assert.equal(randomizeShape(svg).params.sourceSvg, '<svg/>');
});

test('surface patterns target selected cube face families', () => {
  const host = buildFillHost(tessellateCube({ min: [-1,-1,-1], max: [1,1,1] }));
  for (const type of ['surface-hatch', 'stipple']) {
    const fill = { ...types.makeDefaultFill(type, 'f'), faceAxis: 'z', surfaceMode: true, density: 20 };
    const paths = generateFillPaths(fill, host);
    assert.ok(paths.length > 0);
    for (const path of paths) for (const point of path) assert.ok(Math.abs(Math.abs(point.z) - 1) < 1e-8);
    validateNodes([{ id:'c', name:'c', type:'cube', visible:true, params:{min:[-1,-1,-1],max:[1,1,1]}, transform:types.DEFAULT_TRANSFORM, slicing:types.DEFAULT_SLICING, fills:[{...fill,...randomizeFill(fill)}] }]);
  }
});

test('cube grid fills survive render and separate pen export', () => {
  const node = { id:'grid-fill', name:'grid', type:'cube-grid', visible:true,
    params:{...types.DEFAULT_CUBE_GRID_PARAMS, countX:2,countY:2,countZ:2},
    transform:types.DEFAULT_TRANSFORM, slicing:types.DEFAULT_SLICING,
    fills:[{...types.makeDefaultFill('surface-hatch','f'), pen:2, spacing:0.08,faceAxis:'z'}] };
  const camera = {name:'Test',eye:[6,5,7],center:[0,0,0],up:[0,0,1],ortho:true,orthoSize:3,fovy:45,zoom:1};
  const groups = renderScenePerPen([node],camera,160,160,types.DEFAULT_RENDER_SETTINGS);
  assert.ok(groups.penGroups.some(group => group.pen === 2 && group.paths.length > 0));
});

test('composition exploration preserves paper, quiet space, and kept instances', () => {
  const { DEFAULT_COMPOSITION } = load('composition-types.js');
  const p = {...DEFAULT_COMPOSITION, quiet:[{id:'q',x:20,y:20,width:10,height:10}], instances:[{id:'keep',pinned:true}]};
  const result = randomizeComposition(p, mulberry32(7));
  assert.equal(result.widthMm,p.widthMm); assert.equal(result.marginMm,p.marginMm);
  assert.equal(result.quiet,p.quiet); assert.equal(result.instances,p.instances);
  assert.notEqual(result.seed,p.seed); assert.ok(result.minSizeMm < result.maxSizeMm);
});
