import { open, mkdir, writeFile } from 'node:fs/promises';
import { createWriteToolDefinition, type WriteOperations } from '@earendil-works/pi-coding-agent';
import { features, diffs } from '../../config';
import { makePatch } from '../rendering/diff/index';

export async function executeSnapshotWrite(cwd: string, id: string, args: any, signal: any, update: any, ctx: any, backend?: { operations: WriteOperations; readBefore(path: string, max: number): Promise<Buffer> }) {
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
  let before: string | undefined, isNew = false;
  const tool = createWriteToolDefinition(cwd, { operations: {
    ...operations,
    async writeFile(path, content) {
      if (features.diff && Buffer.byteLength(content) <= diffs.maxSnapshotBytes) {
        try { before = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await readBefore(path, diffs.maxSnapshotBytes)); }
        catch (error: any) { if (error.code === 'ENOENT' || (backend && error.code === 2)) { before = ''; isNew = true; } }
      }
      await operations.writeFile(path, content);
    },
  } });
  const result = await tool.execute(id, args, signal, update, ctx);
  if (before !== undefined) {
    try { result.details = { ...result.details, sydneyDiffPatch: makePatch(args.path, before, args.content), sydneyNewFile: isNew }; } catch {}
  }
  return result;
}
