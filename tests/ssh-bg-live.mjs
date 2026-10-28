import {projectRoot,hostPath,hostImport} from './helpers/paths.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sydney-bg-live-'));process.env.PI_CODING_AGENT_DIR=path.join(temp,'agent');
const keys=execFileSync('C:/Windows/System32/OpenSSH/ssh.exe',['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','raspi','cat /etc/ssh/ssh_host_*_key.pub'],{encoding:'utf8',timeout:20000});
const fingerprints=keys.trim().split(/\r?\n/).map(l=>'SHA256:'+createHash('sha256').update(Buffer.from(l.split(/\s+/)[1],'base64')).digest('base64').replace(/=+$/,''));
const {createJiti}=await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');const {createEventBus}=await hostImport('pi-coding-agent/dist/core/event-bus.js');
const jiti=createJiti(import.meta.url,{alias:{typebox:hostPath('../typebox/build/index.mjs'),'@earendil-works/pi-ai':hostPath('pi-ai/dist/index.js'),'@earendil-works/pi-coding-agent':hostPath('pi-coding-agent/dist/index.js'),'@earendil-works/pi-tui':hostPath('pi-tui/dist/index.js')}});
const {default:install}=await jiti.import(projectRoot+'/src/ssh/index.ts');const {BackgroundTaskRegistry}=await jiti.import((process.env.SYDNEY_BG_ROOT||'C:/Users/PC/.pi/agent/git/github.com/CrossStar/pi-background-tasks')+'/src/core/registry.ts');
const events=createEventBus(),tools=new Map(),hooks={};install({events,registerTool:t=>tools.set(t.name,t),registerCommand(){},on:(n,h)=>hooks[n]=h,appendEntry(){}});
const ctx={cwd:temp,modelRegistry:{getAll:()=>[]},isProjectTrusted:()=>false,sessionManager:{getBranch:()=>[]},ui:{setStatus(){},addAutocompleteProvider(){},notify:console.log,theme:{fg:(_,s)=>s},confirm:async(_,text)=>fingerprints.some(fp=>text.includes(fp)),input:async()=>{throw Error('No interactive credentials');}}};
const call=async(args)=>{const r=await tools.get('remote').execute('live',args,undefined,undefined,ctx);if(r.isError)throw Error(JSON.stringify(r));return r;};
const registry=new BackgroundTaskRegistry({sendCompletionNotification(){},spawn(){throw Error('Local fallback');},resolveExecution(){const request={};events.emit('sydney-kit:bg-execution:v1',request);if(request.error)throw request.error;return request.provider;}});
try {
 await hooks.session_start({reason:'startup'},ctx);await call({action:'connect',command:'ssh raspi'});
 const nativeClone=globalThis.structuredClone;
 let failedBinding;
 try {globalThis.structuredClone=()=>{throw Error('injected clone failure');};events.emit('sydney-kit:ssh-child:v1',{claim(value){assert.equal(failedBinding,undefined);failedBinding=value;}});} finally {globalThis.structuredClone=nativeClone;}
 assert.ok(failedBinding);await assert.rejects(failedBinding.prepare({toolNames:['read']}),/injected clone failure/);
 await hooks.session_shutdown({reason:'new'});await hooks.session_start({reason:'new'},ctx);
 let claims=0;events.emit('sydney-kit:ssh-child:v1',{claim(){claims++;}});assert.equal(claims,1);
 const rebindProbe={};events.emit('sydney-kit:bg-execution:v1',rebindProbe);assert.ok(rebindProbe.provider);assert.equal(rebindProbe.error,undefined);
 const blocked=await hooks.tool_call({toolName:'bg_run'},ctx);assert.equal(blocked?.block,true);
 for(const toolName of ['Agent','SubagentWorkflow']) assert.equal((await hooks.tool_call({toolName},ctx))?.block,true);
 const releaseHook=events.on('sydney-kit:ssh-child-hook:v1',probe=>{probe.available=true;});
 assert.equal(await hooks.tool_call({toolName:'Agent'},ctx),undefined);releaseHook();
 let binding;events.emit('sydney-kit:ssh-child:v1',{claim(value){binding=value;}});assert.ok(binding);
 const prepared=await binding.prepare({toolNames:['read','bash','grep','find','ls','write','edit']});
 try {const read=await prepared.tools.find(t=>t.name==='read').execute('child',{path:'/etc/os-release'},undefined,undefined);assert.match(JSON.stringify(read),/Debian/);const bash=await prepared.tools.find(t=>t.name==='bash').execute('child',{command:'hostname',timeout:10},undefined,undefined);assert.match(JSON.stringify(bash),/sydney-raspi/);
 const invoke=async(name,args)=>prepared.tools.find(t=>t.name===name).execute('child',args,undefined,undefined);
 const directory='/tmp/sydney-child-'+process.pid+'-'+Date.now();
 await invoke('bash',{command:`mkdir '${directory}'`,timeout:10});
 try {
 await invoke('write',{path:directory+'/probe.txt',content:'alpha remote\n'});
 await invoke('edit',{path:directory+'/probe.txt',edits:[{oldText:'alpha',newText:'beta'}]});
 assert.match(JSON.stringify(await invoke('read',{path:directory+'/probe.txt'})),/beta remote/);
 assert.match(JSON.stringify(await invoke('grep',{path:directory,pattern:'beta'})),/beta/);
 assert.match(JSON.stringify(await invoke('find',{path:directory,pattern:'*.txt'})),/probe.txt/);
 assert.match(JSON.stringify(await invoke('ls',{path:directory})),/probe.txt/);
 } finally {await invoke('bash',{command:`rm -rf -- '${directory}'`,timeout:10});}
 } finally {await prepared.cleanup();}
 const task=await registry.startTask(ctx,"printf 'remote-output\\n'; hostname",{isAgent:false,notifyOnCompletion:false});await registry.waitForEnd(task,15000);console.log((await registry.getTaskLogs(task,4096,true)).text);assert.equal(task.status,'completed',task.error);assert.match((await registry.getTaskLogs(task,4096,true)).text,/remote-output/);
 const kill=await registry.startTask(ctx,'sleep 90',{isAgent:false,notifyOnCompletion:false});await registry.stopTask(kill,'user');assert.equal(kill.status,'killed',kill.error);
 const timeout=await registry.startTask(ctx,'sleep 90',{isAgent:false,timeoutSeconds:1,notifyOnCompletion:false});await registry.waitForEnd(timeout,15000);assert.equal(timeout.status,'failed');assert.match(timeout.error,/Timed out/);
 const pinned=await registry.startTask(ctx,'sleep 1; printf pinned',{isAgent:false,notifyOnCompletion:false});await call({action:'disconnect'});await registry.waitForEnd(pinned,15000);assert.equal(pinned.status,'completed',pinned.error);
 console.log('PASS raspi provider first remote read/bash, missing-hook guard, patched registry output, verified process-group kill, timeout, parent disconnect isolation');
} finally {await hooks.session_shutdown({reason:'exit'});await Promise.all(registry.allTasks().map(t=>t.metadataWriteChain));fs.rmSync(temp,{recursive:true,force:true});}
