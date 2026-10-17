import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const directory = fileURLToPath(new URL('../tests/', import.meta.url));
const filters = process.argv.slice(2);
const files = readdirSync(directory).filter(name => name.endsWith('.test.mjs') && (!filters.length || filters.some(filter => name.includes(filter)))).sort();
if (!files.length) throw Error('No matching tests');
for (const file of files) {
  console.log(`\nTesting ${file}`);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../tests/' + file, import.meta.url))], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`\nPASS ${files.length} test scripts`);
