#!/usr/bin/env node
// Offline only: fingerprints detect changes, but do not provide writer exclusion.
import * as fs from 'node:fs/promises';
import { resolve, dirname, relative, join, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (root, p) => { const r = relative(root, p); return r !== '' && !r.startsWith('..') && !isAbsolute(r); };
async function exists(p) { try { await fs.lstat(p); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
async function safe(p) { if (await fs.realpath(p) !== p) throw Error(`Symlink path refused: ${p}`); }
async function atomic(p, bytes) {
  const temp = `${p}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temp, bytes, { flag: 'wx', mode: 0o600 }); await fs.rename(temp, p); }
  finally { await fs.rm(temp, { force: true }); }
}
export async function plan(sessionsRoot, destination, { overrides = new Map() } = {}) {
  const root = resolve(sessionsRoot), dest = resolve(destination);
  await safe(root);
  if (root === dest || inside(root, dest) || inside(dest, root)) throw Error('Roots must be separate');
  const files = new Map(), children = new Set(), skipped = [];
  const queue = [];
  for (const d of await fs.readdir(root, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const f of await fs.readdir(join(root, d.name), { withFileTypes: true })) {
      if (f.name.endsWith('.jsonl')) queue.push(join(root, d.name, f.name));
    }
  }
  for (const p of queue) {
    if (files.has(p)) continue;
    await safe(p);
    const bytes = overrides.get(p) ?? await fs.readFile(p);
    const lines = bytes.toString('utf8').split('\n');
    const entries = lines.map((line, index) => {
      if (!line.trim()) return null;
      try { return JSON.parse(line); }
      catch { throw Error(`Invalid JSONL: ${p}, line ${index + 1} (content omitted)`); }
    });
    const header = entries.find(e => e?.type === 'session');
    if (!header) throw Error(`Missing header: ${p}`);
    const cwd = header.cwd;
    files.set(p, { p, bytes, lines, entries, cwd });
    for (const e of entries) {
      if (e?.type !== 'custom' || e.customType !== 'subagents:record' || typeof e.data?.sessionFile !== 'string') continue;
      if (!isAbsolute(e.data.sessionFile) && !isAbsolute(cwd ?? '')) throw Error(`Missing absolute cwd: ${p}`);
      const child = resolve(cwd ?? dirname(p), e.data.sessionFile);
      if (!inside(root, child)) {
        skipped.push({ source: p, sessionFile: e.data.sessionFile, reason: 'outside-source-root' });
        continue;
      }
      if (!await exists(child)) {
        skipped.push({ source: p, sessionFile: e.data.sessionFile, reason: 'missing-child' });
        continue;
      }
      children.add(child); queue.push(child);
    }
  }
  const moves = new Map([...children].filter(p => files.has(p)).map(p => [p, join(dest, relative(root, p))]));
  const changes = [];
  for (const f of files.values()) {
    const lines = f.entries.map((e, i) => {
      let changed = false;
      if (e?.type === 'custom' && e.customType === 'subagents:record' && typeof e.data?.sessionFile === 'string') {
        const target = moves.get(resolve(f.cwd ?? dirname(f.p), e.data.sessionFile));
        if (target) { e.data.sessionFile = target; changed = true; }
      }
      if (e?.type === 'session' && typeof e.parentSession === 'string') {
        const target = moves.get(resolve(dirname(f.p), e.parentSession));
        if (target) { e.parentSession = target; changed = true; }
      }
      return changed ? JSON.stringify(e) : f.lines[i];
    });
    const bytes = Buffer.from(lines.join('\n')), target = moves.get(f.p) ?? f.p;
    if (target !== f.p || !bytes.equals(f.bytes)) changes.push({ source: f.p, target, oldHash: hash(f.bytes), newHash: hash(bytes), bytes });
  }
  return { root, dest, files, changes, skipped };
}
export async function verify(plan) {
  const fresh = await planScan(plan);
  if (fresh.files.size !== plan.files.size || [...plan.files].some(([p, f]) => !fresh.files.has(p) || !fresh.files.get(p).bytes.equals(f.bytes))) throw Error('Source changed since planning');
  for (const c of plan.changes) if (c.source !== c.target && await exists(c.target)) throw Error(`Destination collision: ${c.target}`);
}
const planScan = p => plan(p.root, p.dest);
export async function rollback(manifestPath) {
  const m = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (m.version !== 1) throw Error('Unsupported manifest');
  // Preflight every backup and every path before restoring anything.
  for (const c of m.changes) {
    if (hash(await fs.readFile(c.backup)) !== c.oldHash) throw Error('Backup hash mismatch');
    for (const p of new Set([c.source, c.target])) if (await exists(p)) {
      await safe(p);
      const h = hash(await fs.readFile(p));
      if (!(p === c.source && h === c.oldHash) && !(p === c.target && h === c.newHash)) throw Error(`Changed content: ${p}`);
    }
  }
  for (const c of [...m.changes].reverse()) {
    await atomic(c.source, await fs.readFile(c.backup));
    if (c.target !== c.source) await fs.rm(c.target, { force: true });
  }
}
export async function apply(p, { afterWrite } = {}) {
  await verify(p);
  await fs.mkdir(p.dest, { recursive: true, mode: 0o700 }); await safe(p.dest);
  const archive = await fs.mkdtemp(join(p.dest, '.migration-'));
  const manifestPath = join(archive, 'manifest.json');
  const changes = [];
  for (const [i, c] of p.changes.entries()) {
    const backup = join(archive, `${i}.bak`);
    await fs.writeFile(backup, p.files.get(c.source).bytes, { flag: 'wx', mode: 0o600 });
    const { bytes, ...record } = c; changes.push({ ...record, backup });
  }
  await atomic(manifestPath, JSON.stringify({ version: 1, changes }, null, 2));
  try {
    await verify(p);
    for (const [i, c] of p.changes.entries()) {
      await fs.mkdir(dirname(c.target), { recursive: true, mode: 0o700 }); await safe(dirname(c.target));
      if (hash(await fs.readFile(c.source)) !== c.oldHash) throw Error('Source changed');
      if (c.source !== c.target && await exists(c.target)) throw Error('Destination collision');
      await atomic(c.target, c.bytes);
      if (c.source !== c.target) await fs.unlink(c.source);
      await afterWrite?.(i);
    }
  } catch (e) {
    try { await rollback(manifestPath); } catch (r) { throw Error(`${e.message}; rollback refused/failed: ${r.message}; manifest: ${manifestPath}`); }
    throw Error(`${e.message}; rolled back; manifest: ${manifestPath}`);
  }
  return manifestPath;
}
async function main() {
  const args = process.argv.slice(2), opts = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--apply' || key === '--help') opts[key] = true;
    else if (['--sessions-root', '--destination', '--rollback'].includes(key) && args[i + 1] && !args[i + 1].startsWith('--')) opts[key] = args[++i];
    else throw Error(`Unknown/incomplete argument: ${key}`);
  }
  if (opts['--help']) return console.log('Offline migration: [--sessions-root PATH] [--destination PATH] [--apply]\n--rollback MANIFEST --apply restores backups. Default dry-run. Exit ALL writing Pi processes before apply/rollback. Not concurrency-safe.');
  if (opts['--rollback']) {
    if (!opts['--apply']) throw Error('Rollback requires --apply; exit all writing Pi processes');
    return rollback(resolve(opts['--rollback']));
  }
  const p = await plan(opts['--sessions-root'] ?? join(homedir(), '.pi/agent/sessions'), opts['--destination'] ?? join(homedir(), '.pi/agent/subagent-sessions'));
  await verify(p);
  console.log(JSON.stringify({ dryRun: !opts['--apply'], skipped: p.skipped, changes: p.changes.map(({ bytes, ...c }) => c) }, null, 2));
  if (opts['--apply']) { console.error('Offline only: all writing Pi processes must be stopped. Not concurrency-safe.'); console.log(await apply(p)); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
