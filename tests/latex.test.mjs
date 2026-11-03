import { projectRoot, hostPath, hostImport } from './helpers/paths.mjs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
const { calculateImageCellSize } = await hostImport('pi-tui/dist/terminal-image.js');
const { createJiti } = await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');
const jiti = createJiti(import.meta.url, { alias: { '@earendil-works/pi-tui': hostPath('pi-tui/dist/index.js') } });
const { formulaColor } = await jiti.import(projectRoot + '/src/latex/theme.ts');
const { CacheManager } = await jiti.import(projectRoot + '/src/latex/cache.ts');
const { LatexRenderer } = await jiti.import(projectRoot + '/src/latex/renderer.ts');
assert.equal(formulaColor({ appearance: 'light' }), '#000000');
assert.equal(formulaColor({ appearance: 'dark' }), '#ffffff');
assert.equal(formulaColor({ colors: { text: { kind: 'rgb', r: 18, g: 52, b: 86 } } }), '#123456');
const dir = await mkdtemp(join(tmpdir(), 'sydney-latex-'));
try {
  const cache = new CacheManager(dir), renderer = new LatexRenderer(cache);
  assert.equal(cache.getKey('x', false, 60, '#000000'), createHash('sha256').update('latex-v6:#000000:inline:60\nx').digest('hex'));
  assert.notEqual(cache.getKey('x', false, 60, '#000000'), cache.getKey('x', false, 60, '#ffffff'));
  for (const color of ['#000000', '#ffffff']) {
    const image = await renderer.render('\\frac{x^2}{y}', true, 20, color);
    assert.ok(image);
    assert.equal(await renderer.render('\\frac{x^2}{y}', true, 20, color), image);
    const { data, info } = await sharp(Buffer.from(image, 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 480);
    let ink = 0, transparent = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 200) {
        ink++;
        // Resampling premultiplied alpha can round an RGB channel by one level.
        const expected = color === '#ffffff' ? 255 : 0;
        for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(data[i + channel] - expected) <= 2);
      }
      if (!data[i + 3]) transparent++;
    }
    assert.ok(ink > 0 && transparent > 0);
    assert.equal(data[(info.width - 1) * 4 + 3], 0);
  }
  for (const width of [0, 19, 201, 20.5, NaN]) await assert.rejects(renderer.render('x', false, width));
  for (const formula of ['\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', Array(20).fill('x^2').join('+')]) {
    for (const cells of [20, 200]) {
      const image = await renderer.render(formula, true, cells, '#123456');
      assert.ok(image);
      const { data, info } = await sharp(Buffer.from(image, 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(info.width, cells * 24);
      assert.ok(info.height > 0 && info.height <= 8192);
      assert.ok(info.width * info.height <= 8_000_000);
      // Pi fits both densities to the same cell rectangle, including height caps.
      for (const geometry of [{ widthPx: 9, heightPx: 18 }, { widthPx: 12, heightPx: 24 }]) {
        for (const maxHeight of [undefined, 5]) {
          const size = calculateImageCellSize({ widthPx: info.width, heightPx: info.height }, cells, maxHeight, geometry);
          assert.ok(size.columns <= cells);
          if (maxHeight === undefined) assert.equal(size.columns, cells);
          assert.deepEqual(size, calculateImageCellSize({ widthPx: info.width / 2, heightPx: info.height / 2 }, cells, maxHeight, geometry));
        }
      }
      let ink = 0, clear = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (!data[i + 3]) clear++;
        if (data[i + 3] > 20) {
          ink++;
          // Unpremultiplication amplifies channel rounding at low alpha.
          for (const [c, expected] of [18, 52, 86].entries()) assert.ok(Math.abs(data[i + c] - expected) <= Math.ceil(255 / data[i + 3]));
        }
      }
      assert.ok(ink > 0 && clear > 0);
    }
  }
  for (const formula of ['', '   ', '\\frac{', '\\hspace{1em}', '\\rule{1em}{10000em}']) {
    assert.equal(await renderer.render(formula, true), null);
  }
  // Narrow glyph passes an unpadded pixel check, but its 4800px canvas exceeds budget.
  assert.equal(await renderer.render('\\rule{1em}{60em}', true, 200), null);
  await assert.rejects(renderer.render('x', true, 60, 'red'));
  assert.equal((await cache.getStats()).entryCount, 6);
  await cache.clear();
  assert.equal((await cache.getStats()).entryCount, 0);
} finally { await rm(dir, { recursive: true, force: true }); }
console.log('PASS theme resolution, color cache isolation, light/dark transparent PNGs and width bounds');
