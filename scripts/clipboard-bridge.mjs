#!/usr/bin/env node
// Runs on the machine where you copy images. Serves its clipboard to Pi sessions over an SSH RemoteForward.
// Usage: node scripts/clipboard-bridge.mjs [--port 7395]
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveHostRoot } from '../src/host/paths.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const host = resolveHostRoot();
const hostPath = relative => path.join(host, relative);
let createJiti;
try { ({ createJiti } = await import(pathToFileURL(hostPath('pi-coding-agent/dist/core/extensions/jiti-loader.js')).href)); }
catch { console.error(`Pi not found under ${host}. Set SYDNEY_KIT_PI_ROOT to the directory containing pi-coding-agent and pi-tui.`); process.exit(1); }
const jiti = createJiti(import.meta.url, { alias: { '@earendil-works/pi-coding-agent': hostPath('pi-coding-agent/dist/index.js'), '@earendil-works/pi-tui': hostPath('pi-tui/dist/index.js') } });
const { pasteImage: config } = await jiti.import(path.join(root, 'config.ts'));
const { createClipboardReader, readUnixClipboard } = await jiti.import(path.join(root, 'src/clipboard/clipboard-reader.ts'));
const { serveClipboardBridge, releaseInside } = await jiti.import(path.join(root, 'src/clipboard/clipboard-bridge.ts'));

const portIndex = process.argv.indexOf('--port');
const port = portIndex > 0 ? Number(process.argv[portIndex + 1]) : config.bridgePort;
if (!Number.isInteger(port) || port <= 0 || port > 65535) { console.error('Invalid --port'); process.exit(2); }

const scratch = await mkdtemp(path.join(os.tmpdir(), 'sydney-kit-bridge-'));
let saved = 0;
const save = async (bytes, ext) => { const file = path.join(scratch, `clipboard-${Date.now()}-${saved++}${ext}`); await writeFile(file, bytes, { flag: 'wx' }); return file; };
// The bridge always reads the clipboard of this machine, even when it is itself an SSH session.
const env = { ...process.env, SSH_CONNECTION: '', SSH_TTY: '', SSH_CLIENT: '' };
const noBridge = async () => undefined;
const reader = process.platform === 'win32' ? createClipboardReader(scratch, save)
  : { read: signal => readUnixClipboard(save, scratch, signal, env, process.platform, undefined, noBridge), warm() {}, stop() {} };
reader.warm();
const time = () => new Date().toTimeString().slice(0, 8);
const server = await serveClipboardBridge({ port, read: () => reader.read(), release: releaseInside(scratch), log: line => console.log(`${time()} ${line}`) })
  .catch(error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use; is another bridge already running?` : error.message); process.exit(1); });
console.log(`sydney-kit clipboard bridge listening on 127.0.0.1:${port}`);
console.log(`ssh config:  RemoteForward ${config.bridgeSocket.replace('{user}', '%r')} 127.0.0.1:${port}`);
const stop = async () => { server.close(); reader.stop(); await rm(scratch, { recursive: true, force: true }); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
