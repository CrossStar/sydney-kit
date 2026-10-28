import {projectRoot,hostPath,hostImport} from './helpers/paths.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
const {createJiti}=await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');
const jiti=createJiti(import.meta.url,{alias:{'typebox':hostPath('../typebox/build/index.mjs'),'@earendil-works/pi-ai':hostPath('pi-ai/dist/index.js'),'@earendil-works/pi-coding-agent':hostPath('pi-coding-agent/dist/index.js'),'@earendil-works/pi-tui':hostPath('pi-tui/dist/index.js')}});
const root=process.env.SYDNEY_BG_ROOT || 'C:/Users/PC/.pi/agent/git/github.com/CrossStar/pi-background-tasks';
const {BackgroundTaskRegistry}=await jiti.import(root+'/src/core/registry.ts');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sydney-bg-'));
const children=[];let route='A',local=0;
const registry=new BackgroundTaskRegistry({sendCompletionNotification(){},spawn(){local++;throw Error('local spawn forbidden');},resolveExecution(){const pinned=route;return {spawn(){const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{child.emit('close',137,'SIGKILL');return true;};children.push({child,pinned});return child;}};}});
const ctx={cwd:temp,modelRegistry:{getAll:()=>[]}};
try {
 const a=await registry.startTask(ctx,'test',{isAgent:false,name:'A'});route='B';
 const b=await registry.startTask(ctx,'test',{isAgent:false,name:'B'});
 assert.deepEqual(children.map(c=>c.pinned),['A','B']);
 children[0].child.stdout.write('remote A output\n');
 children[0].child.emit('close',0,null);
 await registry.waitForEnd(a,2000);
 assert.equal(a.status,'completed');assert.match((await registry.getTaskLogs(a,1024,true)).text,/remote A output/);
 await registry.stopTask(b,'user');assert.equal(b.status,'killed');
 await assert.rejects(registry.startTask(ctx,'agent',{isAgent:true}),/isAgent:false/);
 const lost=await registry.startTask(ctx,'lost',{isAgent:false});children.at(-1).child.emit('error',Error('Remote outcome unknown'));
 await registry.waitForEnd(lost,2000);assert.equal(lost.status,'failed');assert.match(lost.error,/unknown/);assert.equal(local,0);
 console.log('PASS patched registry admission pinning, logs, completion, kill, transport failure, no fallback');
} finally {await Promise.all(registry.allTasks().map(t=>t.metadataWriteChain));fs.rmSync(temp,{recursive:true,force:true});}
