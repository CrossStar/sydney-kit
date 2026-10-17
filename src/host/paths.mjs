import path from 'node:path';
import { homedir } from 'node:os';
// Explicit settings/--root take precedence; the default matches a Bun global installation.
export function resolveHostRoot(explicit = process.env.SYDNEY_KIT_PI_ROOT) {
  return path.resolve(explicit || path.join(homedir(), '.bun/install/global/node_modules/@earendil-works'));
}
