import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createJiti} from 'file:///C:/Users/Sydney/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/jiti-loader.js';
const root='C:/Users/Sydney/.pi/agent/extensions/sydney-kit',host='C:/Users/Sydney/.bun/install/global/node_modules/@earendil-works';
const jiti=createJiti(import.meta.url,{alias:{'@earendil-works/pi-coding-agent':host+'/pi-coding-agent/dist/index.js','@earendil-works/pi-tui':host+'/pi-tui/dist/index.js'}});
const {ensureCodeblockPatch,runPatchCommand,default:register}=await jiti.import(root+'/codeblock-patch.ts');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'sydney-codeblock-auto-'));
const key=Symbol.for('sydney-kit.codeblockPatch.operation');
const drain=async()=>{await globalThis[key]?.catch(()=>{});await new Promise(setImmediate);};
try{
 for(const pkg of ['pi-coding-agent','pi-tui']){await fs.mkdir(path.join(temp,pkg),{recursive:true});await fs.copyFile(path.join(host,pkg,'package.json'),path.join(temp,pkg,'package.json'));}
 const target=path.join(temp,'pi-tui/dist/components/markdown.js');await fs.mkdir(path.dirname(target),{recursive:true});
 const original=await fs.readFile(host+'/pi-tui/dist/components/markdown.js.sydney-kit-1.3.0.bak');await fs.writeFile(target,original);
 let commands=[];const run=command=>{commands.push(command);return runPatchCommand(command,temp)};
 assert.equal(await ensureCodeblockPatch(run),'applied');assert.deepEqual(commands,['status','apply','status']);const patched=await fs.readFile(target);
 commands=[];assert.equal(await ensureCodeblockPatch(run),'present');assert.deepEqual(commands,['status']);assert.deepEqual(await fs.readFile(target),patched);
 await fs.writeFile(target,original);assert.equal(await ensureCodeblockPatch(run),'applied');assert.deepEqual(await fs.readFile(target),patched);
 const pkg=path.join(temp,'pi-tui/package.json'),metadata=JSON.parse(await fs.readFile(pkg,'utf8'));metadata.version='1.3.1';await fs.writeFile(pkg,JSON.stringify(metadata));
 commands=[];await assert.rejects(ensureCodeblockPatch(run));assert.deepEqual(commands,['status']);assert.deepEqual(await fs.readFile(target),patched);
 metadata.version='1.3.0';await fs.writeFile(pkg,JSON.stringify(metadata));await fs.appendFile(target,'\n// unknown');commands=[];await assert.rejects(ensureCodeblockPatch(run));assert.deepEqual(commands,['status']);
 const notices=[],hooks={},ctx={mode:'tui',ui:{notify:text=>notices.push(text)}};let calls=0;
 register({on:(name,fn)=>hooks[name]=fn},async()=>{calls++;return JSON.stringify({status:'applied'})});
 delete globalThis.__sydneyKitMarkdownHookVersion;hooks.session_start({},ctx);await drain();assert.equal(notices.length,0);
 const reloaded={};hooks.session_shutdown();register({on:(n,f)=>reloaded[n]=f},async()=>JSON.stringify({status:'applied'}));
 reloaded.session_start({},ctx);await drain();assert.equal(notices.length,0);
 reloaded.session_start({},ctx);await drain();assert.equal(notices.length,0);reloaded.session_shutdown();
 globalThis.__sydneyKitMarkdownHookVersion='1.3.0';hooks.session_start({},ctx);await drain();assert.equal(notices.length,0);
 const count=calls;hooks.session_start({},{...ctx,mode:'json'});assert.equal(calls,count);
 const failing={};register({on:(n,f)=>failing[n]=f},async()=>{throw Error('Unsupported version')});failing.session_start({},ctx);await drain();assert.equal(notices.length,1);assert.match(notices[0],/检查未通过/);
 notices.length=0;delete globalThis.__sydneyKitMarkdownHookVersion;let release;const delayed=new Promise(resolve=>release=resolve),first={},second={};let sharedCalls=0;
 const sharedRun=()=>{sharedCalls++;return delayed};register({on:(n,f)=>first[n]=f},sharedRun);register({on:(n,f)=>second[n]=f},sharedRun);
 first.session_start({},ctx);first.session_shutdown();second.session_start({},ctx);assert.equal(sharedCalls,1);release(JSON.stringify({status:'applied'}));await drain();assert.equal(notices.length,0);
 const {features}=await jiti.import(root+'/config.ts'),{default:entry}=await jiti.import(root+'/index.ts');for(const key of Object.keys(features))features[key]=false;
 let events=0;features.codeblockPatch=true;entry({on(){events++}});assert.equal(events,0);features.codeblock=true;entry({on(){events++}});assert.equal(events,4);
 const {default:codeblock}=await jiti.import(root+'/codeblock.ts');const cb={};delete globalThis.__sydneyKitMarkdownHookVersion;notices.length=0;codeblock({on:(n,f)=>cb[n]=f});cb.session_start({},ctx);assert.equal(notices.length,0);features.codeblockPatch=false;cb.session_start({},ctx);assert.equal(notices.length,1);
 console.log('PASS codeblock auto apply, idempotence, overwrite recovery, version/hash rejection, silent successful startup/reload, shared reload operation, shutdown, failure warning, feature gating and duplicate warning suppression. Real host untouched.');
}finally{await fs.rm(temp,{recursive:true,force:true});delete globalThis[key];}
process.exit(0);
