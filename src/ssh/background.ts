import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { randomBytes } from 'node:crypto';

export const BG_PROVIDER_CHANNEL = 'sydney-kit:bg-execution:v1';
const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** Owns one connection and one process group. Never reconnects or replays. */
export function remoteBackgroundChild(connect: () => Promise<any>, cwd: string, command: string) {
  const child = new EventEmitter() as any;
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  let client: any, pgid: string | undefined, startTick: string | undefined, finished = false, stopping = false;
  let stopDeadline: ReturnType<typeof setTimeout> | undefined;
  let stopPromise: Promise<void> | undefined;
  const marker = `SYDNEY_${randomBytes(16).toString('hex')}:`;
  const fail = (error: unknown) => {
    if (finished) return;
    finished = true;
    clearTimeout(stopDeadline);
    child.emit('error', new Error(`Remote outcome unknown; command will not be replayed: ${String(error)}`));
    client?.end();
  };
  const stop = () => {
    if (!client || !pgid || finished) return;
    const group = pgid;
    if (stopPromise) return;
    stopPromise = new Promise<void>((resolve, reject) => {
    stopDeadline = setTimeout(() => fail('process-group stop deadline exceeded'), 6000);
    const stopScript = `observed=$(awk '{print $22}' /proc/${group}/stat 2>/dev/null); if [ -z "$observed" ]; then exit 0; fi; [ "$observed" = ${quote(startTick!)} ] || exit 2; kill -KILL -- -${group} 2>/dev/null; for i in {1..30}; do if ! kill -0 -- -${group} 2>/dev/null; then exit 0; fi; sleep 0.1; done; exit 1`;
    client.exec(`printf %s ${Buffer.from(stopScript).toString('base64')} | base64 -d | bash`, (err: any, stream: any) => {
      if (err) { reject(err); return; }
      stream.on('error', reject);
      stream.on('close', (code: number) => { if (code !== 0) reject(new Error('process-group stop could not be verified')); else resolve(); });
      stream.resume(); stream.stderr.resume();
    });
    });
    void stopPromise.catch(fail);
  };
  child.kill = () => { stopping = true; stop(); return true; };
  // Async connect lets registry attach all listeners before any output/error.
  void Promise.resolve().then(connect).then((connection) => {
    client = connection;
    client.on('error', fail);
    client.on('close', () => { if (!finished) fail('SSH transport closed'); });
    const script = `tick=$(awk '{print $22}' /proc/$$/stat) || exit 125; printf '%s\\n' ${quote(marker)}"$$:$tick" >&2; cd -- ${quote(cwd)} || exit; exec bash -c ${quote(command)}`;
    const encoded = Buffer.from(script).toString('base64');
    client.exec(`command -v bash setsid base64 awk >/dev/null || exit 125; printf %s ${encoded} | base64 -d | setsid bash`, (err: any, stream: any) => {
      if (err) return fail(err);
      let prefix = '';
      stream.on('data', (data: Buffer) => child.stdout.write(data));
      stream.stderr.on('data', (data: Buffer) => {
        if (pgid) { child.stderr.write(data); return; }
        prefix += data.toString();
        const newline = prefix.indexOf('\n');
        if (newline < 0) { if (prefix.length > 4096) fail('missing process group identity'); return; }
        const first = prefix.slice(0, newline);
        if (!first.startsWith(marker) || !/^\d+:\d+$/.test(first.slice(marker.length))) return fail('invalid process group identity');
        [pgid, startTick] = first.slice(marker.length).split(':');
        child.stderr.write(prefix.slice(newline + 1)); prefix = '';
        if (stopping) stop();
      });
      stream.on('error', fail);
      stream.on('close', async (code: number | undefined, signal: string | undefined) => {
        if (stopPromise) { try { await stopPromise; } catch (error) { fail(error); return; } }
        if (finished) return;
        if (code === undefined && !signal) return fail('missing remote exit status');
        finished = true;
        clearTimeout(stopDeadline);
        if (!pgid) child.stderr.write(`Remote launch failed before process identity: ${prefix}`);
        child.emit('close', code ?? 137, signal || null);
        client.end();
      });
    });
  }).catch(fail);
  return child;
}
