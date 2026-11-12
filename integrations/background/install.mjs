import fs from 'node:fs';
import path from 'node:path';

// Historical entry point retained as a read-only source compatibility check.
const [root, ...options] = process.argv.slice(2);
if (!root || options.length) {
  console.error('Usage: node integrations/background/install.mjs <pi-background-tasks root> (read-only check; --record is no longer supported)');
  process.exit(1);
}
try {
  const contract = fs.readFileSync(path.join(root, 'src/core/execution-backend.ts'), 'utf8');
  const extension = fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8');
  const registry = fs.readFileSync(path.join(root, 'src/core/registry.ts'), 'utf8');
  if (!['BackgroundExecutionProvider', 'sydney-kit:bg-execution:v1', 'sydney-kit:bg-hook:v1'].every(token => contract.includes(token)) ||
      !['BG_EXECUTION_CHANNEL', 'BG_EXECUTION_HOOK_CHANNEL', 'resolveExecution'].every(token => extension.includes(token)) ||
      !registry.includes('resolveExecution')) {
    throw new Error('Native execution provider contract or readiness hook missing');
  }
  console.log('Native background source contract detected. No files changed. Load this pi-background-tasks release and reload Pi; runtime readiness is checked by the extension.');
} catch (error) {
  console.error(`Compatibility check failed: ${error.message}. Upgrade to a pi-background-tasks release with native execution provider support and reload Pi. Historical source patching is no longer supported.`);
  process.exitCode = 1;
}
