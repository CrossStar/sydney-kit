import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createJiti} from 'file:///C:/Users/Sydney/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/jiti-loader.js';
const root='C:/Users/Sydney/.pi/agent/extensions/sydney-kit',host='C:/Users/Sydney/.bun/install/global/node_modules/@earendil-works';
const jiti=createJiti(import.meta.url,{alias:{'@earendil-works/pi-coding-agent':host+'/pi-coding-agent/dist/index.js','@earendil-works/pi-tui':host+'/pi-tui/dist/index.js'}});
const {ensureTernImagePatch,runPatchCommand,default:register}=await jiti.import(root+'/tern-image-patch.ts');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'sydney-auto-patch-'));
const op=Symbol.for('sydney-kit.ternImagePatch.operation'),restart=Symbol.for('sydney-kit.ternImagePatch.restartRequired'),oldTerm=process.env.TERM_PROGRAM;
try{
 for(const pkg of ['pi-coding-agent','pi-tui']){await fs.mkdir(path.join(temp,pkg),{recursive:true});await fs.copyFile(path.join(host,pkg,'package.json'),path.join(temp,pkg,'package.json'));}
 const target=path.join(temp,'pi-tui/dist/tui-alt-screen.js');await fs.mkdir(path.dirname(target),{recursive:true});
 const original=await fs.readFile(host+'/pi-tui/dist/tui-alt-screen.js.sydney-tern-images-1.3.0.bak');await fs.writeFile(target,original);
 let commands=[];const run=command=>{commands.push(command);return runPatchCommand(command,temp)};
 assert.equal(await ensureTernImagePatch(run),'applied');assert.deepEqual(commands,['status','apply','status']);
 const patched=await fs.readFile(target);commands=[];assert.equal(await ensureTernImagePatch(run),'present');assert.deepEqual(commands,['status']);assert.deepEqual(await fs.readFile(target),patched);
 // Simulate an update/reinstall replacing the supported file.
 await fs.writeFile(target,original);assert.equal(await ensureTernImagePatch(run),'applied');assert.deepEqual(await fs.readFile(target),patched);
 const pkg=path.join(temp,'pi-tui/package.json'),metadata=JSON.parse(await fs.readFile(pkg,'utf8'));metadata.version='1.3.1';await fs.writeFile(pkg,JSON.stringify(metadata));
 commands=[];await assert.rejects(ensureTernImagePatch(run));assert.deepEqual(commands,['status']);assert.deepEqual(await fs.readFile(target),patched);
 metadata.version='1.3.0';await fs.writeFile(pkg,JSON.stringify(metadata));await fs.appendFile(target,'\n// unknown modification');commands=[];await assert.rejects(ensureTernImagePatch(run));assert.deepEqual(commands,['status']);
 process.env.TERM_PROGRAM='tern';const hooks={},notices=[];let status='not applied',calls=0;
 register({on:(name,fn)=>hooks[name]=fn},async command=>{calls++;if(command==='apply'){status='applied';return 'Applied';}return JSON.stringify({status})});
 const ctx={mode:'tui',ui:{notify:text=>notices.push(text)}};
 hooks.session_start({},ctx);assert.ok(globalThis[op]);await globalThis[op];await Promise.resolve();assert.equal(calls,3);assert.equal(notices.length,1);assert.match(notices[0],/完整重启/);
 delete globalThis[restart];notices.length=0;hooks.session_start({},ctx);await globalThis[op];await Promise.resolve();assert.equal(notices.length,0);
 const count=calls;hooks.session_start({},{...ctx,mode:'json'});assert.equal(calls,count);process.env.TERM_PROGRAM='other';hooks.session_start({},ctx);assert.equal(calls,count);
 process.env.TERM_PROGRAM='tern';let release;const delayed=new Promise(resolve=>release=resolve),late={};
 register({on:(n,f)=>late[n]=f},()=>delayed);late.session_start({},ctx);const pending=globalThis[op];late.session_shutdown();release(JSON.stringify({status:'applied'}));await pending;await Promise.resolve();assert.equal(notices.length,0);
 const {features}=await jiti.import(root+'/config.ts');const {default:entry}=await jiti.import(root+'/index.ts');for(const key of Object.keys(features))features[key]=false;
 let events=0;entry({on(){events++}});assert.equal(events,0);features.ternImagePatch=true;entry({on(){events++}});assert.equal(events,2);
 console.log('PASS automatic apply, idempotent startup, supported update overwrite -> reapply, unsupported version/unknown file refused, Tern/TUI gating, restart notice, shutdown and feature flag. Real host untouched.');
}finally{await fs.rm(temp,{recursive:true,force:true});if(oldTerm===undefined)delete process.env.TERM_PROGRAM;else process.env.TERM_PROGRAM=oldTerm;delete globalThis[op];delete globalThis[restart];}
process.exit(0);
