import { open, mkdir, writeFile } from 'node:fs/promises';
import { createWriteToolDefinition, type WriteOperations } from '@earendil-works/pi-coding-agent';
import { features, diffs } from '../../config';
import { makePatch } from '../rendering/diff/index';

export async function executeSnapshotWrite(cwd: string, id: string, args: any, signal: any, update: any, ctx: any, backend?: { host?: string; path?: string; displayPath?: string; operations: WriteOperations; readBefore(path: string, max: number): Promise<Buffer> }) {
  const operations = backend?.operations ?? {
    mkdir: async (path: string) => { await mkdir(path, { recursive: true }); },
    writeFile: async (path: string, content: string) => { await writeFile(path, content, 'utf8'); },
  };
  const readBefore = backend?.readBefore ?? (async (path: string, max: number) => {
    const file = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(max + 1);
      let bytesRead = 0;
      while (bytesRead < buffer.length) {
        const part = await file.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
        if (!part.bytesRead) break;
        bytesRead += part.bytesRead;
      }
      if (bytesRead > max) throw new Error('Snapshot too large');
      return buffer.subarray(0, bytesRead);
    } finally { await file.close(); }
  });
  let writeStarted = false;
  let before: string | undefined, isNew = false;
  let target = args.path, reason = 'snapshot disabled';
  const tool = createWriteToolDefinition(cwd, { operations: {
    ...operations,
    async writeFile(path, content) {
      target = path;
      reason = features.diff ? 'new content exceeds snapshot limit' : 'snapshot disabled';
      if (features.diff && Buffer.byteLength(content) <= diffs.maxSnapshotBytes) {
        try { before = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await readBefore(path, diffs.maxSnapshotBytes)); }
        catch (error: any) {
          if (error.code === 'ENOENT' || (backend && error.code === 2)) { before = ''; isNew = true; }
          else reason = /too large/i.test(error.message) ? 'previous content exceeds snapshot limit' : 'previous content unreadable or not UTF-8';
        }
      }
      writeStarted = true;
      await operations.writeFile(path, content);
    },
  } });
  let result;
  try { result = await tool.execute(id, args, signal, update, ctx); }
  catch (error: any) {
    if (!backend || !writeStarted || !['ECONNRESET', 'EPIPE', 'ENOTCONN', 'ETIMEDOUT'].includes(error?.code)) throw error;
    return { isError: true, content: [{ type: 'text' as const, text: `${error.message}\nWrite outcome unknown; read the file to confirm.` }], details: { sydneyWrite: { path: backend.path ?? target, displayPath: backend.displayPath, host: backend.host, outcome: 'unverified' } } };
  }
  result.details = { ...result.details, sydneyWrite: { path: backend?.path ?? target, host: backend?.host, displayPath: backend?.displayPath, unchanged: before !== undefined && before === args.content, eofOnly: !isNew && before !== undefined && before !== args.content && before.replace(/\n$/, '') === args.content.replace(/\n$/, ''), reason: before === undefined ? reason : undefined } };
  if (before !== undefined) {
    try { result.details = { ...result.details, sydneyDiffPatch: makePatch(args.path, before, args.content), sydneyNewFile: isNew }; } catch { result.details.sydneyWrite.reason = 'diff generation failed'; }
  }
  return result;
}
