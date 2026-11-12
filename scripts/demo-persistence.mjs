#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, accessSync, constants } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plugins = [root, process.env.SYDNEY_BG_ROOT || resolve(root, '../pi-background-tasks'), process.env.SUBAGENTS_ROOT || resolve(root, '../pi-subagents')];
const flags = ['--offline', '--no-extensions', ...plugins.flatMap(p => ['-e', p]), '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-context-files'];
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
const opts = { host: 'raspi', seconds: 30 };
function help() { console.log(`Usage: node scripts/demo-persistence.mjs [--local | --host HOST] [--model MODEL]
       node scripts/demo-persistence.mjs --resume RUN_DIR [--model MODEL]
       node scripts/demo-persistence.mjs --observe RUN_DIR [--seconds N]
       node scripts/demo-persistence.mjs --check [--local | --host HOST]
Requires an interactive stdin/stdout TTY to launch Pi. Default SSH host: raspi.
--seconds N  Finite observer duration (default 30 seconds).
--check      Validate dependencies/options only; no SSH or model calls.
No permission changes, global configuration edits, or automatic task cancellation.
Tasks run for about 10 minutes; logs and metadata remain in the unique test directories.`); }
function run(cmd, args, input) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'inherit'], input, timeout: 60000, maxBuffer: 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`${cmd} failed (${r.status ?? r.signal}): ${r.error?.message || 'see stderr above'}`);
  return r.stdout;
}
function ssh(host, command, input) { return run('ssh', ['-o', 'ConnectTimeout=15', '--', host, command], input); }
function dependency(name) {
  if (!(process.env.PATH || '').split(':').some(p => { try { accessSync(join(p, name), constants.X_OK); return true; } catch { return false; } })) throw new Error(`Missing executable on PATH: ${name}`);
}
function snapshot(m) {
  if (m.local) return ['starts.log', 'heartbeat.log'].map(f => { try { return readFileSync(join(m.cwd, f), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return ''; throw e; } });
  const script = `cd ${quote(m.cwd)} || exit 1\nprintf '__STARTS__\\n'\nif [ -f starts.log ]; then cat starts.log; fi\nprintf '__HEARTBEATS__\\n'\nif [ -f heartbeat.log ]; then cat heartbeat.log; fi\n`;
  const out = ssh(m.host, 'sh -s', script);
  if (!out.includes('__STARTS__\n') || !out.includes('__HEARTBEATS__\n')) throw new Error('Invalid SSH observer response');
  const [a, b] = out.split('__STARTS__\n')[1].split('__HEARTBEATS__\n');
  return [a, b];
}
const lines = s => s.split('\n').filter(Boolean);
const beats = s => lines(s).filter(l => l.startsWith('HEARTBEAT ')).length;
async function observe(m) {
  const initial = snapshot(m); let previous = ['', '']; let current = initial;
  const baseline = beats(initial[1]); const until = Date.now() + opts.seconds * 1000;
  console.log(`Observer baseline: ${baseline} heartbeats; duration ${opts.seconds}s. No task will be stopped.`);
  while (true) {
    for (let i = 0; i < 2; i++) {
      if (!current[i].startsWith(previous[i])) console.warn('Log replaced/truncated; evidence requires manual inspection.');
      const extra = current[i].startsWith(previous[i]) ? current[i].slice(previous[i].length) : current[i];
      if (extra) process.stdout.write(extra);
    }
    previous = current;
    console.log(`Status: START=${lines(current[0]).filter(l => l.startsWith('START ')).length}, heartbeats=${beats(current[1])}, growth=${beats(current[1]) - baseline}`);
    if (Date.now() >= until) break;
    await new Promise(r => setTimeout(r, Math.min(3000, until - Date.now())));
    current = snapshot(m);
  }
  const count = lines(current[0]).filter(l => l.startsWith('START ')).length;
  const growth = beats(current[1]) - baseline;
  console.log(`Evidence: START=${count}; heartbeats after observer baseline +${growth}.`);
  if (count !== 1 || growth <= 0) {
    console.log('NOT VERIFIED: task may not have started, files may be missing, or task has stopped/finished. Inspect logs; no automatic restart.');
    process.exitCode = 2;
  } else console.log('Observed heartbeat growth with one START. Check Pi session/task ID for attribution; this alone does not prove plugin correctness.');
}
async function main() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help') { help(); return; }
    if (['--local', '--check'].includes(a)) opts[a.slice(2)] = true;
    else if (['--host', '--model', '--resume', '--observe', '--seconds'].includes(a)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${a}`);
      opts[a.slice(2)] = args[++i];
    } else throw new Error(`Unknown option: ${a}`);
  }
  if (opts.local && args.includes('--host')) throw new Error('--local conflicts with --host');
  if (opts.resume && opts.observe) throw new Error('--resume conflicts with --observe');
  if ((opts.resume || opts.observe) && (opts.local || args.includes('--host'))) throw new Error('Saved runs use their recorded local/host settings');
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.@:-]*$/.test(opts.host)) throw new Error('HOST must be an SSH alias or user@hostname, without options');
  opts.seconds = Number(opts.seconds);
  if (!Number.isFinite(opts.seconds) || opts.seconds <= 0 || opts.seconds > 3600) throw new Error('--seconds must be >0 and <=3600');
  let dir = opts.resume || opts.observe; let m;
  if (dir) { dir = resolve(dir); m = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')); if (m.version !== 1 || typeof m.cwd !== 'string' || !m.cwd.startsWith('/') || typeof m.local !== 'boolean' || (!m.local && !/^[a-zA-Z0-9_][a-zA-Z0-9_.@:-]*$/.test(m.host))) throw new Error('Invalid run metadata'); }
  if (!opts.observe) { dependency('pi'); for (const p of plugins) if (!existsSync(join(p, 'package.json'))) throw new Error(`Missing plugin: ${p}`); }
  if (!(m?.local ?? opts.local)) dependency('ssh');
  if (opts.check) { console.log('Dependencies/options OK. No network or model invoked.\nPi flags: ' + flags.join(' ')); return; }
  if (!opts.observe && (!process.stdin.isTTY || !process.stdout.isTTY)) throw new Error('Interactive TTY required on stdin and stdout. Run directly in a terminal (no pipe).');
  if (!dir) {
    const id = randomUUID(); dir = join(root, 'dist/persistence-demo', id); mkdirSync(dir, { recursive: true });
    let cwd = dir;
    if (!opts.local) {
      const home = ssh(opts.host, 'printenv HOME').trim();
      if (!home.startsWith('/') || /[\r\n\0]/.test(home)) throw new Error('SSH returned an invalid HOME');
      cwd = `${home}/sydney-persistence-demo-${id}`;
    }
    const script = `#!/bin/sh\ncd ${quote(cwd)} || exit 1\nprintf 'START ${id} pid=%s date=%s\\n' "$$" "$(date -u +%FT%TZ)" >> starts.log\ntrap 'printf "EXIT pid=%s date=%s\\n" "$$" "$(date -u +%FT%TZ)" >> heartbeat.log' EXIT\ntrap 'exit 143' TERM\ntrap 'exit 130' INT\ni=0\nwhile [ "$i" -lt 200 ]; do\n i=$((i+1))\n line="HEARTBEAT $i pid=$$ date=$(date -u +%FT%TZ)"\n printf '%s\\n' "$line"\n printf '%s\\n' "$line" >> heartbeat.log\n sleep 3\ndone\n`;
    if (opts.local) writeFileSync(join(cwd, 'heartbeat.sh'), script);
    else ssh(opts.host, 'sh -s', `mkdir ${quote(cwd)} || exit 1\ncat > ${quote(cwd + '/heartbeat.sh')} <<'DEMO_SCRIPT_END'\n${script}DEMO_SCRIPT_END\n`);
    m = { version: 1, id, local: !!opts.local, host: opts.local ? null : opts.host, cwd, command: `sh ${quote(cwd + '/heartbeat.sh')}`, createdAt: new Date().toISOString() };
    writeFileSync(join(dir, 'run.json'), JSON.stringify(m, null, 2) + '\n');
  }
  const entry = fileURLToPath(import.meta.url);
  console.log(`Run directory: ${dir}\nResume: node ${quote(entry)} --resume ${quote(dir)}\nObserve: node ${quote(entry)} --observe ${quote(dir)}`);
  if (!opts.observe) {
    const route = m.local ? `Work locally in ${JSON.stringify(m.cwd)}; disconnect any remote route first.` : `Call remote connect with command ${JSON.stringify('ssh ' + m.host)}, then remote chdir to ${JSON.stringify(m.cwd)}.`;
    const prompt = `${route}\n${opts.resume ? 'Resume inspection ONLY. Do not start or restart any task. Recover original task ID from session and query bg_status/bg_logs.' : `Start exactly one task using bg_run, isAgent:false, name:"persistence heartbeat", timeoutSeconds:750, command:${JSON.stringify(m.command)}. Never start it using nohup, shell backgrounding, or external SSH backgrounding. Show the returned task ID. Inspect heartbeat.log until two HEARTBEAT lines exist (a bounded 4-second wait is allowed for this explicit demo). Then clearly tell the user: exit Pi now without cancelling the task; the outer observer will check continued heartbeats. Do not wait for completion, stop the task, or exit Pi yourself.`}\nAll task logs stay in ${JSON.stringify(m.cwd)}. Do not change permissions or global configuration. No automatic cancellation.`;
    const code = await new Promise((res, rej) => { const child = spawn('pi', [...flags, ...(opts.model ? ['--model', opts.model] : []), ...(opts.resume ? ['--continue'] : []), '--', prompt], { cwd: dir, stdio: 'inherit' }); child.on('error', rej); child.on('exit', (code, signal) => res({ code, signal })); });
    console.log(`Pi exited: ${JSON.stringify(code)}. Observing independently now.`);
  }
  await observe(m);
}
main().catch(e => { console.error(`Persistence demo: ${e.message}`); process.exitCode = 1; });
