import { createWriteToolDefinition, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { executeSnapshotWrite } from '../ssh/snapshot';

/** Local and remote writes share the same bounded snapshot metadata contract. */
export default function registerWriteSnapshot(pi: ExtensionAPI) {
  pi.registerTool({
    ...createWriteToolDefinition(process.cwd()),
    execute(id, args, signal, onUpdate, ctx) {
      return executeSnapshotWrite(process.cwd(), id, args, signal, onUpdate, ctx);
    },
  });
}
