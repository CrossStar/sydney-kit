#!/usr/bin/env node
import { resolveHostRoot } from '../src/host/paths.mjs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, statSync, readFileSync, readdirSync, mkdirSync, openSync, closeSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const flags = new Set(process.argv.slice(2));
if (flags.has('--help')) {
  console.log('Usage: node scripts/test-integrations.mjs [--check] [--full] [--help]\nDefault: all kit tests + native backend/persistent suites. --full: dependency npm test suites.\n--check: prerequisites only; no installation.\nSYDNEY_BG_ROOT / SUBAGENTS_ROOT override sibling repositories.\nAutomated tests only: no real SSH or model end-to-end validation.');
  process.exit(0);
}
for (const flag of flags) if (!['--check', '--full'].includes(flag)) { console.error(`Unknown option: ${flag}`); process.exit(2); }
const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bg = path.resolve(process.env.SYDNEY_BG_ROOT || path.join(kit, '../pi-background-tasks'));
const sub = path.resolve(process.env.SUBAGENTS_ROOT || path.join(kit, '../pi-subagents'));
const output = path.join(kit, 'dist/integration-tests', `${new Date().toISOString().replaceAll(':', '-')}-${process.pid}`);
mkdirSync(output, { recursive: true });
const summary = { startedAt: new Date().toISOString(), mode: flags.has('--full') ? 'full' : 'default', roots: { kit, bg, sub }, checks: [], steps: [] };
const save = () => writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
const check = (name, fn) => { try { fn(); summary.checks.push({ name, ok: true }); } catch (e) { summary.checks.push({ name, ok: false, error: e.message }); } };
const required = p => { if (!existsSync(p)) throw Error(`Missing ${p}; install prerequisites manually.`); };
const subFiles = ['execution-backend', 'backend-manager-admission', 'backend-session-integration', 'backend-workflow', 'backend-recovery', 'cross-extension-rpc'].map(n => `test/${n}.test.ts`);
const bgFiles = ['tests/unit/execution-backend.test.ts', 'tests/unit/persistent-runtime.test.ts', 'tests/unit/remote-persistent.test.ts', 'tests/persistent/remote-bridge.test.mjs'];
for (const root of [kit, bg, sub]) check(root, () => {
  if (!statSync(root).isDirectory()) throw Error(`Not a directory: ${root}`);
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const require = createRequire(path.join(root, 'package.json'));
  const dependencies = { ...pkg.dependencies };
  if (root !== kit) Object.assign(dependencies, { '@earendil-works/pi-ai': '*', '@earendil-works/pi-coding-agent': '*', '@earendil-works/pi-tui': '*', typebox: '*' });
  if (root === bg) Object.assign(dependencies, { tsx: '*', typescript: '*' });
  if (root === sub) dependencies.vitest = '*';
  for (const dependency of Object.keys(dependencies)) {
    const found = require.resolve.paths(dependency)?.some(base => existsSync(path.join(base, dependency, 'package.json')));
    if (!found) throw Error(`Missing dependency ${dependency} in ${root}; install manually.`);
  }
});
check('host SDK', () => {
  for (const name of ['pi-coding-agent', 'pi-ai', 'pi-tui']) required(path.join(resolveHostRoot(), name, 'package.json'));
});
for (const [root, files] of [[sub, subFiles], [bg, bgFiles]]) for (const file of files) check(file, () => required(path.join(root, file)));
const vitest = path.join(sub, 'node_modules/vitest/vitest.mjs');
const tsx = path.join(bg, 'node_modules/tsx/dist/cli.mjs');
check('test runners', () => { required(vitest); required(tsx); });
console.log(`Automated tests only; not real SSH/model end-to-end validation.\nResults: ${output}`);
for (const c of summary.checks) console.log(`${c.ok ? 'OK' : 'FAIL'} ${c.name}${c.error ? ': ' + c.error : ''}`);
save();
if (summary.checks.some(c => !c.ok)) process.exit(1);
if (flags.has('--check')) process.exit(0);
const env = { ...process.env, SYDNEY_BG_ROOT: bg, SUBAGENTS_ROOT: sub };
let active;
let interrupted;
function kill(signal) {
  if (!active?.pid) return;
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(active.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-active.pid, signal); } catch (e) { if (e.code !== 'ESRCH') console.error(e); } }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrupted = signal; kill('SIGTERM'); });
const steps = readdirSync(path.join(kit, 'tests')).filter(n => n.endsWith('.test.mjs')).sort().map(n => ({ name: `kit-${n}`, cwd: kit, command: [process.execPath, path.join(kit, 'tests', n)] }));
if (flags.has('--full')) {
  for (const [name, cwd] of [['subagents', sub], ['background', bg]]) steps.push({ name, cwd, command: ['npm', 'test'] });
} else {
  steps.push({ name: 'subagents-native', cwd: sub, command: [process.execPath, vitest, 'run', ...subFiles] });
  steps.push({ name: 'background-native-persistent', cwd: bg, command: [process.execPath, tsx, '--test', ...bgFiles] });
}
for (const step of steps) {
  if (interrupted) break;
  const log = path.join(output, `${step.name}.log`);
  const fd = openSync(log, 'w');
  const started = Date.now();
  console.log(`RUN ${step.name}`);
  const result = await new Promise(resolve => {
    let done = false;
    const finish = value => { if (!done) { done = true; resolve(value); } };
    active = spawn(step.command[0], step.command.slice(1), { cwd: step.cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', fd, fd] });
    active.on('error', e => finish({ exitCode: 1, error: e.message }));
    active.on('close', (exitCode, signal) => finish({ exitCode, signal }));
    const timer = setInterval(() => { if (interrupted) kill('SIGKILL'); }, 2000);
    active.once('close', () => clearInterval(timer));
  });
  kill('SIGKILL'); // Clean up any descendants left by a completed runner.
  active = undefined;
  closeSync(fd);
  summary.steps.push({ ...step, ...result, durationMs: Date.now() - started, log });
  save();
  console.log(`${result.exitCode === 0 ? 'PASS' : 'FAIL'} ${step.name} (${Date.now() - started}ms)`);
}
summary.finishedAt = new Date().toISOString();
summary.interrupted = interrupted || null;
summary.exitCode = interrupted ? (interrupted === 'SIGINT' ? 130 : 143) : summary.steps.some(s => s.exitCode !== 0) ? 1 : 0;
save();
console.log(`Summary: ${path.join(output, 'summary.json')}`);
process.exitCode = summary.exitCode;
