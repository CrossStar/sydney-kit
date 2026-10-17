// Version-pinned Tern compatibility patch; sydney-kit can maintain it on TUI startup.
import { resolveHostRoot } from '../src/host/paths.mjs';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const command=process.argv[2]??'status',arg=process.argv.indexOf('--root');
const root=resolveHostRoot(arg<0?undefined:process.argv[arg+1]);
const target=path.join(root,'pi-tui/dist/tui-alt-screen.js'),backup=target+'.sydney-tern-images-1.3.0.bak';
const expected='aa0b953c0158357d20a1d6f868cd4d7b667fd6646848a788ffded9808c9ef720';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const before='        const drawKittyImagesLast = redrawImages && this.imageProtocol === "kitty" && screen.some(isImageLine) && isWezTerm;';
const after='        const drawKittyImagesLast = redrawImages && this.imageProtocol === "kitty" && screen.some(isImageLine) && (isWezTerm || process.env.TERM_PROGRAM?.toLowerCase() === "tern"); // sydney-kit Tern ordering';
const patch=s=>{if(s.split(before).length!==2)throw Error('Expected exactly one verified rendering anchor');return s.replace(before,after);};
function replace(text){const temp=target+'.sydney-tmp';fs.writeFileSync(temp,text,{flag:'wx'});try{fs.renameSync(temp,target);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
try{
 if(!['apply','revert','status'].includes(command))throw Error('Usage: node tern-images.mjs apply|revert|status [--root package-parent]');
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
