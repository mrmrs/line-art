// Rebuild the app's grid-visibility fork without touching a sibling checkout.
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const root=process.cwd(), temporary=mkdtempSync(resolve('node_modules/.grid-core-'));
try {
  execFileSync('tar',['-xzf',resolve('vendor/lnjs-core-0.8.1.tgz'),'-C',temporary]);
  const directory=resolve(temporary,'package');
  execFileSync('patch',['-p1','-i',resolve('vendor/patches/large-grid-visibility.patch')],{cwd:directory,stdio:'inherit'});
  const pkg=JSON.parse(readFileSync(resolve(directory,'package.json'),'utf8'));
  pkg.version='0.8.2';
  writeFileSync(resolve(directory,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  writeFileSync(resolve(directory,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2020',module:'CommonJS',moduleResolution:'node',ignoreDeprecations:'6.0',declaration:true,outDir:'lib',strict:true,esModuleInterop:true,skipLibCheck:true,types:[],rootDir:'src'},include:['src/**/*.ts']}));
  const compiler=resolve('node_modules/typescript/bin/tsc');
  execFileSync(process.execPath,[compiler,'-p',resolve(directory,'tsconfig.json')],{stdio:'inherit'});
  execFileSync(process.execPath,[compiler,'-p',resolve(directory,'tsconfig.json'),'--module','ES2020','--outDir',resolve(directory,'es')],{stdio:'inherit'});
  execFileSync('npm',['pack',directory,'--ignore-scripts','--pack-destination',resolve(root,'vendor'),'--silent'],{stdio:'inherit'});
} finally { rmSync(temporary,{recursive:true,force:true}); }
