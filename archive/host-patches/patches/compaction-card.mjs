// Replaces the host compaction summary component with patches/compaction-card.js.
import fs from 'node:fs';
import { runPatchCli } from './engine.mjs';
const replacement = fs.readFileSync(new URL('./compaction-card.js', import.meta.url), 'utf8');
runPatchCli({
  target: 'pi-coding-agent/dist/modes/interactive/components/compaction-summary-message.js',
  backupSuffix: 'sydney-compaction-card',
  originalSha256: '1f4c57f66126a0a8217273039dbe8fc60117064cd254e7f1fdd30477c3d5f88e',
  transform: () => replacement,
});
