import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {hostImport} from './helpers/paths.mjs';
const {createJiti}=await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');
const {persistentBackground,runtimeDigest}=await createJiti(import.meta.url).import('../src/ssh/persistent-background.ts');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ssh-persistent-real-'));
const shim=path.join(root,'home.cjs');
fs.writeFileSync(shim,`require('node:os').homedir=()=>${JSON.stringify(root)};require('node:module').syncBuiltinESMExports();`);
const env={...process.env,NODE_OPTIONS:`--require ${shim}`,PI_BG_SERVICE_DIR:path.join(root,'service')};
const source=process.env.SYDNEY_BG_ROOT || '/home/sydney/Workspace/projects/pi-background-tasks';
const files=Object.fromEntries(['daemon.mjs','shared.mjs','supervisor.mjs','windows-tree.mjs','remote-bridge.mjs'].map(n=>[n,fs.readFileSync(path.join(source,'src/persistent',n),'utf8')]));
const bundle={protocol:1,files,sha256:runtimeDigest(files)};
let daemon;
let loseStartReply = true;
const connect=async()=>{
 const client=new EventEmitter();
 client.destroy=()=>client.emit('close');
 client.exec=(command,callback)=>{
  const child=spawn('/bin/bash',['-c',command],{env});
  const stream=new EventEmitter();stream.stderr=child.stderr;
  stream.end=input=>{stream.request=JSON.parse(input);child.stdin.end(input)};stream.close=()=>child.kill();
  let output='';child.stdout.on('data',b=>{output+=b;if (!(stream.request?.method==='start' && loseStartReply)) stream.emit('data',b)});
  child.on('error',e=>stream.emit('error',e));
  child.on('exit',(code,signal)=>stream.emit('exit',code,signal));
   child.on('close',(code,signal)=>{try{const x=JSON.parse(output);if(x.result?.protocol==='pi-background-tasks-remote')daemon=x.result;}catch{}if(stream.request?.method==='start' && loseStartReply){loseStartReply=false;client.emit('error',new Error('simulated disconnect after admission'));}stream.emit('close',code,signal)});
  callback(null,stream);
 };
 return client;
};
let adapter;
try {
 const piRoot=path.join(root,'.pi');
 fs.mkdirSync(piRoot,{mode:0o700});
 fs.chmodSync(piRoot,0o777);
 await assert.rejects(persistentBackground(connect,bundle).list(root), /bootstrap: SSH command exited with code 1; Bridge error: Unsafe runtime artifact:.*reason=permissions/);
 fs.chmodSync(piRoot,0o700);
 const runtimeRoot=path.join(piRoot,'background-tasks-runtime');
 fs.symlinkSync(root,runtimeRoot);
 await assert.rejects(persistentBackground(connect,bundle).list(root), /bootstrap: SSH command exited with code 1; Bridge error: Unsafe runtime artifact:.*actual=symbolic-link/);
 fs.unlinkSync(runtimeRoot);
 const a=persistentBackground(connect,bundle), b=persistentBackground(connect,bundle);adapter=b;
 await Promise.all([a.list(root),b.list(root)]);
 await assert.rejects(a.start({id:'survives',ownerSession:'A',cwd:root,name:'survives',command:'printf x >> counter; printf hello; sleep 60',timeoutSeconds:120,maxOutputBytes:4096}),/simulated disconnect/);
 assert.equal((await b.get('survives','A')).ownerSession,'A');
 assert.equal((await b.list(root,'A')).length,1);
 assert.equal((await b.list(root,'B')).length,0);
 for (const call of [()=>b.get('survives','B'),()=>b.cancel('survives','B'),()=>b.logs('survives',0,100,'B')]) await assert.rejects(call());
 await a.start({id:'legacy',cwd:root,name:'legacy',command:'true',maxOutputBytes:4096});
 assert.deepEqual((await b.list(root,'A')).map(r=>r.id),['survives']);
 assert.equal((await b.list(root,'B')).length,0);
 assert.equal(Buffer.from((await b.logs('survives',0,100,'A')).data,'base64').toString(),'hello');
 await b.cancel('survives','A');
 assert.equal(fs.readFileSync(path.join(root,'counter'),'utf8'),'x');
 console.log('PASS real bootstrap/bridge concurrent deployment and adapter reconnect');
} finally {
 try {await adapter?.cancel('survives')}catch{}
 if(daemon?.pid && daemon.serviceRoot===env.PI_BG_SERVICE_DIR){
  const cmd=fs.readFileSync(`/proc/${daemon.pid}/cmdline`,'utf8');
  if(cmd.includes(root)&&cmd.includes('daemon.mjs'))process.kill(daemon.pid,'SIGTERM');
 }
 fs.rmSync(root,{recursive:true,force:true});
}
