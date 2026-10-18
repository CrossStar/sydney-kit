import { execFile } from 'node:child_process';
import { release } from 'node:os';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getNativeClipboard } from '@earendil-works/pi-tui';
import { pasteImage as config } from '../../config';
import { ClipboardClient } from './clipboard-client';
import { BridgeNotRunning, bridgeSocketPath, requestClipboardBridge } from './clipboard-bridge';

export class ClipboardUnavailable extends Error {}
export type ClipboardReader = { read(signal?: AbortSignal): Promise<string[]>; warm(): void; stop(): void };
type Save = (bytes: Buffer, extension: string) => Promise<string>;

export const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff']);
const mimeExtensions: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/bmp': '.bmp', 'image/x-bmp': '.bmp', 'image/tiff': '.tiff' };
const isImagePath = (path: string) => imageExtensions.has(extname(path).toLowerCase());
export const isWsl = (env = process.env) => Boolean(env.WSL_DISTRO_NAME || env.WSL_INTEROP) || /microsoft/i.test(release());
export const isSsh = (env = process.env) => Boolean(env.SSH_CONNECTION || env.SSH_TTY || env.SSH_CLIENT);

export function sniffImage(bytes: Uint8Array): string | undefined {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 12));
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg';
  if (/^GIF8[79]a/.test(b.toString('latin1', 0, 6))) return '.gif';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return '.webp';
  if (b.toString('latin1', 0, 2) === 'BM') return '.bmp';
  if (b.toString('latin1', 0, 4) === 'II*\0' || b.toString('latin1', 0, 4) === 'MM\0*') return '.tiff';
  return undefined;
}

/** Picks the most model-friendly image type the clipboard owner offers. */
export function preferredImageType(types: string[]): string | undefined {
  const normalized = types.map(t => t.trim()).filter(Boolean);
  for (const wanted of Object.keys(mimeExtensions)) {
    const match = normalized.find(t => t.split(';')[0].toLowerCase() === wanted);
    if (match) return match;
  }
  return undefined;
}

/** `text/uri-list` and GNOME's `x-special/gnome-copied-files` (first line is the action). */
export function filePathsFromUriList(text: string): string[] {
  const paths: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('file://')) continue;
    try { const path = fileURLToPath(line.trim()); if (isImagePath(path)) paths.push(path); } catch {}
  }
  return paths;
}

type Run = (command: string, args: string[], signal?: AbortSignal, env?: NodeJS.ProcessEnv) => Promise<Buffer | null | undefined>;
/** Undefined: the tool is missing. Null: it ran but produced nothing usable (empty clipboard exits non-zero). */
const run: Run = (command, args, signal, env) => new Promise((resolve, reject) => execFile(command, args,
  { encoding: 'buffer', timeout: config.processTimeoutMs, maxBuffer: config.maxFileBytes, signal, env, windowsHide: true },
  (error: any, stdout) => {
    if (signal?.aborted) reject(Error('Cancelled'));
    else if (error?.code === 'ENOENT') resolve(undefined);
    else resolve(error ? null : stdout);
  }));

async function viaTool(save: Save, signal: AbortSignal | undefined, runCommand: Run, command: string, list: string[], fetch: (type: string) => string[]) {
  const listed = await runCommand(command, list, signal);
  if (listed === undefined) return undefined;
  if (!listed) return [];
  const types = listed.toString('utf8').split(/\r?\n/);
  const image = preferredImageType(types);
  if (image) {
    const bytes = await runCommand(command, fetch(image), signal);
    return bytes?.length ? [await save(bytes, mimeExtensions[image.split(';')[0].toLowerCase()])] : [];
  }
  const files = types.find(t => t.trim() === 'text/uri-list') ?? types.find(t => t.trim() === 'x-special/gnome-copied-files');
  if (!files) return [];
  const text = await runCommand(command, fetch(files.trim()), signal);
  return text ? filePathsFromUriList(text.toString('utf8')) : [];
}

async function viaNative(save: Save): Promise<string[] | undefined> {
  const native = getNativeClipboard();
  if (!native) return undefined;
  const files = await native.getFilePaths?.();
  if (files?.length) { const images = files.filter(isImagePath); if (images.length) return images; }
  const bytes = await native.getImage();
  if (bytes === undefined) return files === undefined ? undefined : [];
  if (!bytes?.length) return [];
  const extension = sniffImage(bytes);
  return extension ? [await save(Buffer.from(bytes), extension)] : [];
}

const wslScript = fileURLToPath(new URL('../../scripts/windows/clipboard-image.ps1', import.meta.url));
/** WSLg does not receive images from Win+Shift+S; ask Windows directly through interop. */
async function viaWslPowerShell(directory: string, signal: AbortSignal | undefined, runCommand: Run): Promise<string[] | undefined> {
  const windowsPath = async (path: string) => (await runCommand('wslpath', ['-w', path], signal))?.toString('utf8').trim();
  const [script, output] = [await windowsPath(wslScript), await windowsPath(directory)];
  if (!script || !output) return undefined;
  const stdout = await runCommand('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script, '-OutputDirectory', output], signal);
  if (!stdout) return stdout === undefined ? undefined : [];
  const result = JSON.parse(stdout.toString('utf8').replace(/^\uFEFF/, ''));
  if (!Array.isArray(result.paths)) return [];
  const paths: string[] = [];
  for (const path of result.paths) { const linux = (await runCommand('wslpath', ['-u', String(path)], signal))?.toString('utf8').trim(); if (linux) paths.push(linux); }
  return paths;
}

type Bridge = (socketPath: string, signal?: AbortSignal) => Promise<{ ext: string; bytes: Buffer }[] | undefined>;
export async function readUnixClipboard(save: Save, directory: string, signal?: AbortSignal, env = process.env, platform = process.platform, runCommand: Run = run, bridge: Bridge = requestClipboardBridge): Promise<string[]> {
  // Over SSH the user's clipboard is on the client machine; a forwarded bridge socket reaches it.
  // Also tried without a display, which covers tmux sessions that outlived the SSH variables.
  if (isSsh(env) || (platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY)) {
    try {
      const images = await bridge(bridgeSocketPath(env), signal);
      if (images) { const paths: string[] = []; for (const image of images) paths.push(await save(image.bytes, image.ext)); return paths; }
    } catch (error) {
      if (error instanceof BridgeNotRunning) throw new ClipboardUnavailable(error.message);
      throw error;
    }
  }
  if (platform === 'darwin') {
    const result = await viaNative(save);
    if (result === undefined) throw new ClipboardUnavailable('无法加载 macOS 剪贴板组件');
    return result;
  }
  const wsl = isWsl(env);
  const runWithEnv: Run = (command, args, signal) => runCommand(command, args, signal, env);
  let result: string[] | undefined;
  if (env.WAYLAND_DISPLAY || env.XDG_SESSION_TYPE === 'wayland' || wsl) result = await viaTool(save, signal, runWithEnv, 'wl-paste', ['--list-types'], type => ['--type', type, '--no-newline']);
  if (result === undefined && env.DISPLAY) result = await viaTool(save, signal, runWithEnv, 'xclip', ['-selection', 'clipboard', '-t', 'TARGETS', '-o'], type => ['-selection', 'clipboard', '-t', type, '-o']);
  if (!result?.length && wsl) result = (await viaWslPowerShell(directory, signal, runWithEnv)) ?? result;
  if (result === undefined && env.DISPLAY) result = await viaNative(save);
  if (result !== undefined) return result;
  if (isSsh(env)) throw new ClipboardUnavailable(`Pi 通过 SSH 运行在远端，未找到剪贴板桥接 ${bridgeSocketPath(env)}：请按 docs/PASTE-IMAGE.md 配置 RemoteForward`);
  throw new ClipboardUnavailable('未找到可用的剪贴板工具：Wayland 请安装 wl-clipboard，X11 请安装 xclip');
}

export function createClipboardReader(directory: string, save: Save): ClipboardReader {
  if (process.platform === 'win32') {
    const client = new ClipboardClient(directory, config.processTimeoutMs);
    return { read: signal => client.read(signal), warm: () => void client.warm().catch(() => {}), stop: () => client.stop() };
  }
  return { read: signal => readUnixClipboard(save, directory, signal), warm() {}, stop() {} };
}
