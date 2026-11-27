import {projectRoot,hostPath,hostImport} from './helpers/paths.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const {createJiti}=await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');
const jiti=createJiti(import.meta.url,{alias:{'@earendil-works/pi-coding-agent':hostPath('pi-coding-agent/dist/index.js')}});
const {snapshot,childrenOf,transcript}=await jiti.import(projectRoot+'/src/sessions/storage.ts');
const {SessionManager}=await hostImport('pi-coding-agent/dist/index.js');
const {default:register}=await jiti.import(projectRoot+'/src/sessions/index.ts');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'sessions-test-'));
try {
 const parent=path.join(temp,'parent.jsonl'),child=path.join(temp,'child.jsonl'),fork=path.join(temp,'fork.jsonl');
 const entries=[{type:'session',version:1,id:'old',cwd:temp},{type:'custom',customType:'subagents:record',data:{sessionFile:child}},{type:'message',message:{role:'user',content:'实现会话选择'}}];
 await fs.writeFile(parent,entries.map(e=>JSON.stringify(e)).join('\n'));
 const original=await fs.readFile(parent);
 const list=[{path:child,cwd:temp,parentSessionPath:parent},{path:fork,cwd:temp,parentSessionPath:parent}];
 const hidden=await childrenOf(list);
 assert.ok(hidden.has(child)); assert.ok(!hidden.has(fork));
 const snap=await snapshot(parent); assert.deepEqual(await fs.readFile(parent),original);
 assert.equal(transcript(entries,4).length,4);
 await fs.appendFile(parent,'\n{}');assert.notEqual((await snapshot(parent)).fingerprint,snap.fingerprint);
 for(const scenario of ['manual','shutdown','id','success','missing']) {
  const events={};let name,id='current',resolveCall,calls=0;
  const ready=new Promise(resolve=>resolveCall=resolve);let release;
  const result=new Promise(resolve=>release=resolve);
  const ctx={mode:'tui',cwd:temp,sessionManager:{getSessionName:()=>name,getSessionId:()=>id,getSessionFile:()=>undefined,getSessionDir:()=>temp,getBranch:()=>entries},model:{},modelRegistry:scenario==='missing'?{}:{complete:()=>{calls++;resolveCall();return result;}}};
  register({on:(n,f)=>events[n]=f,registerCommand(){},setSessionName:n=>name=n});
  events.agent_settled({},ctx);
  if(scenario==='missing'){await new Promise(r=>setTimeout(r,30));assert.equal(calls,0);continue;}
  await ready;
  if(scenario==='manual'){name='手动名称';events.session_info_changed();}
  if(scenario==='shutdown')events.session_shutdown();
  if(scenario==='id')id='replacement';
  release({stopReason:'stop',content:[{type:'text',text:'会话选择'}]});
  await new Promise(r=>setTimeout(r,20));
  assert.equal(name,scenario==='success'?'会话选择':scenario==='manual'?'手动名称':undefined);
  id='current';events.agent_settled({},ctx);assert.equal(calls,1);
 }
 for(const scenario of ['cancel-preview','cancel-confirm','confirm','changed-during-generation']) {
  const sessionDir=path.join(temp,scenario);
  const manager=SessionManager.create(temp,sessionDir);
  manager.appendMessage({role:'user',content:'为会话管理添加测试',timestamp:Date.now()});
  manager.appendSessionInfo('原始标题');
  const file=manager.getSessionFile();
  const before=await fs.readFile(file);
  let handler,expected=before;
  const steps=[],notifications=[];
  register({on(){},registerCommand(name,command){assert.equal(name,'sessions');handler=command.handler;},setSessionName(){assert.fail('Selected historical session must be written through SessionManager');}});
  await handler('rename',{
   mode:'tui',cwd:temp,model:{},
   sessionManager:{getSessionDir:()=>sessionDir,getSessionId:()=> 'another-current-session',getSessionFile:()=>undefined},
   waitForIdle:async()=>{steps.push('idle');},
   modelRegistry:{complete:async()=>{
    steps.push('generate');
    assert.deepEqual(await fs.readFile(file),before);
    if(scenario==='changed-during-generation') {
     manager.appendMessage({role:'user',content:'生成期间新增消息',timestamp:Date.now()});
     expected=await fs.readFile(file);
     assert.notDeepEqual(expected,before);
    }
    return {stopReason:'stop',content:[{type:'text',text:'生成的标题'}]};
   }},
   ui:{
    input:async()=>{steps.push('search');return '';},
    select:async(title,options)=>{
     steps.push('select');assert.equal(title,'选择要重命名的会话');
     assert.equal(options.length,3);
     assert.ok(options[2].includes('原始标题'));return options[2];
    },
    editor:async(title,value)=>{
     steps.push('preview');assert.equal(title,'标题预览（确认前不会写入）');assert.equal(value,'生成的标题');
     assert.deepEqual(await fs.readFile(file),expected);
     return scenario==='cancel-preview'?undefined:'  用户编辑后的标题  ';
    },
    confirm:async(title,value)=>{
     steps.push('confirm');assert.equal(title,'应用会话名称？');assert.equal(value,'用户编辑后的标题');
     assert.deepEqual(await fs.readFile(file),expected);return scenario!=='cancel-confirm';
    },
    notify:(message,level)=>notifications.push({message,level}),
   },
  });
  assert.deepEqual(steps,['idle','search','select','generate','preview',...(scenario==='cancel-preview'?[]:['confirm']),...(['confirm','changed-during-generation'].includes(scenario)?['idle']:[])]);
  if(scenario==='confirm') {
   const after=await fs.readFile(file);
   assert.deepEqual(after.subarray(0,before.length),before);
   const appended=after.subarray(before.length).toString().trim().split('\n').map(line=>JSON.parse(line));
   assert.equal(appended.length,1);assert.equal(appended[0].type,'session_info');assert.equal(appended[0].name,'用户编辑后的标题');
   assert.equal(SessionManager.open(file).getSessionName(),'用户编辑后的标题');
  } else {
   assert.deepEqual(await fs.readFile(file),expected);
   assert.equal(SessionManager.open(file).getSessionName(),'原始标题');
  }
  assert.deepEqual(notifications,scenario==='changed-during-generation'?[{message:'会话已变化，请重新预览。',level:'warning'}]:[]);
 }
 console.log('PASS /sessions rename UI: preview/confirmation cancellation, edited title persistence, concurrent file change rejection');
 console.log('PASS record identification, fork retention, read-only legacy preview, fingerprint, transcript cap, name/id races, cancellation, missing complete, one attempt');
} finally {await fs.rm(temp,{recursive:true,force:true});}
