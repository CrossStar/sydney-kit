import { posix } from 'node:path';

/** Resolve the raw remote operand before the host SDK can apply Windows/home rules.
 * Operation callbacks deliberately ignore the SDK-resolved path: each call owns one file.
 */
export function remoteFileTarget(raw: string, cwd: string, home?: string) {
  const path = raw.replace(/^@/, '');
  if (/^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')) throw new Error('Use a POSIX remote path, not a Windows drive or UNC path');
  let file: string;
  if (path === '~' || path.startsWith('~/')) {
    if (!home?.startsWith('/')) throw new Error('Remote home directory is unavailable');
    file = posix.join(home, path.slice(2));
  } else file = posix.isAbsolute(path) ? posix.normalize(path) : posix.join(cwd, path);
  return Object.freeze({ file, directory: posix.dirname(file), map: (_sdkPath: string) => file });
}
