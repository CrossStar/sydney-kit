import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { hostImport } from './helpers/paths.mjs';
const {createJiti}=await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');
const {persistentBackground,persistentRouteId,runtimeDigest,validateRuntime}=await createJiti(import.meta.url).import('../src/ssh/persistent-background.ts');
const files=Object.fromEntries(['daemon.mjs','shared.mjs','supervisor.mjs','windows-tree.mjs','remote-bridge.mjs'].map(k=>[k,'test']));
const bundle={protocol:1,files,sha256:runtimeDigest(files)};
assert.throws(()=>validateRuntime({...bundle,sha256:'bad'}));
assert.equal(persistentRouteId({username:'a',host:'h',port:22,password:'one'}),persistentRouteId({username:'a',host:'h',port:22,password:'two'}));
assert.notEqual(persistentRouteId({username:'a',host:'h',port:22}),persistentRouteId({username:'b',host:'h',port:22}));
let capability = 1;
let closed=0, connections=0; const requests=[];
const record={id:'same',cwd:'/work',name:'x',command:'true',status:'running',startedAt:1,outputFile:'/home/u/.pi/background-tasks-remote/tasks/same/output.log'};
const connect=async()=>{connections++;return Object.assign(new EventEmitter(), {destroy(){closed++;this.emit('close')},exec(command,callback){const s=new EventEmitter();s.stderr=new EventEmitter();s.close=()=>{};s.end=input=>{const req=JSON.parse(input);requests.push(req);const result=req.files?'/test/.pi/background-tasks-runtime/'+bundle.sha256:req.method==='ensure'?{protocol:'pi-background-tasks-remote',version:1,daemonProtocolVersion:1,sessionOwnership:capability,serviceRoot:'/home/u/.pi/background-tasks-remote'}:req.method==='logs'?{data:'aGk=',size:2,nextOffset:2,eof:true}:req.method==='list'?{records:[record],diagnostics:[],nextOffset:null}:record;queueMicrotask(()=>{s.emit('data',Buffer.from(JSON.stringify({ok:true,result})));s.emit('close',0)});};callback(null,s)}})};
const adapter=persistentBackground(connect,bundle);
assert.equal((await adapter.get('same')).id,'same');
assert.equal((await adapter.cancel('same')).id,'same');
assert.equal((await adapter.list('/work')).length,1);
assert.equal((await adapter.logs('same',0,10)).data,'aGk=');
await assert.rejects(adapter.logs('same',-1,10));
assert.equal(connections,4);assert.equal(closed,4);
await assert.rejects(persistentBackground(async()=>{throw Error('reconnect required')},bundle).get('same'),/reconnect required/);
record.ownerSession='A';
await adapter.start({...record});
await adapter.get('same','A');
await adapter.cancel('same','A');
await adapter.list('/work','A');
await adapter.logs('same',0,10,'A');
for (const method of ['start','get','cancel','list','logs']) assert.equal(requests.findLast(r=>r.method===method).params.ownerSession,'A');
for (const call of [()=>adapter.start({...record,ownerSession:'B'}),()=>adapter.get('same','B'),()=>adapter.cancel('same','B'),()=>adapter.list('/work','B')]) await assert.rejects(call(),/ownership mismatch/);
for (const owner of ['', 1, null]) await assert.rejects(adapter.get('same',owner),/Invalid ownerSession/);
capability=undefined;
const before=requests.length;
await assert.rejects(adapter.cancel('same','A'),/does not support session ownership/);
assert.equal(requests.slice(before).some(r=>r.method==='cancel'),false);
await adapter.get('same');
console.log('PASS persistent adapter validation, identity, session ownership, capability gate, logs, list and cancel');

async function diagnosticCase(emit, pattern) {
 let stream;
 const client=Object.assign(new EventEmitter(),{destroy(){this.emit('close')},exec(command,cb){
  stream=Object.assign(new EventEmitter(),{stderr:new EventEmitter(),close(){this.emit('close')},end(){queueMicrotask(()=>emit(stream))}});cb(null,stream);
 }});
 const call=persistentBackground(async()=>client,bundle).get('same');
 await assert.rejects(call,pattern);
 assert.equal(stream.listenerCount('data'),0);
 assert.equal(stream.stderr.listenerCount('data'),0);
 assert.equal(stream.listenerCount('exit'),0);
}
await diagnosticCase(s=>{s.stderr.emit('data',Buffer.from('sh: node: not found'));s.emit('exit',127);s.emit('close')},/bootstrap:.*127.*node: not found/);
await diagnosticCase(s=>s.emit('close',0),/bootstrap: Empty JSON/);
await diagnosticCase(s=>{s.emit('data',Buffer.from('{'));s.emit('close',0)},/Malformed or truncated JSON/);
await diagnosticCase(s=>s.emit('close'),/without verified exit status/);
await diagnosticCase(s=>s.emit('close',null,'TERM'),/terminated by signal/);
await diagnosticCase(s=>{s.emit('data',Buffer.from('{"ok":true,"result":"secret"}'));s.emit('close',127)},/exited with code 127/);
await diagnosticCase(s=>{s.stderr.emit('data',Buffer.from('warning'));s.emit('error',Error('secret'))},/bootstrap: SSH stream failed.*warning/);
await diagnosticCase(s=>{s.stderr.emit('data',Buffer.alloc(3*1024*1024,120))},e=>e.message.includes('output limit') && e.message.length<8500);
for(const error of ['ordinary failure',{message:'ordinary failure'}]) await diagnosticCase(s=>{s.emit('data',Buffer.from(JSON.stringify({ok:false,error})));s.emit('close',0)},/Bridge error: ordinary failure/);
// Exercise split UTF-8 and ssh2's exit-event status with argument-free close.
const unicodeRecord={...record,name:'你好'};
const unicodeConnect=async()=>Object.assign(new EventEmitter(),{destroy(){this.emit('close')},exec(cmd,cb){
 const s=Object.assign(new EventEmitter(),{stderr:new EventEmitter(),close(){this.emit('close')},end(input){
 const req=JSON.parse(input);const result=req.files?'/test/.pi/background-tasks-runtime/'+bundle.sha256:req.method==='ensure'?{protocol:'pi-background-tasks-remote',version:1,daemonProtocolVersion:1,serviceRoot:'/home/u/.pi/background-tasks-remote'}:unicodeRecord;
 queueMicrotask(()=>{s.stderr.emit('data',Buffer.from('warning'));for(const byte of Buffer.from(JSON.stringify({ok:true,result})))s.emit('data',Buffer.from([byte]));s.emit('exit',0);s.emit('close')});
 }});cb(null,s);
}});
assert.equal((await persistentBackground(unicodeConnect,bundle).get('same')).name,'你好');
console.log('PASS persistent stderr, exit verification, UTF-8, envelopes and cleanup diagnostics');
