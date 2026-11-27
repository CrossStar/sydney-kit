import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plan, apply, rollback } from '../scripts/migrate-subagent-sessions.mjs';
async function fixture(t) {
  const dir = await fs.mkdtemp(join(tmpdir(), 'subagent-migration-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const root = join(dir, 'sessions'), dest = join(dir, 'children'), project = join(root, 'project');
  await fs.mkdir(project, { recursive: true });
  const paths = Object.fromEntries(['parent', 'child', 'nested', 'fork'].map(n => [n, join(project, `${n}.jsonl`)]));
  const record = (path, id) => ({ type: 'custom', customType: 'subagents:record', id, parentId: null, data: { sessionFile: path } });
  const originals = new Map();
  for (const [name, path] of Object.entries(paths)) {
    const entries = [{ type: 'session', id: name, cwd: project, ...(name === 'fork' ? { parentSession: paths.child } : {}) }];
    if (name === 'parent') entries.push(record(paths.child, 'branch-a'), record(paths.child, 'branch-b'));
    if (name === 'child') entries.push(record(paths.nested, 'nested-entry'));
    const bytes = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    originals.set(path, bytes); await fs.writeFile(path, bytes);
  }
  return { root, dest, paths, originals };
}
test('dry-run, all branch refs, nested children, fork preserved, rollback exact bytes', async t => {
  const f = await fixture(t), p = await plan(f.root, f.dest);
  const cli = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/migrate-subagent-sessions.mjs', import.meta.url)), '--sessions-root', f.root, '--destination', f.dest], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).dryRun, true);
  await assert.rejects(fs.stat(f.dest), { code: 'ENOENT' });
  for (const [path, bytes] of f.originals) assert.equal(await fs.readFile(path, 'utf8'), bytes);
  const manifest = await apply(p);
  const parent = (await fs.readFile(f.paths.parent, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(parent[1].data.sessionFile, join(f.dest, 'project/child.jsonl'));
  assert.equal(parent[2].id, 'branch-b'); assert.equal(parent[2].data.sessionFile, parent[1].data.sessionFile);
  assert.match(await fs.readFile(f.paths.fork, 'utf8'), /children/);
  assert.match(await fs.readFile(join(f.dest, 'project/child.jsonl'), 'utf8'), /children.*nested.jsonl/);
  await assert.rejects(fs.stat(f.paths.child), { code: 'ENOENT' });
  await rollback(manifest);
  for (const [path, bytes] of f.originals) assert.equal(await fs.readFile(path, 'utf8'), bytes);
});
test('collision and source changes rejected before mutation', async t => {
  const f = await fixture(t), p = await plan(f.root, f.dest);
  await fs.appendFile(f.paths.fork, '\n'); await assert.rejects(apply(p), /changed/);
  await fs.writeFile(f.paths.fork, f.originals.get(f.paths.fork));
  await fs.mkdir(join(f.dest, 'project'), { recursive: true });
  await fs.writeFile(join(f.dest, 'project/child.jsonl'), 'collision');
  await assert.rejects(apply(p), /collision/);
});
test('failure rolls back and later changes block manual rollback', async t => {
  const f = await fixture(t), p = await plan(f.root, f.dest);
  await assert.rejects(apply(p, { afterWrite: () => { throw Error('injected'); } }), /rolled back/);
  for (const [path, bytes] of f.originals) assert.equal(await fs.readFile(path, 'utf8'), bytes);
  const manifest = await apply(await plan(f.root, f.dest));
  await fs.appendFile(f.paths.parent, '\n');
  await assert.rejects(rollback(manifest), /Changed content/);
  assert.equal(await fs.readFile(f.paths.parent, 'utf8').then(s => s.endsWith('\n\n')), true);
});
test('outside-root and missing records remain unchanged alongside legacy children', async t => {
  const f = await fixture(t);
  await fs.mkdir(f.dest);
  const external = join(f.dest, 'new-child.jsonl');
  // Deliberately invalid JSON: outside-root targets must not even be read.
  await fs.writeFile(external, 'external bytes');
  const missing = join(f.root, 'project/deleted.jsonl');
  const records = [external, missing].map(sessionFile => JSON.stringify({ type: 'custom', customType: 'subagents:record', data: { sessionFile } }));
  await fs.appendFile(f.paths.parent, records.join('\n') + '\n');
  const p = await plan(f.root, f.dest);
  assert.deepEqual(p.skipped.map(s => s.reason), ['outside-source-root', 'missing-child']);
  assert.equal(p.changes.filter(c => c.source !== c.target).length, 2);
  assert.ok(!p.changes.some(c => c.source === external || c.source === missing));
  const cli = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/migrate-subagent-sessions.mjs', import.meta.url)), '--sessions-root', f.root, '--destination', f.dest], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout).skipped, p.skipped);
  await apply(p);
  const parent = await fs.readFile(f.paths.parent, 'utf8');
  for (const record of records) assert.ok(parent.includes(record));
  assert.equal(await fs.readFile(external, 'utf8'), 'external bytes');
  await assert.rejects(fs.stat(missing), { code: 'ENOENT' });
  assert.match(parent, /children.*child.jsonl/);
});
test('previously missing child appearing invalidates plan', async t => {
  const f = await fixture(t);
  const missing = join(f.root, 'project/deeper/deleted.jsonl');
  await fs.appendFile(f.paths.parent, JSON.stringify({ type: 'custom', customType: 'subagents:record', data: { sessionFile: missing } }) + '\n');
  const p = await plan(f.root, f.dest);
  await fs.mkdir(join(f.root, 'project/deeper'));
  await fs.writeFile(missing, JSON.stringify({ type: 'session', id: 'returned', cwd: f.root }) + '\n');
  await assert.rejects(apply(p), /changed/);
});
