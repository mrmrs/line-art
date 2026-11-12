// Build and test the sibling fork, then vendor its reproducible package artifact.
// Usage: node scripts/update-ln-fork.mjs [path/to/ln.js]
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fork = resolve(process.argv[2] ?? resolve(root, '../ln.js'));
const pkg = JSON.parse(readFileSync(resolve(fork, 'package.json'), 'utf8'));
if (pkg.name !== '@lnjs/core' || !/^[\w.-]+$/.test(pkg.version))
  throw new Error('Expected the ln.js fork');
const vendor = resolve(root, 'vendor');
mkdirSync(vendor, { recursive: true });
execFileSync('npm', ['test'], { cwd: fork, stdio: 'inherit' });
execFileSync('npm', ['pack', '--pack-destination', vendor, '--silent'], {
  cwd: fork,
  stdio: 'inherit',
});
execFileSync(
  'npm',
  ['install', '--save-exact', resolve(vendor, `lnjs-core-${pkg.version}.tgz`)],
  { cwd: root, stdio: 'inherit' },
);
