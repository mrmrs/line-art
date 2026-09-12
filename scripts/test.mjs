// Compile the render library with the existing TypeScript dependency, then run
// Node's test runner. Temporary output lives beside dependencies and is removed.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const output = mkdtempSync(resolve('node_modules/.audit-test-'));
try {
  writeFileSync(`${output}/package.json`, '{"type":"commonjs"}');
  const compiled = spawnSync(process.execPath, [
    'node_modules/typescript/bin/tsc', 'src/lib/render.ts', 'src/lib/plotter-optimize.ts',
    '--outDir', output, '--module', 'commonjs', '--target', 'ES2022',
    '--esModuleInterop', '--skipLibCheck', '--ignoreConfig',
  ], { stdio: 'inherit' });
  if (compiled.status !== 0) process.exitCode = compiled.status ?? 1;
  else {
    const tests = spawnSync(process.execPath, ['--test', 'tests/render.test.cjs'], {
      stdio: 'inherit', env: { ...process.env, AUDIT_TEST_OUTPUT: output },
    });
    process.exitCode = tests.status ?? 1;
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}
