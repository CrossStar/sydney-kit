import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { compactionCardPatch as config } from '../../config';
type Run=(command:'status'|'apply')=>Promise<string>;
const restartKey=Symbol.for('sydney-kit.compactionCardPatch.restartRequired');
const operationKey=Symbol.for('sydney-kit.compactionCardPatch.operation');
export function runPatchCommand(command:'status'|'apply',root=config.packageRoot):Promise<string>{
  return new Promise((resolve,reject)=>execFile(config.nodeCommand,[fileURLToPath(new URL('../../patches/compaction-card.mjs',import.meta.url)),command,'--root',root],{encoding:'utf8',windowsHide:true,timeout:config.timeoutMs,maxBuffer:64*1024},(error,stdout,stderr)=>{
    if(error)reject(Error(stderr.trim()||error.message));else resolve(stdout);
  }));
}
export async function ensureCompactionCardPatch(run:Run=runPatchCommand):Promise<'present'|'applied'>{
  const status=JSON.parse(await run('status')).status;
  if(status==='applied')return 'present';
  if(status!=='not applied')throw Error('Unknown patch status');
  await run('apply');
  if(JSON.parse(await run('status')).status!=='applied')throw Error('Patch verification failed');
  return 'applied';
}
export default function registerCompactionCardPatch(pi:ExtensionAPI,run:Run=runPatchCommand){
  let active=false;
  pi.on('session_start',(_event,ctx)=>{
    active=true;
    if(ctx.mode!=='tui')return;
    const global=globalThis as any;
    let operation=global[operationKey] as Promise<void>|undefined;
    if(!operation){
      operation=ensureCompactionCardPatch(run).then(result=>{if(result==='applied')global[restartKey]=true;});
      global[operationKey]=operation;
      void operation.then(()=>{if(global[operationKey]===operation)delete global[operationKey];},()=>{if(global[operationKey]===operation)delete global[operationKey];});
    }
    void operation.then(()=>{
      if(active&&global[restartKey])ctx.ui.notify('上下文压缩卡片补丁已应用：请完整重启 Pi，/reload 不会重新加载宿主渲染器','warning');
    }).catch(error=>{
      if(active)ctx.ui.notify(`上下文压缩卡片补丁检查未通过，已停止自动处理：${String(error.message).replace(/\s+/g,' ').slice(0,160)}`,'warning');
    });
  });
  pi.on('session_shutdown',()=>{active=false;});
}
