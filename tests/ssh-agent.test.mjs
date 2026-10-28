import { pathToFileURL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { capture, guard, prepare, admit } from '../integrations/subagents/ssh-child.mjs';
import { hash } from '../integrations/subagents/patch.mjs';
import { patchFile } from '../integrations/subagents/patch-files.mjs';
import { install } from '../integrations/subagents/install.mjs';
import { stripTypeScriptTypes } from 'node:module';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('actual Pi bus rejects invalid/duplicate claims and refuses late claims',async()=>{
 const {createEventBus}=await import(pathToFileURL(process.env.PI_EVENT_BUS ?? 'C:/Users/PC/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/event-bus.js').href);
 const binding={metadata:Object.freeze({cwd:'/r',platform:'linux',routeId:'a'}),prepare(){}};
 for(const values of [[binding,binding],[{}],[{},binding]]) {
  const bus=createEventBus(); for(const value of values)bus.on('sydney-kit:ssh-child:v1',e=>e.claim(value));
  assert.throws(()=>capture(bus));
 }
 const bus=createEventBus();let late;
 bus.on('sydney-kit:ssh-child:v1',async e=>{await Promise.resolve();late=e.claim(binding)});
 assert.equal(capture(bus),undefined);await Promise.resolve();assert.equal(late,false);
 await assert.rejects(prepare({prepare:async()=>null},['read']),/Malformed/);
 await assert.rejects(prepare({prepare:async()=>({tools:[],cleanup(){throw Error('cleanup')}})},['read']),/scope/);
});
test('synchronous route claim and scope validation execute real helper', async () => {
 const events = new EventEmitter(); let envelope, cleaned = 0;
 const binding = {metadata:Object.freeze({cwd:'/remote',platform:'linux',routeId:'a'}),prepare:async ({toolNames})=>({tools:toolNames.map(name=>({name})),cleanup(){cleaned++}})};
 events.on('sydney-kit:ssh-child:v1',e=>{envelope=e;e.claim(binding)});
 assert.equal(capture(events),binding);
 assert.equal(envelope.claim(binding),false);
 assert.throws(()=>guard(binding,{worktreeBase:'/x'},{}));
 assert.throws(()=>guard(binding,{}, {memory:'project'}));
 assert.deepEqual((await prepare(binding,['read','grep','find','ls'])).tools.map(t=>t.name),['read','grep','find','ls']);
 await assert.rejects(prepare({...binding,prepare:async()=>({tools:[{name:'write'}],cleanup(){cleaned++}})},['read']));
 assert.equal(cleaned,1);
});
test('version checked installer dry-run/apply/revert and patched runner syntax',async()=>{
 const source = process.env.SUBAGENTS_ROOT ?? 'C:/Users/PC/.pi/agent/npm/node_modules/@tintinweb/pi-subagents';
 const root = await mkdtemp(join(tmpdir(),'ssh-agent-'));
 try {
 await mkdir(join(root,'src/workflow'),{recursive:true});
 await copyFile(join(source,'package.json'),join(root,'package.json'));
 const manifest=JSON.parse(await readFile(new URL('../integrations/subagents/manifest.json',import.meta.url),'utf8'));
 const normalize=(file,current,backup)=>{
  if(backup!==undefined) assert.equal(hash(backup),manifest[file],`Invalid backup: ${file}`);
  if(hash(current)===manifest[file])return current;
  assert.notEqual(backup,undefined,`Missing original backup: ${file}`);
  assert.equal(current,patchFile(file,backup),`Modified installed source: ${file}`);
  return backup;
 };
 for(const file of Object.keys(manifest)) {
  const current=await readFile(join(source,file),'utf8');
  let backup;
  try { backup=await readFile(join(source,file)+'.sydney-backup','utf8'); }
  catch(error) { if(error.code!=='ENOENT')throw error; }
  const originalSource=normalize(file,current,backup);
  // Neither corrupted installed files nor corrupted backups may be normalized away.
  assert.throws(()=>normalize(file,current+'\n// modified',originalSource));
  assert.throws(()=>normalize(file,current,originalSource+'\n// modified'));
  await writeFile(join(root,file),originalSource);
 }
 const original=await readFile(join(root,'src/agent-runner.ts'),'utf8');
 const patched=await install(root);
 stripTypeScriptTypes(patched,{mode:'transform'});
 // Execute the patched scope construction with denied write and shell tools.
 assert.ok(patched.includes('const extensions = sshBinding || isolated ? false : config.extensions;'));
 assert.ok(patched.includes('const noExtensions = extensions === false;'));
 const scopeSource=patched.slice(patched.indexOf('  const builtinToolNameSet ='),patched.indexOf('  const configuredSessionDir ='));
 const scopeJs=stripTypeScriptTypes(scopeSource,{mode:'transform'});
 const scope=new Function('toolNames','noExtensions','EXCLUDED_TOOL_NAMES','disallowedSet','nestedToolNames','structuredToolNames','BUILTIN_TOOL_NAMES',scopeJs+';return sessionTools;');
 assert.deepEqual(scope(['read','grep','find','ls','bash','write'],true,['Agent'],new Set(['bash','write']),new Set(),[],['read','write','edit','bash']),['read','grep','find','ls']);
 // Execute the actual patched runner preamble with only its dependencies stubbed.
 const js = stripTypeScriptTypes(patched,{mode:'transform'});
 const preamble = js.slice(js.indexOf('    const sshBinding ='),js.indexOf('const parentSystemPrompt = ctx.getSystemPrompt()'))+' return env; } finally {}';
 const execute = new (Object.getPrototypeOf(async function(){}).constructor)('options','ctx','type','captureSSH','guardSSH','getConfig','getAgentConfig','detectEnv',preamble);
 let probes=0;
 const events=new EventEmitter();
 events.on('sydney-kit:ssh-child:v1',e=>e.claim({metadata:Object.freeze({cwd:'/remote',platform:'linux',routeId:'pinned'}),prepare(){}}));
 const env=await execute({pi:{events}},{cwd:'C:/local'},'Explore',capture,guard,()=>({}),()=>({}),()=>{probes++;throw Error('local probe')});
 assert.equal(env.platform,'linux'); assert.equal(probes,0);
 assert.ok(patched.indexOf('Object.hasOwn(options, "sshBinding")') < patched.indexOf('await detectEnv(options.pi'));
 await install(root,'apply');
 for(const file of ['src/agent-manager.ts','src/index.ts','src/workflow/host.ts']) stripTypeScriptTypes(await readFile(join(root,file),'utf8'),{mode:'transform'});
 const managerSource=await readFile(join(root,'src/agent-manager.ts'),'utf8');
 const admission=managerSource.match(/options = admitSSH\(pi.events, options, getAgentConfig\(type\)\);/)[0];
 const enqueue=new Function('pi','options','getAgentConfig','type','admitSSH',admission+'return options');
 const pinned=enqueue({events},{},()=>({}),'Explore',admit);
 events.removeAllListeners();
 assert.equal(admit(events,pinned,{}).sshBinding,pinned.sshBinding);
 const laterEnv=await execute({...pinned,pi:{events}},{cwd:'C:/local'},'Explore',capture,guard,()=>({}),()=>({}),()=>{throw Error('recaptured locally')});
 assert.equal(laterEnv.platform,'linux');
 const indexSource=await readFile(join(root,'src/index.ts'),'utf8');
 assert.ok(indexSource.indexOf('sshWorkflowBindings.set(task, sshBinding)') < indexSource.indexOf('workflowTasks.set(runId, task)'));
 const hostSource=await readFile(join(root,'src/workflow/host.ts'),'utf8');
 assert.ok(hostSource.includes('...({ sshBinding } as any)'));
 const task={};const bindings=new WeakMap();
 const store=indexSource.match(/sshWorkflowBindings.set\(task, sshBinding\);/)[0];
 new Function('sshWorkflowBindings','task','sshBinding',store)(bindings,task,pinned.sshBinding);
 assert.equal(bindings.get(task),pinned.sshBinding);
 assert.throws(()=>enqueue({events},{sshBinding:pinned.sshBinding,isolation:'worktree'},()=>({}),'Explore',admit));
 assert.equal(await readFile(join(root,'src/agent-runner.ts'),'utf8'),patched);
 await assert.rejects(install(root,'apply'));
 await install(root,'revert'); assert.equal(await readFile(join(root,'src/agent-runner.ts'),'utf8'),original);
 } finally { await rm(root,{recursive:true,force:true}); }
});
