// Version-pinned Compaction card patch; sydney-kit can maintain it on TUI startup.
import { resolveHostRoot } from '../src/host/paths.mjs';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const command=process.argv[2]??'status',arg=process.argv.indexOf('--root');
const root=resolveHostRoot(arg<0?undefined:process.argv[arg+1]);
const target=path.join(root,'pi-coding-agent/dist/modes/interactive/components/compaction-summary-message.js'),backup=target+'.sydney-compaction-card-1.3.0.bak';
const expected='1f4c57f66126a0a8217273039dbe8fc60117064cd254e7f1fdd30477c3d5f88e';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const replacement=fs.readFileSync(new URL('./compaction-card.js',import.meta.url),'utf8');
const patch=()=>replacement;
function replace(text){const temp=target+'.sydney-tmp';fs.writeFileSync(temp,text,{flag:'wx'});try{fs.renameSync(temp,target);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
try{
 if(!['apply','revert','status'].includes(command))throw Error('Usage: node compaction-card.mjs apply|revert|status [--root package-parent]');
 for(const pkg of ['pi-coding-agent','pi-tui'])if(JSON.parse(fs.readFileSync(path.join(root,pkg,'package.json'),'utf8')).version!=='1.3.0')throw Error('Unsupported Pi version; expected 1.3.0');
 const current=fs.readFileSync(target,'utf8');let original;
 if(hash(current)===expected)original=current;
 else if(fs.existsSync(backup)){original=fs.readFileSync(backup,'utf8');if(hash(original)!==expected||current!==patch(original))throw Error('Unknown target/backup contents; refusing changes');}
 else throw Error('Unknown target and no verified backup; refusing changes');
 const applied=current===patch(original);
 if(command==='status')console.log(JSON.stringify({target,version:'1.3.0',status:applied?'applied':'not applied'},null,2));
 if(command==='apply'){
  if(applied)console.log('Already applied; skipped');
  else{if(fs.existsSync(backup)){if(hash(fs.readFileSync(backup))!==expected)throw Error('Backup mismatch');}else fs.writeFileSync(backup,original,{flag:'wx'});replace(patch(original));console.log('Applied; restart Pi.');}
 }
 if(command==='revert'){if(!applied)console.log('Already original; skipped');else{replace(original);console.log('Restored; restart Pi.');}}
}catch(error){console.error(error.message);process.exitCode=1;}
