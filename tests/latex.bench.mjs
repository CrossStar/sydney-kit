import { projectRoot, hostImport } from './helpers/paths.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { createJiti } = await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');
const jiti = createJiti(import.meta.url);
const { CacheManager } = await jiti.import(projectRoot + '/src/latex/cache.ts');
const { LatexRenderer } = await jiti.import(projectRoot + '/src/latex/renderer.ts');
const dir = await mkdtemp(join(tmpdir(), 'latex-bench-'));
try {
 const cache = new CacheManager(dir), renderer = new LatexRenderer(cache);
 const formulas = ['\\frac{x^2}{y}', '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', Array(20).fill('x^2').join('+')];
 for (let round = 0; round < 3; round++) for (const [i, formula] of formulas.entries()) {
  await cache.clear();
  const start = performance.now();
  const image = await renderer.render(formula, true, 60);
  console.log(JSON.stringify({round, formula:i, ms: +(performance.now()-start).toFixed(2), ok:!!image}));
 }
} finally { await rm(dir, { recursive:true, force:true }); }
