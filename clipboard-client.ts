import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
/** A session-owned STA clipboard process. It never reads the clipboard before a request. */
export class ClipboardClient {
  private child?:ChildProcessWithoutNullStreams;
  private ready?:Promise<void>;
  private pending?:{resolve:(paths:string[])=>void;reject:(error:Error)=>void};
  constructor(private directory:string,private timeoutMs:number){}
  warm():Promise<void>{
    if(this.ready)return this.ready;
    const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./scripts/clipboard-image.ps1',import.meta.url)),'-OutputDirectory',this.directory,'-Server'],{windowsHide:true,stdio:'pipe'});
    this.child=child;let buffer='';
    this.ready=new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>fail(Error('Clipboard startup timed out')),this.timeoutMs);
      const fail=(error:Error)=>{
        clearTimeout(timer);reject(error);
        if(this.child!==child)return;
        this.pending?.reject(error);this.pending=undefined;this.child=undefined;this.ready=undefined;child.kill();
      };
      child.on('error',fail);child.on('close',()=>fail(Error('Clipboard reader closed')));
      child.stdin.on('error',fail);child.stderr.resume();
      child.stdout.setEncoding('utf8');
      child.stdout.on('data',(chunk:string)=>{
        buffer+=chunk;if(buffer.length>1024*1024){fail(Error('Clipboard response too large'));return;}
        let end:number;
        while((end=buffer.indexOf('\n'))>=0){
          const line=buffer.slice(0,end).replace(/^\uFEFF/,'').trim();buffer=buffer.slice(end+1);if(!line)continue;
          try{
            const result=JSON.parse(line);
            if(result.ready){clearTimeout(timer);resolve();continue;}
            const pending=this.pending;this.pending=undefined;
            if(!pending)continue;
            if(result.error||!Array.isArray(result.paths)||!result.paths.every((p:any)=>typeof p==='string'))pending.reject(Error('Clipboard read failed'));
            else pending.resolve(result.paths);
          }catch{fail(Error('Invalid clipboard response'));return;}
        }
      });
    });
    return this.ready;
  }
  async read(signal?:AbortSignal):Promise<string[]>{
    await this.warm();if(signal?.aborted)throw Error('Cancelled');
    if(this.pending)throw Error('Clipboard reader busy');
    return new Promise((resolve,reject)=>{
      const finish=(error?:Error,paths?:string[])=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(paths!);};
      const abort=()=>{finish(Error('Cancelled'));this.stop();};
      const timer=setTimeout(()=>{finish(Error('Clipboard read timed out'));this.stop();},this.timeoutMs);
      this.pending={resolve:paths=>finish(undefined,paths),reject:error=>finish(error)};
      signal?.addEventListener('abort',abort,{once:true});this.child!.stdin.write('read\n');
    });
  }
  stop(){const child=this.child;this.child=undefined;this.ready=undefined;this.pending?.reject(Error('Clipboard reader stopped'));this.pending=undefined;child?.kill();}
}
