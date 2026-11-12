// Serialized as Node source by the adapter; all payload bytes arrive over stdin.
export async function installRuntime() {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const crypto = require('node:crypto');
  const digest = (files: any) => crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))))).digest('hex');
  function check(target: string, directory: boolean, sharedParent = false) {
    const stat = fs.lstatSync(target);
    const fail = (reason: string, expected: string, actual: string) => {
      throw new Error(`Unsafe runtime artifact: path=${JSON.stringify(target)} reason=${reason} expected=${expected} actual=${actual}`);
    };
    if (stat.uid !== process.getuid!()) fail('owner', String(process.getuid!()), String(stat.uid));
    if (stat.isSymbolicLink()) fail('type', directory ? 'directory' : 'regular-file', 'symbolic-link');
    if (directory ? !stat.isDirectory() : !stat.isFile()) fail('type', directory ? 'directory' : 'regular-file', 'other');
    const mode = stat.mode & 0o777;
    if (sharedParent ? (mode & 0o022) !== 0 : mode !== (directory ? 0o700 : 0o600)) {
      fail('permissions', sharedParent ? 'group/other-not-writable' : directory ? '0700' : '0600', '0' + mode.toString(8).padStart(3, '0'));
    }
  }
  function directory(target: string, sharedParent = false) {
    try { fs.mkdirSync(target, { mode: 0o700 }); } catch (error: any) { if (error.code !== 'EEXIST') throw error; }
    check(target, true, sharedParent);
  }
  try {
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Remote Node >=22 required');
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 16777216) throw new Error('Bundle too large');
    }
    const bundle = JSON.parse(input);
    const names = ['daemon.mjs', 'remote-bridge.mjs', 'shared.mjs', 'supervisor.mjs', 'windows-tree.mjs'];
    if (JSON.stringify(Object.keys(bundle.files).sort()) !== JSON.stringify(names) || digest(bundle.files) !== bundle.sha256) throw new Error('Runtime digest mismatch');
    const base = path.join(os.homedir(), '.pi');
    directory(base, true);
    const root = path.join(base, 'background-tasks-runtime');
    directory(root);
    const dest = path.join(root, bundle.sha256);
    const verify = () => {
      check(dest, true);
      if (JSON.stringify(fs.readdirSync(dest).sort()) !== JSON.stringify(names)) throw new Error('Unexpected runtime files');
      const files: any = {};
      for (const name of names) {
        const file = path.join(dest, name);
        check(file, false);
        files[name] = fs.readFileSync(file, 'utf8');
      }
      if (digest(files) !== bundle.sha256) throw new Error('Installed runtime corrupted');
    };
    try { fs.lstatSync(dest); } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
      const temp = fs.mkdtempSync(path.join(root, '.upload-'));
      check(temp, true);
      try {
        for (const name of names) fs.writeFileSync(path.join(temp, name), bundle.files[name], { mode: 0o600, flag: 'wx' });
        try { fs.renameSync(temp, dest); } catch (error: any) {
          if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
        }
      } finally { fs.rmSync(temp, { recursive: true, force: true }); }
    }
    verify();
    console.log(JSON.stringify({ ok: true, result: dest }));
  } catch (error: any) {
    console.log(JSON.stringify({ ok: false, error: { message: error.message } }));
    process.exitCode = 1;
  }
}
