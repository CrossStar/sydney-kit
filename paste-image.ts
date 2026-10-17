import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resizeImage, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { pasteImage as config } from './config';
import { ClipboardClient } from './clipboard-client';
import { installImageEditor } from './image-editor';
type Prepared={path:string;mimeType:string;width:number;height:number};
export const clipboardDirectory=()=>config.directory.replace(/^~(?=[/\\])/,homedir());
const filename=(extension:string)=>join(clipboardDirectory(),`clipboard-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}${extension}`);
const mime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.bmp':'image/bmp'};
function powershell(script:string,args:string[],signal?:AbortSignal):Promise<string>{
  return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL(`./scripts/${script}`,import.meta.url)),...args],{windowsHide:true,timeout:config.processTimeoutMs,maxBuffer:1024*1024,encoding:'utf8',signal},(error,stdout)=>error?reject(error):resolve(stdout)));
}
export async function readClipboardImages(signal?:AbortSignal):Promise<string[]>{
  const result=JSON.parse((await powershell('clipboard-image.ps1',['-OutputDirectory',clipboardDirectory()],signal)).replace(/^\uFEFF/,''));
  if(!Array.isArray(result.paths)||!result.paths.every((p:any)=>typeof p==='string'))throw Error('Invalid clipboard result');
  return result.paths.filter((p:string)=>!!mime[extname(p).toLowerCase()]);
}
export async function prepareImage(source:string,signal?:AbortSignal):Promise<Prepared>{
  await mkdir(clipboardDirectory(),{recursive:true});
  const size=await stat(source);if(!size.isFile()||size.size>config.maxFileBytes)throw Error('Invalid or oversized image');
  let format=mime[extname(source).toLowerCase()];if(!format)throw Error('Unsupported image');
  if(format==='image/bmp'){
    const png=filename('.png');await powershell('image-to-png.ps1',['-Source',source,'-Destination',png],signal);source=png;format='image/png';
  }
  const result=await resizeImage(await readFile(source),format,{maxWidth:config.maxEdge,maxHeight:config.maxEdge});
  if(!result||!['image/png','image/jpeg','image/gif','image/webp'].includes(result.mimeType))throw Error('Image decode failed');
  if(signal?.aborted)throw Error('Cancelled');
  const destination=filename(({ 'image/png':'.png','image/jpeg':'.jpg','image/gif':'.gif','image/webp':'.webp' } as Record<string,string>)[result.mimeType]);
  await writeFile(destination,Buffer.from(result.data,'base64'),{flag:'wx'});
  return {path:destination,mimeType:result.mimeType,width:result.width,height:result.height};
}
export async function cleanupClipboardFiles(protectedFiles=new Set<string>()){
  const directory=clipboardDirectory(),cutoff=Date.now()-config.retentionDays*86400000;
  await mkdir(directory,{recursive:true});
  for(const entry of await readdir(directory,{withFileTypes:true})){
    if(!entry.isFile()||!/^clipboard-.*\.(png|jpg|gif|webp)$/i.test(entry.name))continue;
    const path=join(directory,entry.name);if(protectedFiles.has(path))continue;
    try{if((await stat(path)).mtimeMs<cutoff)await unlink(path);}catch{}
  }
}
export default function registerPasteImage(pi:ExtensionAPI, services?:{read:typeof readClipboardImages;prepare:typeof prepareImage;cleanup:typeof cleanupClipboardFiles}){
  type Pending={source:string;ready:Promise<Prepared|undefined>;image?:Prepared};
  const pending=new Map<string,Pending>();const client=new ClipboardClient(clipboardDirectory(),config.processTimeoutMs);
  const ops=services??{read:(signal?:AbortSignal)=>client.read(signal),prepare:prepareImage,cleanup:cleanupClipboardFiles};
  let serial=0,generation=0,busy=false,lastCleanup=0,restoreEditor:(()=>void)|undefined;
  const controllers=new Set<AbortController>();
  const supported=(ctx:any)=>ctx.model?.input?.includes('image')===true;
  const reset=()=>{generation++;for(const controller of controllers)controller.abort();controllers.clear();pending.clear();};
  pi.on('session_start',(_event,ctx)=>{
    reset();if(ctx?.mode!=='tui')return;
    restoreEditor=installImageEditor(ctx,token=>pending.has(token.replace(/ · \d+×\d+(?=\])/g,'')));
    if(!services&&process.platform==='win32')void client.warm().catch(()=>{});
  });
  pi.on('session_switch',reset);
  pi.on('session_shutdown',()=>{reset();client.stop();restoreEditor?.();});
  pi.registerShortcut(config.shortcut,{description:'粘贴剪贴板图片',handler:async ctx=>{
    if(ctx.mode!=='tui')return;
    if(!supported(ctx)){ctx.ui.notify('当前模型不支持图片输入','warning');return;}
    if(busy){ctx.ui.notify('正在读取剪贴板图片，请稍候','info');return;}
    if(process.platform!=='win32'){ctx.ui.notify('剪贴板图片粘贴目前仅支持 Windows','warning');return;}
    busy=true;const current=generation,abort=new AbortController();controllers.add(abort);let preparing=false;
    try{
      const paths=await ops.read(abort.signal);
      if(current!==generation)return;
      if(!paths.length){ctx.ui.notify('剪贴板中没有图片','info');return;}
      if(!supported(ctx)){ctx.ui.notify('当前模型不支持图片输入','warning');return;}
      let queue=Promise.resolve();let notified=false;
      const tokens=paths.map(source=>{
        const token=`[图片 ${++serial}]`,entry:Pending={source,ready:Promise.resolve(undefined)};
        // Show the token before decoding/resizing; serialize this batch to bound worker memory.
        entry.ready=queue.then(async()=>{
          if(current!==generation)return undefined;
          try{entry.image=await ops.prepare(source,abort.signal);return entry.image;}
          catch{if(current===generation&&!notified){notified=true;ctx.ui.notify('图片准备失败，请删除占位后重新粘贴','error');}return undefined;}
        });
        queue=entry.ready.then(()=>{});pending.set(token,entry);return token;
      });
      preparing=true;void queue.finally(()=>controllers.delete(abort));
      ctx.ui.pasteToEditor(' '+tokens.join(' '));
      if(Date.now()-lastCleanup>config.cleanupIntervalMs){
        lastCleanup=Date.now();
        const protectedFiles=new Set<string>();
        for(const [token,entry] of pending)if(ctx.ui.getEditorText().includes(token)){protectedFiles.add(entry.source);if(entry.image)protectedFiles.add(entry.image.path);}
        void ops.cleanup(protectedFiles).catch(()=>{});
      }
    }catch{if(current===generation)ctx.ui.notify('读取或保存剪贴板图片失败，请重试','error');}
    finally{busy=false;if(!preparing)controllers.delete(abort);}
  }});
  pi.on('input',async(event,ctx)=>{
    if(event.source!=='interactive')return;
    const selected:[string,Pending][]=[];const seen=new Set<string>();
    for(const match of event.text.matchAll(/\[图片 \d+(?: · \d+×\d+)?\]/g)){
      const key=match[0].replace(/ · \d+×\d+(?=\])/g,''),entry=pending.get(key);
      if(entry&&!seen.has(key)){selected.push([match[0],entry]);seen.add(key);}
    }
    if(!selected.length)return;
    const restore=()=>{if(ctx.mode==='tui'&&!ctx.ui.getEditorText().trim())ctx.ui.setEditorText(event.text);};
    if(!supported(ctx)){ctx.ui.notify('当前模型不支持图片输入，图片未发送','warning');restore();return {action:'handled' as const};}
    const current=generation;
    try{
      const images=[...(event.images??[])];let text=event.text;
      for(const [token,entry] of selected){
        const image=await entry.ready;if(!image)throw Error('Image preparation failed');
        images.push({type:'image' as const,data:(await readFile(image.path)).toString('base64'),mimeType:image.mimeType});
        text=text.split(token).join(token.replace(/(?: · \d+×\d+)?\]$/,` · ${image.width}×${image.height}]`));
      }
      if(current!==generation)return {action:'handled' as const};
      if(!supported(ctx)){ctx.ui.notify('当前模型不支持图片输入，图片未发送','warning');restore();return {action:'handled' as const};}
      return {action:'transform' as const,text:text.trim(),images};
    }catch{if(current===generation){ctx.ui.notify('读取图片附件失败，消息未发送，请重新粘贴','error');restore();}return {action:'handled' as const};}
  });
}
