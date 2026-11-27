import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { repairedBytes, repairRelative, checkProcesses } from '../scripts/offline-repair-migrate.mjs';
import { plan, apply, rollback } from '../scripts/migrate-subagent-sessions.mjs';
const original = Buffer.from(JSON.stringify({type:'session', cwd:'/tmp'}) + '\n' + '{}\n'.repeat(175) + '\0'.repeat(922) + '\n');
test('exact repair signature and byte preservation', () => {
  assert.deepEqual(repairedBytes(original), original.subarray(0, original.length - 923));
  for (const b of [original.subarray(0, -1), Buffer.concat([original, Buffer.from('\0')]), Buffer.from(original.toString().replace('\0', ' '))]) assert.throws(() => repairedBytes(b), /signature/);
});
test('memory preview retains disk bytes; migration and rollback preserve repaired bytes', async t => {
  const dir = await fs.mkdtemp(join(tmpdir(), 'repair-fixture-'));
  t.after(() => fs.rm(dir, {recursive:true, force:true}));
  const root = join(dir,'sessions'), dest = join(dir,'children'), path = join(root,repairRelative);
  await fs.mkdir(dirname(path), {recursive:true}); await fs.writeFile(path,original);
  const parent = join(dirname(path),'parent.jsonl');
  await fs.writeFile(parent, JSON.stringify({type:'session',cwd:root})+'\n'+JSON.stringify({type:'custom',customType:'subagents:record',data:{sessionFile:path}})+'\n');
  const repaired = repairedBytes(original);
  const p = await plan(root,dest,{overrides:new Map([[path,repaired]])});
  assert.deepEqual(await fs.readFile(path),original);
  await assert.rejects(apply(p), /Invalid JSONL/);
  await fs.writeFile(path,repaired);
  const manifest = await apply(p); await rollback(manifest);
  assert.deepEqual(await fs.readFile(path),repaired);
  await fs.writeFile(path,original);
  assert.deepEqual(await fs.readFile(path),original);
});
test('same-user node Pi process is refused using proc fixture', async t => {
  const dir = await fs.mkdtemp(join(tmpdir(),'proc-fixture-'));
  t.after(() => fs.rm(dir,{recursive:true,force:true}));
  const pid = join(dir,'99999999'); await fs.mkdir(pid);
  await fs.symlink('/usr/bin/node',join(pid,'exe'));
  await fs.writeFile(join(pid,'cmdline'),'node\0/opt/pi-coding-agent/dist/cli.js\0');
  await assert.rejects(checkProcesses(dir), /close ALL Pi/);
  await fs.writeFile(join(pid,'cmdline'),'node\0/tmp/unrelated.mjs\0');
  await checkProcesses(dir);
});
