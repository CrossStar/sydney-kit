import { readFile, writeFile, copyFile, unlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from './patch.mjs';
import { patchFile } from './patch-files.mjs';
const manifest = JSON.parse(await readFile(new URL('./manifest.json',import.meta.url),'utf8'));
export const expected = manifest['src/agent-runner.ts'];
export async function install(root, mode = 'dry-run') {
 if(!['dry-run','apply','revert'].includes(mode)) throw Error('Invalid mode');
 const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
 if(pkg.name!=='@tintinweb/pi-subagents'||pkg.version!=='0.22.0')throw Error('Unsupported package/version');
 const entries=[];
 for(const [name,expectedHash] of Object.entries(manifest)) {
  const target=join(root,name), backup=target+'.sydney-backup';
  const current=await readFile(target,'utf8');
  const original=mode==='revert'?await readFile(backup,'utf8'):current;
  if(hash(original)!==expectedHash)throw Error('Unsupported hash: '+name);
  const patched=patchFile(name,original);
  if(mode==='revert'&&current!==patched)throw Error('Modified installation: '+name);
  entries.push({target,backup,original,patched});
 }
 const helper=join(root,'src/sydney-ssh-child.mjs');
 const helperSource=await readFile(new URL('./ssh-child.mjs',import.meta.url),'utf8');
 if(mode==='dry-run')return entries[0].patched;
 if(mode==='revert') {
  if(await readFile(helper,'utf8')!==helperSource)throw Error('Modified helper');
  for(const e of entries)await writeFile(e.target,e.original);
  for(const e of entries)await unlink(e.backup);
  await unlink(helper); return;
 }
 for(const path of [...entries.map(e=>e.backup),helper]) {
  try { await access(path); } catch(e) { if(e.code==='ENOENT')continue; throw e; }
  throw Error('Existing backup/helper: '+path);
 }
 const backups=[]; let helperCreated=false;
 try {
  for(const e of entries){await copyFile(e.target,e.backup,1);backups.push(e);}
  await writeFile(helper,helperSource,{flag:'wx'});helperCreated=true;
  for(const e of entries)await writeFile(e.target,e.patched);
 } catch(error) {
  for(const e of backups){await writeFile(e.target,e.original);await unlink(e.backup);}
  if(helperCreated)await unlink(helper);
  throw error;
 }
 return entries[0].patched;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {await install(process.argv[2],process.argv[3]);console.log('Completed. Restart/reload Pi after apply or revert.');}
