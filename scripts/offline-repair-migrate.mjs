#!/usr/bin/env node
// One-off offline repair. The lock excludes this wrapper only, not Pi writers.
import * as fs from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { plan, apply, rollback } from './migrate-subagent-sessions.mjs';
export const repairRelative = '--home-sydney-Workspace-projects-pi-background-tasks--/2026-11-24T05-39-54-506Z_01a20c11-5e0a-768c-b1dd-7fc0bcab05d0.jsonl';
const hash = b => createHash('sha256').update(b).digest('hex');
export function repairedBytes(bytes) {
  const lines = bytes.toString('latin1').split('\n');
  if (lines[176] !== '\0'.repeat(922) || lines.length < 178 || lines.filter(l => l.includes('\0')).length !== 1) throw Error('Exact repair signature mismatch');
  lines.splice(176, 1);
  return Buffer.from(lines.join('\n'), 'latin1');
}
export async function checkProcesses(proc = '/proc') {
  if (process.platform !== 'linux') throw Error('Linux /proc required');
  for (const pid of await fs.readdir(proc)) {
    if (!/^\d+$/.test(pid) || Number(pid) === process.pid) continue;
    try {
      const dir = join(proc, pid);
      if ((await fs.stat(dir)).uid !== process.getuid()) continue;
      const args = (await fs.readFile(join(dir, 'cmdline'))).toString().split('\0');
      // Conservatively refuse ambiguous node/bun CLI entrypoints as well.
      const exe = basename(await fs.readlink(join(dir, 'exe')));
      if (/^(node|bun)(\s|$)/.test(exe) && args.some(a => /(^|\/)pi($|\/)|pi-coding-agent|(^|\/)cli\.(m?js|ts)$/.test(a))) throw Error(`Pi/ambiguous CLI process ${pid}; close ALL Pi processes`);
    } catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ESRCH') throw e; }
  }
}
async function replaceIf(path, expected, bytes) {
  if (await fs.realpath(path) !== path || hash(await fs.readFile(path)) !== expected) throw Error(`Changed repair file; refusing overwrite: ${path}`);
  const tmp = `${path}.repair-tmp`;
  await fs.writeFile(tmp, bytes, { flag: 'wx', mode: 0o600 });
  try {
    if (hash(await fs.readFile(path)) !== expected) throw Error('Repair file changed');
    await fs.rename(tmp, path);
  } finally { await fs.rm(tmp, { force: true }); }
}
export async function run({ root, dest, execute = false, restore }) {
  root = resolve(root); dest = resolve(dest);
  await checkProcesses();
  if (await fs.realpath(root) !== root) throw Error('Symlink root refused');
  const lock = `${root}.offline-repair.lock`;
  const handle = await fs.open(lock, 'wx', 0o600);
  try {
    if (restore) {
      if (!execute) throw Error('Rollback requires --apply');
      const record = JSON.parse(await fs.readFile(restore, 'utf8'));
      if (record.root !== root || record.path !== join(root, repairRelative)) throw Error('Repair record root mismatch');
      const original = await fs.readFile(record.backup);
      if (hash(original) !== record.oldHash || hash(repairedBytes(original)) !== record.newHash) throw Error('Repair backup mismatch');
      if (record.manifest) await rollback(record.manifest);
      await replaceIf(record.path, record.newHash, original);
      return;
    }
    const path = join(root, repairRelative);
    if (await fs.realpath(path) !== path) throw Error('Symlink repair path refused');
    const original = await fs.readFile(path), repaired = repairedBytes(original);
    const p = await plan(root, dest, { overrides: new Map([[path, repaired]]) });
    // Validate all destination collisions before the repair write.
    for (const c of p.changes) if (c.source !== c.target) {
      try { await fs.lstat(c.target); throw Error(`Destination collision: ${c.target}`); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    console.log(JSON.stringify({ preview: !execute, repair: path, oldHash: hash(original), newHash: hash(repaired), changes: p.changes.length, skipped: p.skipped }, null, 2));
    if (!execute) return;
    await checkProcesses();
    const archive = await fs.mkdtemp(`${root}.repair-`);
    const backup = join(archive, 'original.bak'), recordPath = join(archive, 'repair.json');
    const record = { root, path, backup, oldHash: hash(original), newHash: hash(repaired), manifest: null };
    await fs.writeFile(backup, original, { flag: 'wx', mode: 0o600 });
    await fs.writeFile(recordPath, JSON.stringify(record, null, 2), { mode: 0o600 });
    console.log(`Repair record: ${recordPath}`);
    await replaceIf(path, record.oldHash, repaired);
    let migrationComplete = false;
    try {
      record.manifest = await apply(p);
      migrationComplete = true;
      await fs.writeFile(recordPath, JSON.stringify(record, null, 2), { mode: 0o600 });
      console.log(`Migration manifest: ${record.manifest}`);
    } catch (e) {
      if (migrationComplete) throw Error(`${e.message}; migration completed; roll back manifest ${record.manifest} before restoring ${backup}`);
      const failedManifest = e.message.match(/manifest: (.+)$/)?.[1];
      if (failedManifest) {
        record.failedManifest = failedManifest;
        await fs.writeFile(recordPath, JSON.stringify(record, null, 2), { mode: 0o600 });
      }
      try { await replaceIf(path, record.newHash, original); }
      catch (r) { throw Error(`${e.message}; repair restore refused: ${r.message}; record: ${recordPath}`); }
      throw Error(`${e.message}; original repair bytes restored; record: ${recordPath}`);
    }
  } finally { await handle.close(); await fs.unlink(lock); }
}
async function main() {
  const options = { root: join(homedir(), '.pi/agent/sessions'), dest: join(homedir(), '.pi/agent/subagent-sessions') };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') options.execute = true;
    else if (['--sessions-root', '--destination', '--rollback'].includes(args[i]) && args[i + 1]) options[{'--sessions-root':'root','--destination':'dest','--rollback':'restore'}[args[i]]] = resolve(args[++i]);
    else throw Error(`Unknown/incomplete argument: ${args[i]}`);
  }
  await run(options);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
