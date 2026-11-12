import { installRuntime } from './runtime-bootstrap';
import { createHash } from 'node:crypto';

export interface RuntimeBundle { protocol: 1; sha256: string; files: Record<string, string> }
const names = ['daemon.mjs', 'remote-bridge.mjs', 'shared.mjs', 'supervisor.mjs', 'windows-tree.mjs'];
export function runtimeDigest(files: Record<string, string>): string {
  return createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))))).digest('hex');
}
export function validateRuntime(bundle: RuntimeBundle): RuntimeBundle {
  if (!bundle || bundle.protocol !== 1 || JSON.stringify(Object.keys(bundle.files).sort()) !== JSON.stringify(names) || Object.values(bundle.files).some(v => typeof v !== 'string') || runtimeDigest(bundle.files) !== bundle.sha256) throw new Error('Invalid persistent background runtime bundle');
  return structuredClone(bundle);
}
export function persistentRouteId(route: any): string {
  const identity = (hop: any) => ({ username: hop.username, host: hop.host, port: hop.port });
  return 'ssh:' + createHash('sha256').update(JSON.stringify([...route.jumps ?? [], route].map(identity))).digest('hex');
}
const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
// Input is data on stdin, never shell source. Versions are immutable and race-safe.
const bootstrap = '(' + installRuntime.toString() + ')();';

/** Every operation owns a short route; uncertain operations are never replayed. */
export function persistentBackground(connect: () => Promise<any>, supplied: RuntimeBundle, deadlineMs = 30000) {
  const bundle = validateRuntime(supplied);
  let serviceRoot: string | undefined;
  async function operation(method: string, params: unknown): Promise<any> {
    let client: any; let expired = false;
    let timer: ReturnType<typeof setTimeout>;
    let rejectTransport: (error: Error) => void = () => {};
    const transportFailure = new Promise<never>((_, reject) => { rejectTransport = reject; });
    const onError = (error: Error) => rejectTransport(error);
    const onClose = () => rejectTransport(new Error('SSH transport closed; outcome unknown; request not replayed'));
    const work = (async () => {
      client = await connect();
      client.on('error', onError);
      client.on('close', onClose);
      if (expired) { client.destroy(); throw new Error('SSH connection arrived after deadline'); }
      const exec = (command: string, input: unknown) => new Promise<any>((resolve, reject) => {
        client.exec(command, (error: any, stream: any) => {
          if (error) return reject(error);
          if (expired) { stream.close(); return reject(new Error('SSH deadline exceeded')); }
          let out = '';
          let bytes = 0;
          const accept = (data: Buffer, stdout: boolean) => {
            bytes += data.length;
            if (bytes > 2 * 1024 * 1024) {
              stream.close();
              reject(new Error('Bridge output limit exceeded'));
            } else if (stdout) {
              out += data.toString();
            }
          };
          stream.on('error', reject);
          stream.stderr.on('data', (data: Buffer) => accept(data, false));
          stream.on('data', (data: Buffer) => accept(data, true));
          stream.on('close', () => {
            try {
              const response = JSON.parse(out);
              if (response.ok !== true) {
                throw new Error(response.error?.message ?? 'Invalid bridge response');
              }
              resolve(response.result);
            } catch (error) {
              reject(error);
            }
          });
          stream.end(JSON.stringify(input));
        });
      });
      const directory = await exec(`node -e ${quote(bootstrap)}`, bundle);
      if (typeof directory !== 'string' || !directory.startsWith('/') || directory.includes('\0') || directory.split('/').some((part: string) => part === '..' || part === '.') || !directory.endsWith('/.pi/background-tasks-runtime/' + bundle.sha256)) throw new Error('Invalid runtime installation path');
      const bridgeCommand = `node ${quote(directory + '/remote-bridge.mjs')}`;
      const ensured = await exec(bridgeCommand, { method: 'ensure', params: {} });
      if (ensured?.protocol !== 'pi-background-tasks-remote' || ensured.version !== 1 || ensured.daemonProtocolVersion !== 1 || typeof ensured.serviceRoot !== 'string' || !ensured.serviceRoot.startsWith('/')) throw new Error('Invalid remote supervisor identity');
      if (serviceRoot && serviceRoot !== ensured.serviceRoot) throw new Error('Remote service root changed');
      serviceRoot = ensured.serviceRoot;
      return exec(bridgeCommand, { method, params });
    })();
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          client?.destroy();
          reject(new Error('Persistent SSH request timed out; outcome unknown; reconnect required'));
        }, deadlineMs);
      });
      return await Promise.race([work, transportFailure, deadline]);
    } finally {
      expired = true;
      clearTimeout(timer!);
      client?.off('close', onClose);
      // destroy may emit error before close; retain a sink through that boundary.
      if (client) client.once('close', () => client.off('error', onError));
      client?.destroy();
    }
  }
  const record = (r: any, id?: string, cwd?: string) => {
    if (!r || typeof r.id !== 'string' || !/^[\w-]{1,100}$/.test(r.id) || (id !== undefined && r.id !== id) || typeof r.cwd !== 'string' || !r.cwd.startsWith('/') || (cwd !== undefined && r.cwd !== cwd) || typeof r.name !== 'string' || typeof r.command !== 'string' || !['running','completed','failed','killed'].includes(r.status) || !Number.isFinite(r.startedAt) || typeof r.outputFile !== 'string' || !r.outputFile.startsWith('/') || r.outputFile.includes('/../') || r.outputFile !== serviceRoot + '/tasks/' + r.id + '/output.log') throw new Error('Invalid remote task record');
    for (const key of ['description','ownerSession','diagnostic']) if (r[key] !== undefined && typeof r[key] !== 'string') throw new Error('Invalid record string');
    for (const key of ['finishedAt','outputBytes']) if (r[key] !== undefined && (!Number.isFinite(r[key]) || r[key] < 0)) throw new Error('Invalid record number');
    for (const key of ['notifyOnCompletion','triggerOnCompletion']) if (r[key] !== undefined && typeof r[key] !== 'boolean') throw new Error('Invalid record flag');
    if (r.exitCode != null && !Number.isInteger(r.exitCode)) throw new Error('Invalid exit code');
    if (r.signal != null && typeof r.signal !== 'string') throw new Error('Invalid signal');
    return r;
  };
  return {
    start: async (request: any) => record(await operation('start', request), request.id, request.cwd),
    get: async (id: string) => record(await operation('get', { id }), id),
    list: async (cwd: string) => {
      const result: any = []; result.diagnostics = [];
      let offset = 0;
      for (let page = 0; page < 10000; page++) {
        const response = await operation('list', { cwd, offset });
        if (!response || !Array.isArray(response.records) || !Array.isArray(response.diagnostics)) throw new Error('Invalid task page');
        result.push(...response.records.map((r: any) => record(r, undefined, cwd)));
        for (const d of response.diagnostics) { if (typeof d.id !== 'string' || typeof d.message !== 'string') throw new Error('Invalid diagnostic'); result.diagnostics.push(d); }
        if (response.nextOffset == null) return result;
        if (!Number.isSafeInteger(response.nextOffset) || response.nextOffset <= offset) throw new Error('Invalid task page cursor');
        offset = response.nextOffset;
      }
      throw new Error('Task pagination limit exceeded');
    },
    cancel: async (id: string) => record(await operation('cancel', { id }), id),
    logs: (id: string, offset: number, maxBytes: number) => {
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 49152) return Promise.reject(new Error('Invalid log range'));
      return operation('logs', { id, offset, maxBytes }).then(r => {
        if (!r || typeof r.data !== 'string' || !Number.isSafeInteger(r.size) || r.size < 0 || typeof r.eof !== 'boolean' || !Number.isSafeInteger(r.nextOffset)) throw new Error('Invalid log frame');
        const bytes = Buffer.from(r.data, 'base64');
        if (offset > r.size || r.eof !== (r.nextOffset >= r.size) || bytes.toString('base64') !== r.data || bytes.length > maxBytes || r.nextOffset !== offset + bytes.length || r.nextOffset > r.size || (!r.eof && bytes.length === 0)) throw new Error('Invalid log cursor');
        return r;
      });
    },
  };
}
