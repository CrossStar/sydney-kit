import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createWriteToolDefinition, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { diffs as config } from '../../config';
import { makePatch } from '../rendering/diff/index';

/** Wraps Pi's write tool to capture the previous file content, so the renderer can show a diff for overwrites. */
export default function registerWriteSnapshot(pi: ExtensionAPI) {
  const base = createWriteToolDefinition(process.cwd());
  pi.registerTool({
    ...base,
    async execute(id, args, signal, onUpdate, ctx) {
      let before: string | undefined, isNew = false;
      const tool = createWriteToolDefinition(process.cwd(), {
        operations: {
          mkdir: async dir => { await mkdir(dir, { recursive: true }); },
          writeFile: async (path, content) => {
            try {
              if ((await stat(path)).size <= config.maxSnapshotBytes) before = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await readFile(path));
            } catch (e: any) {
              if (e.code === 'ENOENT') { before = ''; isNew = true; }
            }
            await writeFile(path, content, 'utf8');
          },
        },
      });
      const result = await tool.execute(id, args, signal, onUpdate, ctx);
      if (before !== undefined && Buffer.byteLength(args.content, 'utf8') <= config.maxSnapshotBytes) {
        try { result.details = { ...result.details, sydneyDiffPatch: makePatch(args.path, before, args.content), sydneyNewFile: isNew }; } catch {}
      }
      return result;
    },
  });
}
