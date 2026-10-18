import {projectRoot,hostPath,hostImport} from './helpers/paths.mjs';import {png} from './helpers/image-fixtures.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {execFileSync,spawn} from 'node:child_process';
const {createJiti}=await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');
const jiti=createJiti(import.meta.url,{alias:{'@earendil-works/pi-coding-agent':hostPath('pi-coding-agent/dist/index.js'),'@earendil-works/pi-tui':hostPath('pi-tui/dist/index.js')}});
const r=await jiti.import(projectRoot+'/src/clipboard/clipboard-reader.ts');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'sydney-reader-test-'));
const saved=[];const save=async(bytes,ext)=>{const p=path.join(temp,`clip-${saved.length}${ext}`);await fs.writeFile(p,bytes);saved.push(p);return p;};
// A fake clipboard tool table: command -> (args) -> Buffer | null (empty/failed) ; missing command -> undefined (ENOENT).
const fake=table=>async(cmd,args)=>{const tool=table[cmd];if(!tool)return undefined;return tool(args);};
const linux=(env,table)=>r.readUnixClipboard(save,temp,undefined,{...env},'linux',fake(table),async()=>undefined);
try{
 assert.equal(r.sniffImage(png(2,2)),'.png');assert.equal(r.sniffImage(Buffer.from('II*\0xxxx')),'.tiff');assert.equal(r.sniffImage(Buffer.from('hello')),undefined);
 assert.equal(r.preferredImageType(['TARGETS','image/bmp','image/png;q=1','text/plain']),'image/png;q=1');assert.equal(r.preferredImageType(['text/plain','image/svg+xml']),undefined);
 assert.deepEqual(r.filePathsFromUriList('copy\nfile:///tmp/a%20b.png\r\nfile:///tmp/c.txt\n# comment\nhttps://x/y.png\nfile:///tmp/D.JPEG'),['/tmp/a b.png','/tmp/D.JPEG']);
 const image=png(3,2);
 const wl={'wl-paste':a=>a[0]==='--list-types'?Buffer.from('text/plain\nimage/png\n'):a[1]==='image/png'?image:null};
 let paths=await linux({WAYLAND_DISPLAY:'wayland-0'},wl);assert.equal(paths.length,1);assert.deepEqual(await fs.readFile(paths[0]),image);assert.ok(paths[0].endsWith('.png'));
 const xclip={xclip:a=>a.includes('TARGETS')?Buffer.from('TARGETS\ntext/uri-list\nUTF8_STRING'):a.includes('text/uri-list')?Buffer.from('file:///pics/one.png\nfile:///pics/notes.md\nfile:///pics/two.webp'):null};
 assert.deepEqual(await linux({DISPLAY:':0'},xclip),['/pics/one.png','/pics/two.webp']);
 assert.deepEqual(await linux({DISPLAY:':0'},{xclip:()=>null}),[],'empty X11 clipboard is "no image", not an error');
 // Wayland tool missing -> falls back to xclip (XWayland).
 assert.deepEqual(await linux({WAYLAND_DISPLAY:'w',DISPLAY:':0'},xclip),['/pics/one.png','/pics/two.webp']);
 await assert.rejects(linux({DISPLAY:':0'},{}),e=>e instanceof r.ClipboardUnavailable&&/xclip/.test(e.message));
 await assert.rejects(linux({SSH_CONNECTION:'1 2 3 4'},{}),e=>e instanceof r.ClipboardUnavailable&&/RemoteForward/.test(e.message));
 assert.equal(r.isSsh({SSH_TTY:'/dev/pts/0'}),true);assert.equal(r.isSsh({}),false);assert.equal(r.isWsl({WSL_DISTRO_NAME:'Ubuntu'}),true);
 // WSL: WSLg has nothing, Windows clipboard has a screenshot.
 const wsl={'wl-paste':()=>null,wslpath:a=>Buffer.from(a[0]==='-w'?'C:\\x\\'+path.basename(a[1]):'/mnt/c/x/'+path.win32.basename(a[1])),'powershell.exe':a=>{assert.ok(a.includes('-STA'));return Buffer.from('\uFEFF{"paths":["C:\\\\x\\\\clipboard-1.png"]}\r\n');}};
 assert.deepEqual(await linux({WSL_DISTRO_NAME:'Ubuntu'},wsl),['/mnt/c/x/clipboard-1.png']);
 // Real X11 round trip when Xvfb + xclip are installed: put a PNG on the clipboard, read it through the default runner.
 let real='skipped (needs xvfb-run and xclip)';
 const has=c=>{try{execFileSync('which',[c],{stdio:'ignore'});return true;}catch{return false;}};
 if(process.platform==='linux'&&has('Xvfb')&&has('xclip')){
  const display=':'+(90+Math.floor(Math.random()*9));const x=spawn('Xvfb',[display,'-screen','0','64x64x24'],{stdio:'ignore'});
  try{
   await new Promise(res=>setTimeout(res,800));const src=path.join(temp,'source.png');await fs.writeFile(src,image);
   const owner=spawn('xclip',['-selection','clipboard','-t','image/png','-i',src],{env:{...process.env,DISPLAY:display},stdio:'ignore'});
   await new Promise(res=>setTimeout(res,500));
   const got=await r.readUnixClipboard(save,temp,undefined,{DISPLAY:display},'linux');
   assert.equal(got.length,1);assert.deepEqual(await fs.readFile(got[0]),image);owner.kill();real='passed';
  }finally{x.kill();}
 }
 console.log(`PASS mime sniffing/preference, uri-list parsing, wl-paste image, xclip file list, empty clipboard, Wayland->X11 fallback, missing tools, SSH notice, WSL PowerShell bridge; real X11 clipboard ${real}.`);
}finally{await fs.rm(temp,{recursive:true,force:true});}
process.exit(0);
