import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { hostImport } from './helpers/paths.mjs';
const { createEventBus } = await hostImport('pi-coding-agent/dist/core/event-bus.js');
const source = readFileSync(new URL('../vendor/pi-ssh-remote/index.ts', import.meta.url), 'utf8');
const providerCode = stripTypeScriptTypes(source.slice(source.indexOf('  const childProvider ='), source.indexOf('  let releaseBackgroundProvider')), {mode:'transform'});
const consumerSource = readFileSync(`${process.env.SUBAGENTS_ROOT ?? '/home/sydney/Workspace/projects/pi-subagents'}/src/execution-backend.ts`, 'utf8');
const consumerCode = stripTypeScriptTypes(consumerSource.replace(/^import .*\n/, '').replace(/export /g, ''), {mode:'transform'});
const {captureExecutionBackend, prepareExecutionBackend} = new Function(`${consumerCode}; return {captureExecutionBackend, prepareExecutionBackend}`)();
test('native Agent and Workflow reach admission without legacy readiness probes',()=>{
 const begin=source.indexOf('  pi.on("tool_call", (event) => {');
 const end=source.indexOf('  const backgroundProvider =',begin);
 assert.ok(begin>=0 && end>begin);
 const code=stripTypeScriptTypes(source.slice(begin,end),{mode:'transform'});
 for(const restoring of [false,true]) {
  let handler;
  const pi={on(name,fn){assert.equal(name,'tool_call');handler=fn},events:{emit(){throw Error('unexpected compatibility probe')}}};
  new Function('pi','routeRemoteTools','restoringSessionState',code)(pi,!restoring,restoring);
  for(const toolName of ['Agent','SubagentWorkflow']) assert.equal(handler({toolName}),undefined);
 }
});
function fixture(connect) {
 const state={active:true,remote:{client:{},cwd:'/first',command:'ssh first'},restoring:false};
 let closed=0; const routes=[];
 const provider=new Function('state','connectRoute','pinnedChildTools','untilAborted', `
 let routeRemoteTools=true;
 ${providerCode.replaceAll('routeRemoteTools','state.active').replaceAll('restoringSessionState','state.restoring').replaceAll('(remote)', '(state.remote)').replaceAll('!remote','!state.remote')}
 return childProvider;`)(state,async route=>{routes.push(route);if(connect) await connect();return {end(){closed++}}},async names=>names.map(name=>({name,execute(){}})),(p,signal)=>!signal?p:Promise.race([p,new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))]));
 const events=createEventBus(); events.on('subagents:execution-backend:v1',provider);
 return {state,events,routes,get closed(){return closed}};
}
test('native consumer and actual bus capture pinned route, independently prepare and dispose',async()=>{
 const f=fixture(); const binding=captureExecutionBackend(f,'/local');
 assert.equal(binding.cwd,'/first');
 f.state.remote={cwd:'/second',command:'ssh second'};
 const a=await prepareExecutionBackend(binding,['read']); const b=await prepareExecutionBackend(binding,['grep']);
 assert.deepEqual(f.routes.map(r=>r.command),['ssh first','ssh first']);
 await a.dispose();await a.dispose();assert.equal(f.closed,1);await b.dispose();assert.equal(f.closed,2);
 await assert.rejects(prepareExecutionBackend(binding,['powershell']),/Unsupported/);
 const controller=new AbortController();controller.abort();await assert.rejects(prepareExecutionBackend(binding,['read'],controller.signal));
});
test('restoring and unavailable active routes claim and reject instead of local fallback',()=>{
 const f=fixture();f.state.restoring=true;assert.throws(()=>captureExecutionBackend(f,'/local'),/unavailable/);
 f.state.restoring=false;f.state.remote=null;assert.throws(()=>captureExecutionBackend(f,'/local'),/unavailable/);
});
test('abort during connection rejects promptly and disposes late connection',async()=>{
 let release; const pending=new Promise(resolve=>{release=resolve}); const f=fixture(()=>pending);
 const binding=captureExecutionBackend(f,'/local');const controller=new AbortController();
 const preparing=prepareExecutionBackend(binding,['read'],controller.signal);controller.abort();
 await assert.rejects(preparing);release();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.closed,1);
});
test('inactive route makes no claim but restoration still claims',()=>{
 const f=fixture();f.state.active=false;assert.equal(captureExecutionBackend(f,'/local'),undefined);
 f.state.restoring=true;assert.throws(()=>captureExecutionBackend(f,'/local'),/unavailable/);
});
