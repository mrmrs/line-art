// Reproducible solver-only measurements; wall time is descriptive, not a gate.
// Usage: node scripts/benchmark-composition.mjs [output.json]
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';

const temporary = mkdtempSync(resolve('node_modules/.composition-benchmark-'));
try {
  writeFileSync(`${temporary}/package.json`, '{"type":"commonjs"}');
  const compile = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc',
    'src/lib/composition.ts', '--outDir', temporary, '--module', 'commonjs',
    '--target', 'ES2022', '--esModuleInterop', '--skipLibCheck', '--ignoreConfig'], { stdio: 'inherit' });
  if (compile.status !== 0) throw new Error('Benchmark compilation failed');
  const require = createRequire(import.meta.url);
  const { packComposition } = require(`${temporary}/composition.js`);
  const { DEFAULT_COMPOSITION, COMPOSITION_PRESETS } = require(`${temporary}/composition-types.js`);
  const recursive = COMPOSITION_PRESETS.find(recipe => /recursive/i.test(recipe.name));
  const cases = [
    { name: 'default A4', params: { ...DEFAULT_COMPOSITION } },
    { name: 'recursive frames A4', params: { ...DEFAULT_COMPOSITION, ...(recursive?.values ?? {}),
      motifs: ['frame', 'prism'], depth: 0.12, minSizeMm: 2, maxSizeMm: 100,
      clearanceMm: 0.5, recursionDepth: 4, recursionScale: 0.5, maxInstances: 500 } },
    { name: 'dense gap repair', params: { ...DEFAULT_COMPOSITION, widthMm: 160, heightMm: 220,
      marginMm: 6, density: 0.8, minSizeMm: 3, maxSizeMm: 34, clearanceMm: 0.6,
      depth: 0.15, aspect: 4, maxInstances: 500 } },
    { name: '1000 mm square / 1500 cap', params: { ...DEFAULT_COMPOSITION, widthMm: 1000,
      heightMm: 1000, marginMm: 10, density: 0.8, minSizeMm: 6, maxSizeMm: 45,
      clearanceMm: 0.5, depth: 0.2, maxInstances: 1500 } },
  ];
  // Warm the module/JIT before measured cases; rendering is intentionally separate.
  packComposition({ ...DEFAULT_COMPOSITION, maxInstances: 20 });
  const report = { scope: 'Packing only; no rendering or export. Timings are machine-dependent.',
    runtime: process.version, machine: `${platform()} ${arch()}`, cpu: cpus()[0]?.model,
    cases: cases.map(({ name, params }) => {
      const timed = repair => {
        const start = performance.now();
        const result = packComposition(params, false, undefined, { repair });
        return { result, elapsedMs: Number((performance.now() - start).toFixed(2)) };
      };
      const baseline = timed(false), repaired = timed(true);
      assert.deepEqual(repaired.result.instances.slice(0, baseline.result.instances.length), baseline.result.instances,
        `${name}: repair changed an already resolved instance`);
      assert.ok(repaired.result.instances.length <= params.maxInstances, `${name}: instance cap exceeded`);
      assert.ok(repaired.result.instances.every(i => i.size >= params.minSizeMm && i.size <= params.maxSizeMm),
        `${name}: generated size outside physical bounds`);
      assert.ok(repaired.result.coverage >= baseline.result.coverage, `${name}: repair reduced coverage`);
      return { name, parameters: params, baseline: { elapsedMs: baseline.elapsedMs,
        instances: baseline.result.instances.length, coverage: baseline.result.coverage, attempts: baseline.result.attempts },
      repaired: { elapsedMs: repaired.elapsedMs, instances: repaired.result.instances.length,
        coverage: repaired.result.coverage, attempts: repaired.result.attempts,
        repairAdded: repaired.result.repairAdded, repairAttempts: repaired.result.repairAttempts,
        recursiveAdded: repaired.result.recursiveAdded,
        maximumGeneration: Math.max(0, ...repaired.result.instances.map(i => i.generation ?? 0)),
        limited: repaired.result.limited },
      coverageGainPercentagePoints: Number(((repaired.result.coverage - baseline.result.coverage) * 100).toFixed(4)),
      preservedPrefix: true };
    }) };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (process.argv[2]) writeFileSync(resolve(process.argv[2]), json);
  process.stdout.write(json);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
