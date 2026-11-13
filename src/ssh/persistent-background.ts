import { installRuntime } from './runtime-bootstrap';
import { StringDecoder } from 'node:string_decoder';
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
  async function operation(method: string, params: any): Promise<any> {
    if (params.ownerSession !== undefined && (typeof params.ownerSession !== 'string' || !params.ownerSession.length)) throw new Error('Invalid ownerSession');
    let client: any; let expired = false; let clientClosed = false;
    let timer: ReturnType<typeof setTimeout>;
    let rejectTransport: (error: Error) => void = () => {};
    const transportFailure = new Promise<never>((_, reject) => { rejectTransport = reject; });
    let currentStage = 'bootstrap';
    let stderrTail = Buffer.alloc(0);
    let abortStream = () => {};
    const sensitive = new Set([bootstrap, JSON.stringify(bundle), JSON.stringify(params), ...Object.values(bundle.files)]);
    for (const value of Object.values(params)) if (typeof value === 'string' && value.length >= 8) sensitive.add(value);
    const sanitize = (text: string) => {
      for (const value of sensitive) if (value.length >= 8) text = text.split(value).join('[redacted]');
      return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').slice(-8192);
    };
    const diagnostic = (message: string) => new Error(`Persistent SSH ${currentStage}: ${message}${stderrTail.length ? '; stderr tail: ' + sanitize(stderrTail.toString('utf8')) : ''}`);
    const onError = (error: Error) => rejectTransport(diagnostic(`SSH transport error: ${sanitize(error.message)}; outcome unknown; request not replayed`));
    const onClose = () => { clientClosed = true; rejectTransport(diagnostic('SSH transport closed; outcome unknown; request not replayed')); };
    const work = (async () => {
      client = await connect();
      client.on('error', onError);
      client.on('close', onClose);
      if (expired) { client.destroy(); throw new Error('SSH connection arrived after deadline'); }
      const exec = (stage: string, command: string, input: unknown) => new Promise<any>((resolve, reject) => {
        currentStage = stage;
        sensitive.add(command);
        sensitive.add(JSON.stringify(input));
        stderrTail = Buffer.alloc(0);
        client.exec(command, (error: any, stream: any) => {
          if (error) return reject(diagnostic(`SSH exec failed: ${sanitize(String(error.message ?? error)).slice(0, 1024)}`));
          if (expired) { stream.on('error', () => {}); stream.close(); return reject(diagnostic('SSH deadline exceeded')); }
          const decoder = new StringDecoder('utf8');
          let out = '', bytes = 0, done = false, streamClosed = false;
          let exitCode: unknown, exitSignal: unknown;
          const sink = () => {};
          const cleanup = () => {
            stream.off('data', stdout); stream.stderr.off('data', stderr);
            stream.off('exit', exit); stream.off('close', close);
            stream.off('error', failure); stream.stderr.off('error', failure);
            if (!streamClosed) {
              stream.on('error', sink); stream.stderr.on('error', sink);
              stream.once('close', () => { stream.off('error', sink); stream.stderr.off('error', sink); });
            }
          };
          const finish = (error?: Error, value?: any) => {
            if (done) return;
            done = true; cleanup(); abortStream = () => {};
            error ? reject(error) : resolve(value);
          };
          const failure = (error: Error) => { finish(diagnostic(`SSH stream failed: ${sanitize(String(error?.message ?? 'unknown')).slice(0, 1024)}; outcome unknown; request not replayed`)); stream.close(); };
          abortStream = () => { finish(diagnostic('SSH stream interrupted; outcome unknown; request not replayed')); stream.close(); };
          const accept = (data: Buffer, isStdout: boolean) => {
            if (done) return;
            const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
            bytes += chunk.length;
            if (!isStdout) stderrTail = Buffer.concat([stderrTail, chunk.subarray(-8192)]).subarray(-8192);
            if (bytes > 2 * 1024 * 1024) { finish(diagnostic('Bridge output limit exceeded; response truncated')); stream.close(); }
            else if (isStdout) out += decoder.write(chunk);
          };
          const stdout = (data: Buffer) => accept(data, true);
          const stderr = (data: Buffer) => accept(data, false);
          const exit = (code: unknown, signal: unknown) => { exitCode = code; exitSignal = signal; };
          const close = (code: unknown, signal: unknown) => {
            streamClosed = true;
            out += decoder.end();
            let response: any;
            try { response = JSON.parse(out); } catch { /* Status failures take precedence over malformed output. */ }
            const message = response?.ok === false
              ? (typeof response.error === 'string' ? response.error : response.error?.message)
              : undefined;
            const detail = typeof message === 'string' ? `; Bridge error: ${sanitize(message)}` : '';
            if (signal || exitSignal) return finish(diagnostic(`SSH command terminated by signal ${sanitize(String(signal || exitSignal)).slice(0, 80)}${detail}`));
            if ((typeof code === 'number' && code !== 0) || (typeof exitCode === 'number' && exitCode !== 0)) return finish(diagnostic(`SSH command exited with code ${typeof code === 'number' && code !== 0 ? code : exitCode}${detail}`));
            if (code !== 0 && exitCode !== 0) return finish(diagnostic(`SSH command closed without verified exit status; outcome unknown${detail}`));
            if (!out.trim()) return finish(diagnostic('Empty JSON response'));
            if (response === undefined) return finish(diagnostic('Malformed or truncated JSON response'));
            if (response?.ok !== true) {
              return finish(diagnostic(typeof message === 'string' ? `Bridge error: ${sanitize(message)}` : 'Invalid bridge response envelope'));
            }
            finish(undefined, response.result);
          };
          stream.on('error', failure); stream.stderr.on('error', failure);
          stream.stderr.on('data', stderr); stream.on('data', stdout);
          stream.on('exit', exit); stream.on('close', close);
          stream.end(JSON.stringify(input));
        });
      });
      const directory = await exec('bootstrap', `node -e ${quote(bootstrap)}`, bundle);
      if (typeof directory !== 'string' || !directory.startsWith('/') || directory.includes('\0') || directory.split('/').some((part: string) => part === '..' || part === '.') || !directory.endsWith('/.pi/background-tasks-runtime/' + bundle.sha256)) throw new Error('Invalid runtime installation path');
      const bridgeCommand = `node ${quote(directory + '/remote-bridge.mjs')}`;
      const ensured = await exec('ensure', bridgeCommand, { method: 'ensure', params: {} });
      if (ensured?.protocol !== 'pi-background-tasks-remote' || ensured.version !== 1 || ensured.daemonProtocolVersion !== 1 || typeof ensured.serviceRoot !== 'string' || !ensured.serviceRoot.startsWith('/')) throw new Error('Invalid remote supervisor identity');
      if (params.ownerSession !== undefined && ensured.sessionOwnership !== 1) throw new Error('Remote daemon does not support session ownership');
      if (serviceRoot && serviceRoot !== ensured.serviceRoot) throw new Error('Remote service root changed');
      serviceRoot = ensured.serviceRoot;
      return exec(method, bridgeCommand, { method, params });
    })();
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(diagnostic('Request timed out; outcome unknown; reconnect required'));
          abortStream();
          client?.destroy();
        }, deadlineMs);
      });
      return await Promise.race([work, transportFailure, deadline]);
    } finally {
      expired = true;
      clearTimeout(timer!);
      abortStream();
      client?.off('close', onClose);
      // destroy may emit error before close; retain a sink through that boundary.
      if (clientClosed) client?.off('error', onError);
      else if (client) client.once('close', () => client.off('error', onError));
      client?.destroy();
    }
  }
  const record = (r: any, id?: string, cwd?: string, ownerSession?: string) => {
    if (!r || typeof r.id !== 'string' || !/^[\w-]{1,100}$/.test(r.id) || (id !== undefined && r.id !== id) || typeof r.cwd !== 'string' || !r.cwd.startsWith('/') || (cwd !== undefined && r.cwd !== cwd) || typeof r.name !== 'string' || typeof r.command !== 'string' || !['running','completed','failed','killed'].includes(r.status) || !Number.isFinite(r.startedAt) || typeof r.outputFile !== 'string' || !r.outputFile.startsWith('/') || r.outputFile.includes('/../') || r.outputFile !== serviceRoot + '/tasks/' + r.id + '/output.log') throw new Error('Invalid remote task record');
    if (ownerSession !== undefined && r.ownerSession !== ownerSession) throw new Error('Remote task ownership mismatch');
    for (const key of ['description','ownerSession','diagnostic']) if (r[key] !== undefined && typeof r[key] !== 'string') throw new Error('Invalid record string');
    for (const key of ['finishedAt','outputBytes']) if (r[key] !== undefined && (!Number.isFinite(r[key]) || r[key] < 0)) throw new Error('Invalid record number');
    for (const key of ['notifyOnCompletion','triggerOnCompletion']) if (r[key] !== undefined && typeof r[key] !== 'boolean') throw new Error('Invalid record flag');
    if (r.exitCode != null && !Number.isInteger(r.exitCode)) throw new Error('Invalid exit code');
    if (r.signal != null && typeof r.signal !== 'string') throw new Error('Invalid signal');
    return r;
  };
  return {
    start: async (request: any) => record(await operation('start', request), request.id, request.cwd, request.ownerSession),
    get: async (id: string, ownerSession?: string) => record(await operation('get', { id, ownerSession }), id, undefined, ownerSession),
    list: async (cwd: string, ownerSession?: string) => {
      const result: any = []; result.diagnostics = [];
      let offset = 0;
      for (let page = 0; page < 10000; page++) {
        const response = await operation('list', { cwd, offset, ownerSession });
        if (!response || !Array.isArray(response.records) || !Array.isArray(response.diagnostics)) throw new Error('Invalid task page');
        result.push(...response.records.map((r: any) => record(r, undefined, cwd, ownerSession)));
        for (const d of response.diagnostics) { if (typeof d.id !== 'string' || typeof d.message !== 'string') throw new Error('Invalid diagnostic'); result.diagnostics.push(d); }
        if (response.nextOffset == null) return result;
        if (!Number.isSafeInteger(response.nextOffset) || response.nextOffset <= offset) throw new Error('Invalid task page cursor');
        offset = response.nextOffset;
      }
      throw new Error('Task pagination limit exceeded');
    },
    cancel: async (id: string, ownerSession?: string) => record(await operation('cancel', { id, ownerSession }), id, undefined, ownerSession),
    logs: (id: string, offset: number, maxBytes: number, ownerSession?: string) => {
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 49152) return Promise.reject(new Error('Invalid log range'));
      return operation('logs', { id, offset, maxBytes, ownerSession }).then(r => {
        if (!r || typeof r.data !== 'string' || !Number.isSafeInteger(r.size) || r.size < 0 || typeof r.eof !== 'boolean' || !Number.isSafeInteger(r.nextOffset)) throw new Error('Invalid log frame');
        const bytes = Buffer.from(r.data, 'base64');
        if (offset > r.size || r.eof !== (r.nextOffset >= r.size) || bytes.toString('base64') !== r.data || bytes.length > maxBytes || r.nextOffset !== offset + bytes.length || r.nextOffset > r.size || (!r.eof && bytes.length === 0)) throw new Error('Invalid log cursor');
        return r;
      });
    },
  };
}
