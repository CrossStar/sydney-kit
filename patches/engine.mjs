import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveHostRoot } from '../src/host/paths.mjs';
import { PI_HOST_VERSION } from '../src/host/version.mjs';

export { PI_HOST_VERSION };

const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

function replaceAtomically(target, data) {
  const temp = target + '.sydney-tmp';
  fs.writeFileSync(temp, data, { flag: 'wx' });
  try { fs.renameSync(temp, target); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

function checkHostVersion(root) {
  for (const pkg of ['pi-coding-agent', 'pi-tui']) {
    const { version } = JSON.parse(fs.readFileSync(path.join(root, pkg, 'package.json'), 'utf8'));
    if (version !== PI_HOST_VERSION) throw Error(`Unsupported ${pkg} ${version}; expected ${PI_HOST_VERSION}. No files changed.`);
  }
}

// Only a file whose hash matches the verified original, or that equals transform(verified backup), is ever touched.
function inspect(spec, root) {
  const target = path.join(root, spec.target);
  const backup = `${target}.${spec.backupSuffix}-${PI_HOST_VERSION}.bak`;
  const current = fs.readFileSync(target, 'utf8');
  let original;
  if (sha256(current) === spec.originalSha256) original = current;
  else if (fs.existsSync(backup)) {
    original = fs.readFileSync(backup, 'utf8');
    if (sha256(original) !== spec.originalSha256 || current !== spec.transform(original)) throw Error('Target or backup differs from verified original/patched file. Refusing changes.');
  } else throw Error('Unknown target hash and no verified backup. Refusing changes.');
  const patched = spec.transform(original);
  return { target, backup, original, patched, applied: current === patched };
}

/**
 * @param {{target:string, backupSuffix:string, originalSha256:string, transform:(original:string)=>string}} spec
 * `target` is relative to the host package root; the backup file name format is part of the public contract.
 */
export function runPatchCli(spec, argv = process.argv) {
  const command = argv[2] ?? 'status';
  const rootIndex = argv.indexOf('--root');
  const root = resolveHostRoot(rootIndex >= 0 ? argv[rootIndex + 1] : undefined);
  try {
    if (!['apply', 'revert', 'status'].includes(command)) throw Error(`Usage: node ${path.basename(argv[1])} apply|revert|status [--root package-parent]`);
    checkHostVersion(root);
    const state = inspect(spec, root);
    if (command === 'status') {
      console.log(JSON.stringify({ version: PI_HOST_VERSION, target: state.target, status: state.applied ? 'applied' : 'not applied', originalSha256: spec.originalSha256 }, null, 2));
    }
    if (command === 'apply') {
      if (state.applied) console.log('Already applied; skipped.');
      else {
        if (fs.existsSync(state.backup)) { if (sha256(fs.readFileSync(state.backup)) !== spec.originalSha256) throw Error('Backup hash mismatch'); }
        else fs.writeFileSync(state.backup, state.original, { flag: 'wx' });
        replaceAtomically(state.target, state.patched);
        console.log('Applied. Restart Pi to load the patched host module.');
      }
    }
    if (command === 'revert') {
      if (!state.applied) console.log('Already original; skipped.');
      else { replaceAtomically(state.target, state.original); console.log('Restored verified original. Restart Pi. Backup retained.'); }
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

export function replaceOnce(anchor, replacement) {
  return original => {
    if (original.split(anchor).length !== 2) throw Error('Expected exactly one verified patch anchor');
    return original.replace(anchor, () => replacement);
  };
}
