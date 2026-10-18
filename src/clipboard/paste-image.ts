import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';
import { convertToPng, resizeImage, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { pasteImage as config } from '../../config';
import { ClipboardUnavailable, createClipboardReader } from './clipboard-reader';
import { imageTokens, placeholder, tokenKey, withSize } from './image-token';
type Prepared={path:string;mimeType:string;width:number;height:number};
export const clipboardDirectory=()=>config.directory.replace(/^~(?=[/\\])/,homedir());
const filename=(extension:string)=>join(clipboardDirectory(),`clipboard-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}${extension}`);
const mime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.bmp':'image/bmp','.tif':'image/tiff','.tiff':'image/tiff'};
async function saveClipboardBytes(bytes:Buffer,extension:string){
  if(bytes.length>config.maxFileBytes)throw Error('Oversized image');
  await mkdir(clipboardDirectory(),{recursive:true});
  const path=filename(extension);await writeFile(path,bytes,{flag:'wx'});return path;
}
export async function prepareImage(source:string,signal?:AbortSignal):Promise<Prepared>{
  await mkdir(clipboardDirectory(),{recursive:true});
  const size=await stat(source);if(!size.isFile()||size.size>config.maxFileBytes)throw Error('Invalid or oversized image');
  let format=mime[extname(source).toLowerCase()];if(!format)throw Error('Unsupported image');
  let bytes=await readFile(source);
  // resizeImage returns small inputs unchanged, so formats models cannot take are transcoded first.
  if(format==='image/bmp'||format==='image/tiff'){
    const png=await convertToPng(bytes.toString('base64'),format);if(!png)throw Error('Image conversion failed');
    bytes=Buffer.from(png.data,'base64');format='image/png';
  }
  const result=await resizeImage(bytes,format,{maxWidth:config.maxEdge,maxHeight:config.maxEdge});
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
    if(!entry.isFile()||!/^clipboard-.*\.(png|jpg|gif|webp|bmp|tiff)$/i.test(entry.name))continue;
    const path=join(directory,entry.name);if(protectedFiles.has(path))continue;
    try{if((await stat(path)).mtimeMs<cutoff)await unlink(path);}catch{}
  }
}
type Services={read:(signal?:AbortSignal)=>Promise<string[]>;prepare:typeof prepareImage;cleanup:typeof cleanupClipboardFiles};
export default function registerPasteImage(pi:ExtensionAPI, services?:Services){
  type Pending={source:string;ready:Promise<Prepared|undefined>;image?:Prepared};
  const pending=new Map<string,Pending>();const reader=createClipboardReader(clipboardDirectory(),saveClipboardBytes);
  const ops=services??{read:(signal?:AbortSignal)=>reader.read(signal),prepare:prepareImage,cleanup:cleanupClipboardFiles};
  let serial=0,generation=0,busy=false,lastCleanup=0;
  const controllers=new Set<AbortController>();
  const supported=(ctx:any)=>ctx.model?.input?.includes('image')===true;
  const reset=()=>{generation++;for(const controller of controllers)controller.abort();controllers.clear();pending.clear();};
  pi.on('session_start',(_event,ctx)=>{
    reset();if(ctx?.mode!=='tui')return;
    if(!services)reader.warm();
  });
  pi.on('session_switch',reset);
  pi.on('session_shutdown',()=>{reset();reader.stop();});
  pi.registerShortcut(config.shortcut,{description:'粘贴剪贴板图片',handler:async ctx=>{
    if(ctx.mode!=='tui')return;
    if(!supported(ctx)){ctx.ui.notify('当前模型不支持图片输入','warning');return;}
    if(busy){ctx.ui.notify('正在读取剪贴板图片，请稍候','info');return;}
    busy=true;const current=generation,abort=new AbortController();controllers.add(abort);let preparing=false;
    try{
      const paths=await ops.read(abort.signal);
      if(current!==generation)return;
      if(!paths.length){ctx.ui.notify('剪贴板中没有图片','info');return;}
      if(!supported(ctx)){ctx.ui.notify('当前模型不支持图片输入','warning');return;}
      let queue=Promise.resolve();let notified=false;
      const tokens=paths.map(source=>{
        const token=placeholder(++serial),entry:Pending={source,ready:Promise.resolve(undefined)};
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
    }catch(error){if(current===generation)ctx.ui.notify(error instanceof ClipboardUnavailable?error.message:'读取或保存剪贴板图片失败，请重试',error instanceof ClipboardUnavailable?'warning':'error');}
    finally{busy=false;if(!preparing)controllers.delete(abort);}
  }});
  pi.on('input',async(event,ctx)=>{
    if(event.source!=='interactive')return;
    const selected:[string,Pending][]=[];const seen=new Set<string>();
    for(const match of imageTokens(event.text)){
      const key=tokenKey(match[0]),entry=pending.get(key);
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
        text=text.split(token).join(withSize(token,image.width,image.height));
      }
      if(current!==generation)return {action:'handled' as const};
      if(!supported(ctx)){ctx.ui.notify('当前模型不支持图片输入，图片未发送','warning');restore();return {action:'handled' as const};}
      return {action:'transform' as const,text:text.trim(),images};
    }catch{if(current===generation){ctx.ui.notify('读取图片附件失败，消息未发送，请重新粘贴','error');restore();}return {action:'handled' as const};}
  });
  return { isImageToken: (token:string)=>pending.has(tokenKey(token)) };
}
