import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {hostImport} from './helpers/paths.mjs';
const {createJiti} = await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');
const {installRuntime} = await createJiti(import.meta.url).import('../src/ssh/runtime-bootstrap.ts');
const files = Object.fromEntries(['daemon.mjs','remote-bridge.mjs','shared.mjs','supervisor.mjs','windows-tree.mjs'].map(name => [name, '// fixture: never executed\n']));
const sha256 = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
const bundle = {files, sha256};
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-bootstrap-test-'));
const base = path.join(home, '.pi');
const root = path.join(base, 'background-tasks-runtime');
const dest = path.join(root, sha256);
const shim = path.join(home, 'home.cjs');
fs.writeFileSync(shim, `require('node:os').homedir=()=>${JSON.stringify(home)};`);
function run(ok, pattern) {
  const child = spawnSync(process.execPath, ['--require', shim, '-e', `(${installRuntime.toString()})()`], {
    env: {...process.env, NODE_OPTIONS: ''}, input: JSON.stringify(bundle), encoding: 'utf8', timeout: 10000,
  });
  assert.ifError(child.error);
  const reply = JSON.parse(child.stdout);
  assert.equal(child.status, ok ? 0 : 1, child.stdout + child.stderr);
  assert.equal(reply.ok, ok);
  if (pattern) assert.match(reply.error.message, pattern);
  return reply;
}
try {
  for (const mode of [0o755, 0o750, 0o700]) {
    fs.mkdirSync(base, {recursive: true}); fs.chmodSync(base, mode);
    run(true);
    assert.equal(fs.statSync(base).mode & 0o777, mode);
  }
  for (const mode of [0o775, 0o707]) {
    fs.chmodSync(base, mode);
    const reply = run(false, /reason=permissions expected=group\/other-not-writable actual=/);
    assert.ok(reply.error.message.includes(JSON.stringify(base)));
    assert.equal(fs.statSync(base).mode & 0o777, mode);
  }
  fs.chmodSync(base, 0o755);
  for (const dir of [root, dest]) {
    fs.chmodSync(dir, 0o755);
    run(false, /reason=permissions expected=0700 actual=0755/);
    fs.chmodSync(dir, 0o700);
  }
  const file = path.join(dest, 'daemon.mjs');
  fs.chmodSync(file, 0o644);
  run(false, /reason=permissions expected=0600 actual=0644/);
  fs.chmodSync(file, 0o600);
  fs.writeFileSync(file, '// corrupted secret content');
  const reply = run(false, /Installed runtime corrupted/);
  assert.ok(!reply.error.message.includes('secret content'));
  fs.writeFileSync(file, files['daemon.mjs']);
  fs.renameSync(base, path.join(home, 'real-pi'));
  fs.symlinkSync(path.join(home, 'real-pi'), base);
  run(false, /reason=type expected=directory actual=symbolic-link/);
  console.log('PASS isolated real Node runtime bootstrap permissions and integrity');
} finally {
  fs.rmSync(home, {recursive: true, force: true});
}
