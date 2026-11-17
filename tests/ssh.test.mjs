import {projectRoot,hostPath,hostImport} from './helpers/paths.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sydney-ssh-'));
process.env.PI_CODING_AGENT_DIR=path.join(temp,'agent');
const {createJiti}=await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');
const jiti=createJiti(import.meta.url,{alias:{'typebox':hostPath('../typebox/build/index.mjs'),'@earendil-works/pi-ai':hostPath('pi-ai/dist/index.js'),'@earendil-works/pi-coding-agent':hostPath('pi-coding-agent/dist/index.js'),'@earendil-works/pi-tui':hostPath('pi-tui/dist/index.js')}});
try {
 const config=await jiti.import(projectRoot+'/config.ts'); const {remoteFileTarget}=await jiti.import(projectRoot+'/src/ssh/path.ts');
 for (const [raw,expected] of [['/srv/file','/srv/file'],['/outside/work/a.png','/outside/work/a.png'],['../other/file','/srv/other/file'],['./file','/srv/work/file'],['~/file','/home/remote/file'],['~','/home/remote'],['@/srv/file','/srv/file']]) {
   const mapping=remoteFileTarget(raw,'/srv/work','/home/remote');
   assert.equal(mapping.map(path.win32.resolve('D:\\workspace',raw)),expected);
   assert.equal(mapping.directory,path.posix.dirname(expected));
   assert.ok(Object.isFrozen(mapping));
 }
 assert.throws(()=>remoteFileTarget('C:\\outside\\file','/srv/work'),/POSIX/);
 const {features}=config;
 const {executeSnapshotWrite}=await jiti.import(projectRoot+'/src/ssh/snapshot.ts');
 const file=path.join(temp,'same.txt');fs.writeFileSync(file,'local');
 let remote='remote',reads=0,writes=0;
 const backend={operations:{mkdir:async()=>{},writeFile:async(_p,c)=>{writes++;remote=c;}},readBefore:async()=>{reads++;return Buffer.from(remote);}};
 let result=await executeSnapshotWrite(temp,'1',{path:file,content:'changed'},undefined,undefined,{},backend);
 assert.match(result.details.sydneyDiffPatch,/-remote/);assert.equal(fs.readFileSync(file,'utf8'),'local');assert.equal(writes,1);
 const missing={operations:backend.operations,readBefore:async()=>{throw Object.assign(new Error('missing'),{code:2});}};
 const created=await executeSnapshotWrite(temp,'new',{path:file,content:'new'},undefined,undefined,{},missing);assert.equal(created.details.sydneyNewFile,true);
 const maximum=config.diffs.maxSnapshotBytes;
 const unchanged=await executeSnapshotWrite(temp,'same',{path:file,content:remote},undefined,undefined,{},backend);
 assert.equal(unchanged.details.sydneyWrite.unchanged,true);
 const empty=await executeSnapshotWrite(temp,'empty',{path:file,content:''},undefined,undefined,{},missing);
 assert.equal(empty.details.sydneyNewFile,true);assert.equal(empty.details.sydneyWrite.eofOnly,false);
 const readsBeforeDisabled=reads;
 config.diffs.maxSnapshotBytes=2;
 const large=await executeSnapshotWrite(temp,'large',{path:file,content:'large'},undefined,undefined,{},backend);assert.equal(large.details.sydneyWrite.reason,'new content exceeds snapshot limit');assert.equal(large.details.sydneyDiffPatch,undefined);config.diffs.maxSnapshotBytes=maximum;
 const connectionError=()=>Object.assign(new Error('reset'),{code:'ECONNRESET'});
 const uncertain=await executeSnapshotWrite(temp,'reset',{path:file,content:'x'},undefined,undefined,{}, {host:'test',path:'/remote/x',readBefore:async()=>Buffer.from('old'),operations:{mkdir:async()=>{},writeFile:async()=>{throw connectionError();}}});
 assert.equal(uncertain.isError,true);assert.equal(uncertain.details.sydneyWrite.outcome,'unverified');assert.equal(uncertain.details.sydneyWrite.path,'/remote/x');
 await assert.rejects(executeSnapshotWrite(temp,'mkdir-reset',{path:file,content:'x'},undefined,undefined,{}, {readBefore:async()=>Buffer.from('old'),operations:{mkdir:async()=>{throw connectionError();},writeFile:async()=>{throw new Error('must not write');}}}),{code:'ECONNRESET'});
 let attempts=0;
 await assert.rejects(executeSnapshotWrite(temp,'fail',{path:file,content:'x'},undefined,undefined,{}, {readBefore:async()=>Buffer.from('old'),operations:{mkdir:async()=>{},writeFile:async()=>{attempts++;throw new Error('connection lost');}}}),/connection lost/);assert.equal(attempts,1);
 assert.equal(fs.readFileSync(file,'utf8'),'local');
 features.diff=false;await executeSnapshotWrite(temp,'2',{path:file,content:'again'},undefined,undefined,{},backend);assert.equal(reads,readsBeforeDisabled);features.diff=true;
 result=await executeSnapshotWrite(temp,'3',{path:file,content:'local change'},undefined,undefined,{});assert.match(result.details.sydneyDiffPatch,/-local/);assert.equal(remote,'again');
 const {default:install}=await jiti.import(projectRoot+'/src/ssh/index.ts');const tools=[],hooks={};
 const {createEventBus}=await hostImport('pi-coding-agent/dist/core/event-bus.js');
 const {routeStateForOwner}=await jiti.import(projectRoot+'/src/ssh/owner.ts');
 const parentEvents=createEventBus(), childEvents=createEventBus();
 const parentRoute=routeStateForOwner(parentEvents);
 parentRoute.resume={command:'ssh parent.invalid',cwd:'/parent',routeRemoteTools:true};
 let claimed=false;
 parentEvents.on('discovery',()=>{claimed=true;});
 parentEvents.emit('discovery',{});
 assert.equal(claimed,true,'host listeners claim synchronously before emit returns');
 assert.equal(routeStateForOwner(parentEvents),parentRoute);
 assert.equal(routeStateForOwner(childEvents).resume,undefined);
 const activeProviders=new Map();
 const childOn=childEvents.on;
 childEvents.on=(name,handler)=>{activeProviders.set(name,(activeProviders.get(name)??0)+1);const release=childOn(name,handler);let done=false;return ()=>{if(!done){done=true;activeProviders.set(name,activeProviders.get(name)-1);release();}};};
 install({events:childEvents,registerTool:t=>tools.push(t),registerCommand(){},on:(n,h)=>{hooks[n]=h;},appendEntry(){}});
 assert.deepEqual(tools.map(t=>t.name),['read','write','edit','bash','remote']);
 const {visibleWidth}=await hostImport('pi-tui/dist/index.js');
 const {initTheme}=await hostImport('pi-coding-agent/dist/index.js');initTheme('dark');
 const renderTheme={fg:(_,s)=>`\x1b[33m${s}\x1b[39m`};
 for(const fullOutputPath of ['/tmp/pi-ssh-remote-output-qUt71Q/output.log','/tmp/训练日志/'.repeat(12)+'output.log']) {
   const result={content:[],details:{action:'exec',output:Array.from({length:20},()=> '训练 output').join('\n'),displayLines:5,fullOutputPath,truncation:{truncated:true,outputLines:114,totalLines:142}}};
   for(const expanded of [false,true]) {
     const component=tools.find(t=>t.name==='remote').renderResult(result,{expanded},renderTheme);
     for(const width of [20,40,93,95,120]) {
       const lines=component.render(width);
       assert.ok(lines.every(line=>visibleWidth(line)<=width),`remote result exceeds ${width} columns (expanded=${expanded})`);
       assert.ok(lines.map(line=>line.replace(/\x1b\[[0-9;]*m/g,'').trimEnd()).join('').includes('output.log'),'full output filename remains visible');
     }
   }
 }

 const ctx={cwd:temp,isProjectTrusted:()=>false,sessionManager:{getBranch:()=>[]},ui:{setStatus(){},addAutocompleteProvider(){},notify(){},theme:{fg:(_,s)=>s}}};
 await hooks.session_start({reason:'startup'},ctx);
 for (const reason of ['new','switch']) {
   for(const name of ['sydney-kit:bg-execution:v1','subagents:execution-backend:v1']) assert.equal(activeProviders.get(name),1);
   await hooks.session_shutdown({reason});
   for(const name of ['sydney-kit:bg-execution:v1','subagents:execution-backend:v1']) assert.equal(activeProviders.get(name),0);
   await hooks.session_start({reason},ctx);
   await hooks.session_start({reason},ctx);
   for(const name of ['sydney-kit:bg-execution:v1','subagents:execution-backend:v1']) assert.equal(activeProviders.get(name),1);
 }
 await tools.find(t=>t.name==='remote').execute('4',{action:'disconnect'},undefined,undefined,ctx);
 assert.equal(await hooks.user_bash({command:'pwd'},ctx),undefined);
 await hooks.session_shutdown({reason:'exit'});await hooks.session_shutdown({reason:'exit'});
 assert.equal(parentRoute.resume.cwd,'/parent','child lifecycle must not clear parent resume route');
 const {parseSshCommand}=await jiti.import(projectRoot+'/vendor/pi-ssh-remote/src/ssh/config.ts');
 const parsed=parseSshCommand('ssh test@example.invalid -p 2222');assert.equal(parsed.host,'example.invalid');assert.equal(parsed.port,2222);assert.equal(parsed.username,'test');assert.equal(parsed.alias,'example.invalid');
 assert.equal(parseSshCommand('ssh demo-alias.invalid').alias,'demo-alias.invalid');
 await tools.find(t=>t.name==='write').execute('5',{path:file,content:'disconnected local'},undefined,undefined,ctx);assert.equal(fs.readFileSync(file,'utf8'),'disconnected local');assert.equal(remote,'again');
 const {quote,shellWords}=await jiti.import(projectRoot+'/vendor/pi-ssh-remote/src/shell.ts');assert.deepEqual(shellWords("ssh 'user name'"),['ssh','user name']);assert.ok(quote("a'b").includes("'"));
 // Exercise the actual exec branch with a fake transport (no SSH/network).
 const source=fs.readFileSync(projectRoot+'/vendor/pi-ssh-remote/index.ts','utf8');
 const start=source.indexOf('      if (params.action === "exec") {');
 const end=source.indexOf('      const command = params.command || lastCommand',start);
 const branch=source.slice(start,end);
 assert.ok(start>0&&end>start);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const probe=new AsyncFunction('params','state','fail',`const updates=[],commands=[]; const ctx={},signal=undefined; let remote=state;
 const _update=v=>updates.push(v),untilAborted=p=>p,ensureConnected=async()=>state;
 const standaloneCdTarget=c=>c.startsWith('cd ')?c.slice(3):undefined;
 const changeRemoteCwd=async p=>p,parseDisplayLines=x=>x,configuredDisplayLines=()=>5;
 const parseRemoteTimeout=x=>x,DEFAULT_REMOTE_TIMEOUT_SECONDS=30;
 const configuredOutputLimits=()=>({execMaxLines:200,execMaxBytes:8192});
 const withReconnect=async f=>f({}),quote=x=>JSON.stringify(x);
 const execRemoteLimited=async(c,command)=>{commands.push(command);if(fail)throw Object.assign(new Error('bad'),{exitCode:7});return {text:'ok',content:'ok',truncation:{truncated:false}}};
 const limitRemoteToolResult=x=>x;
 try { const result=await (async()=>{${branch}})();return {result,updates,commands}; }
 catch(error){return {error,updates,commands};}`);
 const state={alias:'raspi',host:'192.0.2.10',label:'user@192.0.2.10:22',cwd:'/original',command:'ssh raspi'};
 const executed=await probe({action:'exec',remoteCommand:'uname -a',cwd:'/override'},state,false);
 assert.equal(executed.result.details.cwd,'/override');
 assert.equal(executed.result.details.sydneyShell.host,'raspi');
 assert.equal(executed.updates[0].details.sydneyShell.cwd,'/override');
 assert.equal(executed.result.details.exitCode,0);
 assert.match(executed.commands[0],/override/);
 state.alias='moon';state.label='other@192.0.2.11:22';assert.equal(executed.result.details.sydneyShell.host,'raspi');
 const direct=await probe({action:'exec',remoteCommand:'pwd'},{host:'192.0.2.10',label:'user@192.0.2.10:22',cwd:'/original',command:'ssh user@192.0.2.10'},false);
 assert.equal(direct.result.details.sydneyShell.host,'192.0.2.10');
 const bad=await probe({action:'exec',remoteCommand:'false'},state,true);
 assert.equal(bad.error.exitCode,7);assert.equal(bad.updates.at(-1).details.sydneyShell.exitCode,7);
 const cd=await probe({action:'exec',remoteCommand:'cd /new'},state,false);
 assert.equal(cd.result.details.cwd,'/new');assert.equal(cd.commands.length,0);
 const opsStart=source.indexOf('  const remoteBashOps =');
 const opsEnd=source.indexOf('  const localRead',opsStart);
 const makeOps=new Function('remote','relative','sep',`const localCwd='/local'; const commands=[]; const parseRemoteTimeout=x=>x,DEFAULT_REMOTE_TIMEOUT_SECONDS=30,withRemoteTimeout=x=>x,quote=JSON.stringify; const withReconnect=async f=>f({}); const openAbortableExec=async(c,cmd)=>{commands.push(cmd);return {}}; const runExecChannel=async()=>({code:0,timedOut:false}); ${source.slice(opsStart,opsEnd).replace(': BashOperations','').replaceAll('bound!.','bound.')} return {ops:remoteBashOps(),commands};`);
 const bound={cwd:'/bound',command:'ssh raspi'};
 const {relative}=await import('node:path');
 const fixture=makeOps(bound,relative,'/');bound.cwd='/changed';
 await fixture.ops.exec('pwd','/local/sub',{onData(){}});
 assert.match(fixture.commands[0],/\/bound\/sub/);
 await fixture.ops.exec('pwd','/absolute',{onData(){}});
 assert.match(fixture.commands[1],/\/absolute/);
 bound.command='ssh moon';
 await assert.rejects(fixture.ops.exec('pwd','/local',{onData(){}}),/route changed/);
 console.log('PASS SSH registration, lifecycle, disconnect and isolated snapshot backends');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
