import { connect, createServer, type Server } from 'node:net';
import { readFile, stat, unlink } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { extname, sep } from 'node:path';
import { pasteImage as config } from '../../config';

/** Exact request line. Anything else (an HTTP probe from a browser, a port scanner) is dropped unanswered. */
export const BRIDGE_REQUEST = 'sydney-kit-clipboard/1 read\n';
type BridgeImage = { ext: string; data: string };
type BridgeResponse = { images: BridgeImage[] } | { error: string };
const bridgeExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff']);
// One full-size image in base64 plus JSON overhead.
const responseLimit = Math.ceil(config.maxFileBytes * 4 / 3) + 64 * 1024;

export class BridgeNotRunning extends Error {}
export const bridgeSocketPath = (env = process.env) =>
  config.bridgeSocket.replace('{user}', env.USER || env.LOGNAME || userInfo().username);

/**
 * Local side. `read` returns image paths from the local clipboard; `release` deletes the ones the reader created.
 * Requests are served one at a time because the clipboard is a single shared resource.
 */
export function serveClipboardBridge(options: { port: number; host?: string; read: () => Promise<string[]>; release?: (paths: string[]) => Promise<void>; log?: (line: string) => void }): Promise<Server> {
  let busy = false;
  const server = createServer(socket => {
    let received = '';
    socket.setTimeout(5000, () => socket.destroy());
    socket.on('error', () => {});
    socket.on('data', async chunk => {
      received += chunk.toString('latin1');
      if (!BRIDGE_REQUEST.startsWith(received.slice(0, BRIDGE_REQUEST.length))) { socket.destroy(); return; }
      if (received.length < BRIDGE_REQUEST.length) return;
      socket.removeAllListeners('data');socket.setTimeout(0);
      const send = (response: BridgeResponse) => socket.end(JSON.stringify(response) + '\n');
      if (busy) { send({ error: 'busy' }); return; }
      busy = true;
      let paths: string[] = [];
      try {
        paths = await options.read();
        const images: BridgeImage[] = [];
        let total = 0;
        for (const path of paths) {
          const ext = extname(path).toLowerCase();
          if (!bridgeExtensions.has(ext)) continue;
          const size = (await stat(path)).size;
          if (size > config.maxFileBytes || total + size > config.maxFileBytes) continue;
          total += size;
          images.push({ ext, data: (await readFile(path)).toString('base64') });
        }
        options.log?.(`sent ${images.length} image(s), ${total} bytes`);
        send({ images });
      } catch (error) {
        options.log?.(`clipboard read failed: ${(error as Error).message}`);
        send({ error: (error as Error).message || 'Clipboard read failed' });
      } finally {
        busy = false;
        await options.release?.(paths).catch(() => {});
      }
    });
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(options.port, options.host ?? '127.0.0.1', () => resolve(server)); });
}

/**
 * Remote side. Undefined: no forwarded socket here. Throws BridgeNotRunning when ssh forwarded the socket
 * but nothing is listening on the local port (sshd accepts, then closes without data).
 */
export function requestClipboardBridge(socketPath: string, signal?: AbortSignal, timeoutMs = config.bridgeTimeoutMs): Promise<{ ext: string; bytes: Buffer }[] | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];let size = 0, settled = false;
    const socket = connect(socketPath);
    const finish = (error?: Error, value?: { ext: string; bytes: Buffer }[]) => {
      if (settled) return;settled = true;clearTimeout(timer);signal?.removeEventListener('abort', abort);socket.destroy();
      error ? reject(error) : resolve(value);
    };
    const abort = () => finish(Error('Cancelled'));
    const timer = setTimeout(() => finish(Error('Clipboard bridge timed out')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    socket.on('error', (error: any) => {
      if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED') finish(undefined, undefined);
      else finish(error);
    });
    socket.on('connect', () => socket.write(BRIDGE_REQUEST));
    socket.on('data', chunk => { size += chunk.length; if (size > responseLimit) finish(Error('Clipboard bridge response too large')); else chunks.push(chunk); });
    socket.on('end', () => {
      if (!size) { finish(new BridgeNotRunning('SSH 转发已建立，但本地剪贴板桥接未运行：请在本地运行 clipboard-bridge.mjs')); return; }
      try {
        const response = JSON.parse(Buffer.concat(chunks).toString('utf8')) as BridgeResponse;
        if ('error' in response) { finish(Error(response.error === 'busy' ? 'Clipboard bridge busy' : 'Local clipboard read failed')); return; }
        if (!Array.isArray(response.images)) throw Error('Invalid response');
        const images = response.images
          .filter(image => typeof image?.ext === 'string' && bridgeExtensions.has(image.ext) && typeof image.data === 'string')
          .map(image => ({ ext: image.ext === '.jpeg' ? '.jpg' : image.ext === '.tif' ? '.tiff' : image.ext, bytes: Buffer.from(image.data, 'base64') }))
          .filter(image => image.bytes.length > 0 && image.bytes.length <= config.maxFileBytes);
        finish(undefined, images);
      } catch { finish(Error('Invalid clipboard bridge response')); }
    });
  });
}

/** Deletes only files that live inside the reader's scratch directory, never the user's own copied files. */
export const releaseInside = (directory: string) => async (paths: string[]) => {
  for (const path of paths) if (path.startsWith(directory + sep)) await unlink(path).catch(() => {});
};
