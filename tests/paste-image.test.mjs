import {projectRoot,hostRoot,hostPath,hostImport} from './helpers/paths.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
const {createJiti}=await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');
const root=projectRoot;
const jiti=createJiti(import.meta.url,{alias:{'@earendil-works/pi-coding-agent':hostPath('pi-coding-agent/dist/index.js'),'@earendil-works/pi-tui':hostPath('pi-tui/dist/index.js')}});
const mod=await jiti.import(root+'/src/clipboard/paste-image.ts');const {pasteImage:config,features}=await jiti.import(root+'/config.ts');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'sydney-paste-test-'));config.directory=path.join(temp,'clipboard');
try{
 execFileSync('powershell.exe',['-NoProfile','-STA','-File',root+'/scripts/windows/verify-image-fixtures.ps1','-Directory',temp],{timeout:20000});
 await fs.writeFile(path.join(temp,'small.webp'),Buffer.from('UklGRiQAAABXRUJQVlA4TBcAAAAvP8AHAAfQypK1vf8BICH8P69G9D/1AQA=','base64'));
 const prepared=[];
 for(const name of ['small.png','small.jpg','small.gif','small.bmp','large.png','small.webp']){
  const item=await mod.prepareImage(path.join(temp,name));prepared.push(item);
  assert.ok(item.width<=2000&&item.height<=2000);assert.ok(['image/png','image/jpeg','image/gif','image/webp'].includes(item.mimeType));
  if(name==='large.png'){assert.equal(item.width,2000);assert.equal(item.height,500);}
 }
 const original=await fs.readFile(path.join(temp,'small.png'));assert.ok(original.length>0);
 const stale=path.join(config.directory,'clipboard-stale.png'),protectedPath=prepared[0].path,unrelated=path.join(config.directory,'keep-me.png');
 for(const file of [stale,protectedPath,unrelated]){if(file!==protectedPath)await fs.writeFile(file,'fixture');await fs.utimes(file,new Date(0),new Date(0));}
 await mod.cleanupClipboardFiles(new Set([protectedPath]));await assert.rejects(fs.stat(stale));await fs.stat(protectedPath);await fs.stat(unrelated);
 let source=[],mode='normal',editor='before after',cursor=7,readCalls=0;const notices=[],events={},shortcuts=[];
 const ctx={mode:'tui',model:{input:['text','image']},ui:{notify:(text)=>notices.push(text),getEditorText:()=>editor,setEditorText:text=>editor=text,pasteToEditor:text=>{editor=editor.slice(0,cursor)+text+editor.slice(cursor);cursor+=text.length;}}};
 mod.default({on:(name,fn)=>events[name]=fn,registerShortcut:(key,options)=>shortcuts.push({key,...options})},{read:async()=>{readCalls++;if(mode==='read-error')throw Error('test');return source;},prepare:async p=>{if(mode==='save-error')throw Error('test');return prepared[p];},cleanup:async()=>{}});
 assert.equal(shortcuts.length,1);assert.equal(shortcuts[0].key,'alt+v');events.session_start();
 for(const kind of ['text','empty']){source=[];await shortcuts[0].handler(ctx);assert.equal(notices.at(-1),'剪贴板中没有图片');assert.equal(editor,'before after');}
 source=[0];await shortcuts[0].handler(ctx);assert.match(editor,/before\s+\[图片 1\]/);assert.ok(editor.endsWith('after'));
 source=[1,2];await shortcuts[0].handler(ctx);assert.ok(editor.includes('[图片 3'));
 let result=await events.input({text:editor,source:'interactive'},ctx);assert.equal(result.action,'transform');assert.equal(result.images.length,3);assert.ok(result.text.includes('[图片 1 · 64×32]'));assert.ok(result.images.every(x=>x.type==='image'&&Buffer.from(x.data,'base64').length>0));
 // The public input result carries real image bytes, not @paths or placeholders.
 assert.equal(result.images[0].data,(await fs.readFile(prepared[0].path)).toString('base64'));
 const tokens=editor.match(/\[图片 \d+\]/g);
 const reordered=await events.input({text:[...tokens].reverse().join(' '),source:'interactive'},ctx);
 assert.equal(reordered.images[0].data,(await fs.readFile(prepared[2].path)).toString('base64'));
 const count=readCalls;ctx.model.input=['text'];await shortcuts[0].handler(ctx);assert.equal(readCalls,count);
 result=await events.input({text:editor,source:'interactive'},ctx);assert.equal(result.action,'handled');assert.ok(!result.images);
 ctx.model.input=['text','image'];
 mode='read-error';const before=editor;await shortcuts[0].handler(ctx);assert.equal(editor,before);assert.equal(notices.at(-1),'读取或保存剪贴板图片失败，请重试');
 mode='save-error';await shortcuts[0].handler(ctx);const failed=await events.input({text:editor,source:'interactive'},ctx);assert.equal(failed.action,'handled');assert.ok(editor.includes('[图片 4]'));
 mode='normal';assert.equal(await events.input({text:'plain\nmultiline',source:'interactive'},ctx),undefined);
 assert.equal(await events.input({text:editor,source:'extension'},ctx),undefined);
 events.session_shutdown();assert.equal(await events.input({text:editor,source:'interactive'},ctx),undefined);
 let release,lateHandler;const lateEvents={};editor='';cursor=0;
 const waiting=new Promise(resolve=>release=resolve);
 mod.default({on:(n,f)=>lateEvents[n]=f,registerShortcut:(_key,opt)=>lateHandler=opt.handler},{read:async()=>['fixture'],prepare:()=>waiting,cleanup:async()=>{}});
 await lateHandler(ctx);assert.equal(editor,' [图片 1]','placeholder appears before preparation resolves');
 release(prepared[0]);const completed=await lateEvents.input({text:editor,source:'interactive'},ctx);assert.ok(completed.text.includes('[图片 1 · 64×32]'));assert.equal(completed.images.length,1);lateEvents.session_shutdown();
 const {default:entry}=await jiti.import(root+'/index.ts');for(const key of Object.keys(features))features[key]=false;let registered=0;
 const pi={on(){},registerShortcut(){registered++}};entry(pi);assert.equal(registered,0);features.pasteImage=true;entry(pi);assert.equal(registered,1);
 console.log('PASS actual PNG/JPEG/GIF/BMP/WebP decode, 4000x1000 -> 2000x500; retention cleanup; cursor placeholders; multiple images; input image bytes; text/empty/error/model guards; feature off; only alt+v registered.');
}finally{await fs.rm(temp,{recursive:true,force:true});}
process.exit(0);
