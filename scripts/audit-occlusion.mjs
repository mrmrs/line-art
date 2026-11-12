// Diagnostic review harness: reports current defects without changing the engine.
// Run: node scripts/audit-occlusion.mjs
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual, inspect } from 'node:util';
const require = createRequire(import.meta.url);
const ln = require('@lnjs/core');
const v = (x, y, z) => new ln.Vector(x, y, z);
const cube = (min, max) => new ln.Cube(v(...min), v(...max));
const sceneOf = (...shapes) => {
  const scene = new ln.Scene();
  shapes.forEach((shape) => scene.add(shape));
  scene.compile();
  return scene;
};
let issues = 0;
function probe(name, expected, actual) {
  const matches =
    typeof expected === 'number' && typeof actual === 'number'
      ? Math.abs(expected - actual) < 1e-8
      : isDeepStrictEqual(expected, actual);
  if (!matches) issues++;
  console.log(
    `${matches ? 'OK' : 'ISSUE'} ${name}\n  expected: ${inspect(expected)}\n  actual:   ${inspect(actual)}`,
  );
}
const unit = () => cube([-1, -1, -1], [1, 1, 1]);
const scaled = new ln.TransformedShape(unit(), ln.identity().scale(v(2, 2, 2)));
probe(
  'scaled cube world hit distance',
  8,
  scaled.intersect(new ln.Ray(v(0.2, 0.3, 10), v(0, 0, -1))).t,
);
probe(
  'scaled cube beyond the eye must not occlude',
  true,
  sceneOf(scaled).visible(v(0.2, 0.3, 5), v(0.2, 0.3, 10)),
);
const cylinder = new ln.Cylinder(1, 0, 2);
probe(
  'cylinder top cap',
  1,
  cylinder.intersect(new ln.Ray(v(0.2, 0.3, 3), v(0, 0, -1))).t,
);
probe(
  'cone base before side wall',
  1,
  new ln.Cone(1, 1).intersect(new ln.Ray(v(0.25, 0, -1), v(0, 0, 1))).t,
);
const boundaryRay = new ln.Ray(v(1, 0.2, 3), v(0, 0, -1));
probe(
  'parallel ray on box boundary has finite interval',
  [2, 4],
  unit().boundingBox().intersect(boundaryRay),
);
probe(
  'parallel ray on cube boundary hits face edge',
  2,
  unit().intersect(boundaryRay).t,
);
const a = cube([0, 0, 0], [4, 1, 1]);
const b = cube([2, 0, 0], [6, 1, 1]);
probe(
  'CSG intersection preserves distance after skipping first boundary',
  3,
  new ln.BooleanShape(ln.CSGOperation.Intersection, a, b).intersect(
    new ln.Ray(v(-1, 0.3, 0.4), v(1, 0, 0)),
  ).t,
);
probe(
  'CSG union contains interior point',
  true,
  new ln.BooleanShape(ln.CSGOperation.Union, a, b).contains(v(1, 0.3, 0.4), 0),
);
probe(
  'small sphere blocks a ray through its center',
  false,
  sceneOf(new ln.Sphere(v(0, 0, 0), 0.001)).visible(
    v(0, 0, -0.002),
    v(0, 0, 0.002),
  ),
);
probe(
  'small triangle blocks a perpendicular ray',
  1,
  new ln.Triangle(v(0, 0, 0), v(1e-5, 0, 0), v(0, 1e-5, 0)).intersect(
    new ln.Ray(v(2e-6, 2e-6, 1), v(0, 0, -1)),
  ).t,
);
probe('3D squared length', 9, v(0, 0, 3).lengthSquared());
const orthoScene = sceneOf(cube([1.9, -0.2, 4], [2.1, 0.2, 6]));
const orthoMatrix = ln
  .lookAt(v(0, 0, 10), v(0, 0, 0), v(0, 1, 0))
  .orthographic(-3, 3, -3, 3, 0.1, 100);
const orthoVisibility = new ln.Visibility(
  orthoScene,
  orthoMatrix,
  v(0, 0, 10),
  100,
  100,
);
probe(
  'orthographic point behind a directly aligned blocker is hidden',
  false,
  orthoVisibility.visible(v(1.99, 0, 0), v(2.01, 0, 0)).length > 0,
);
console.log(
  '  parallel reference hit:',
  orthoScene.intersect(new ln.Ray(v(2, 0, 0), v(0, 0, 1))).t,
);
let calls = 0;
const farShapes = Array.from({ length: 7 }, (_, i) => {
  const shape = new ln.Sphere(v(0, 0, 100 + i * 3), 1);
  const intersect = shape.intersect.bind(shape);
  shape.intersect = (ray) => {
    calls++;
    return intersect(ray);
  };
  return shape;
});
sceneOf(...farShapes).visible(v(0, 0, 5), v(0, 0, 0));
console.log(
  `METRIC primitive tests beyond the eye: ${calls} (a bounded query can reject the root box)`,
);
const output = mkdtempSync(resolve('node_modules/.occlusion-audit-'));
try {
  writeFileSync(`${output}/package.json`, '{"type":"commonjs"}');
  const compiled = spawnSync(
    process.execPath,
    [
      'node_modules/typescript/bin/tsc',
      'src/lib/projection.ts',
      'src/lib/height-field.ts',
      '--outDir',
      output,
      '--module',
      'commonjs',
      '--target',
      'ES2022',
      '--esModuleInterop',
      '--skipLibCheck',
      '--ignoreConfig',
    ],
    { stdio: 'inherit' },
  );
  if (compiled.status !== 0)
    throw new Error('Could not compile app diagnostic targets');
  const { projectPaths } = require(`${output}/projection.js`);
  const { HeightField } = require(`${output}/height-field.js`);
  const thin = sceneOf(new ln.Sphere(v(0.045, 0, 1), 0.003));
  const line = [[v(-1, 0, 0), v(1, 0, 0)]];
  probe(
    'thin occluder splits a line even when between coarse samples',
    2,
    projectPaths(line, orthoMatrix, v(0, 0, 10), 100, 100, 0.1, thin).length,
  );
  console.log(
    '  hidden interior point:',
    !thin.visible(v(0, 0, 10), v(0.05, 0, 0)),
  );
  console.log(
    '  fine-step output paths:',
    projectPaths(line, orthoMatrix, v(0, 0, 10), 100, 100, 0.001, thin).length,
  );
  const flat = new HeightField(
    () => 0,
    new ln.Box(v(-1, -1, 0), v(1, 1, 2)),
    false,
  );
  probe(
    'height field surface exactly on box boundary',
    2,
    flat.intersect(new ln.Ray(v(0.2, 0.3, 2), v(0, 0, -1))).t,
  );
} finally {
  rmSync(output, { recursive: true, force: true });
}
console.log(
  `\n${issues} diagnostic mismatches. All mismatches must be resolved before accepting the fork.`,
);
if (issues) process.exitCode = 1;
