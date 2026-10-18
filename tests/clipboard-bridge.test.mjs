import {projectRoot,hostPath,hostImport} from './helpers/paths.mjs';import {png} from './helpers/image-fixtures.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import net from 'node:net';import {execFileSync,spawn} from 'node:child_process';
const {createJiti}=await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');
const jiti=createJiti(import.meta.url,{alias:{'@earendil-works/pi-coding-agent':hostPath('pi-coding-agent/dist/index.js'),'@earendil-works/pi-tui':hostPath('pi-tui/dist/index.js')}});
const b=await jiti.import(projectRoot+'/src/clipboard/clipboard-bridge.ts');const r=await jiti.import(projectRoot+'/src/clipboard/clipboard-reader.ts');
const {pasteImage:config}=await jiti.import(projectRoot+'/config.ts');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'sydney-bridge-test-'));const cleanup=[];
const freePort=()=>new Promise(res=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>res(p));});});
// Stands in for sshd's RemoteForward: a Unix socket on the "server" that forwards each connection to the local TCP port.
const forward=(socketPath,port)=>new Promise(res=>{const s=net.createServer(c=>{const t=net.connect(port,'127.0.0.1');c.pipe(t).pipe(c);t.on('error',()=>c.destroy());c.on('error',()=>t.destroy());}).listen(socketPath,()=>res(s));cleanup.push(()=>s.close());});
const saved=[];const save=async(bytes,ext)=>{const p=path.join(temp,`saved-${saved.length}${ext}`);await fs.writeFile(p,bytes);saved.push(p);return p;};
try{
 const image=png(5,4),scratch=path.join(temp,'scratch');await fs.mkdir(scratch);
 const owned=path.join(scratch,'clipboard-1.png'),userFile=path.join(temp,'photo.jpeg'),notImage=path.join(temp,'notes.txt');
 await fs.writeFile(owned,image);await fs.writeFile(userFile,image);await fs.writeFile(notImage,'x');
 let paths=[owned,userFile,notImage],gate;
 const port=await freePort();
 const server=await b.serveClipboardBridge({port,read:async()=>{if(gate)await gate;return paths;},release:b.releaseInside(scratch)});cleanup.push(()=>server.close());
 const socket=path.join(temp,'bridge.sock');await forward(socket,port);
 let images=await b.requestClipboardBridge(socket);
 assert.deepEqual(images.map(i=>i.ext),['.png','.jpg'],'non-images skipped, .jpeg normalized');assert.deepEqual(images[0].bytes,image);
 await assert.rejects(fs.stat(owned),'scratch file released after sending');await fs.stat(userFile);
 // Remote side end to end: SSH session finds the forwarded socket and saves real files for prepareImage.
 config.bridgeSocket=socket;paths=[userFile];
 const got=await r.readUnixClipboard(save,temp,undefined,{SSH_CONNECTION:'1 2 3 4',USER:'me'},'linux',async()=>undefined);
 assert.equal(got.length,1);assert.deepEqual(await fs.readFile(got[0]),image);
 // Concurrent requests: the clipboard is read once at a time.
 let release;gate=new Promise(res=>release=res);
 const first=b.requestClipboardBridge(socket);await new Promise(res=>setTimeout(res,100));
 await assert.rejects(b.requestClipboardBridge(socket),/busy/);release();assert.equal((await first).length,1);gate=undefined;
 // Read failure on the local machine is reported, not hidden as "no image".
 const failing=await b.serveClipboardBridge({port:await freePort(),read:async()=>{throw Error('no display');}});cleanup.push(()=>failing.close());
 const failSock=path.join(temp,'fail.sock');await forward(failSock,failing.address().port);
 await assert.rejects(b.requestClipboardBridge(failSock),/Local clipboard read failed/);
 // HTTP probes (browsers, scanners) get nothing back.
 const probe=await new Promise(res=>{const c=net.connect(port,'127.0.0.1',()=>c.write('GET / HTTP/1.1\r\nHost: x\r\n\r\n'));let data='';c.on('data',d=>data+=d);c.on('close',()=>res(data));c.on('error',()=>res(data));});
 assert.equal(probe,'');
 // Forward exists but the bridge is not running locally: sshd accepts, then closes.
 const deadSock=path.join(temp,'dead.sock');await forward(deadSock,await freePort());
 config.bridgeSocket=deadSock;
 await assert.rejects(r.readUnixClipboard(save,temp,undefined,{SSH_TTY:'/dev/pts/1'},'linux',()=>{}),e=>e instanceof r.ClipboardUnavailable&&/桥接未运行/.test(e.message));
 // No forwarded socket at all.
 assert.equal(await b.requestClipboardBridge(path.join(temp,'missing.sock')),undefined);
 config.bridgeSocket=path.join(temp,'missing-{user}.sock');assert.equal(b.bridgeSocketPath({USER:'alice'}),path.join(temp,'missing-alice.sock'));
 await assert.rejects(r.readUnixClipboard(save,temp,undefined,{SSH_CONNECTION:'1',USER:'alice'},'linux',undefined,b.requestClipboardBridge),e=>e instanceof r.ClipboardUnavailable&&/RemoteForward/.test(e.message));
 // Real launcher + real X11 clipboard on the "local" side, forwarded socket on the "remote" side.
 let real='skipped (needs Xvfb and xclip)';
 const has=c=>{try{execFileSync('which',[c],{stdio:'ignore'});return true;}catch{return false;}};
 if(process.platform==='linux'&&has('Xvfb')&&has('xclip')){
  const display=':'+(80+Math.floor(Math.random()*9)),x=spawn('Xvfb',[display,'-screen','0','64x64x24'],{stdio:'ignore'});cleanup.push(()=>x.kill());
  await new Promise(res=>setTimeout(res,800));
  const src=path.join(temp,'x11.png'),pic=png(7,3);await fs.writeFile(src,pic);
  const env={...process.env,DISPLAY:display,WAYLAND_DISPLAY:''};
  const owner=spawn('xclip',['-selection','clipboard','-t','image/png','-i',src],{env,stdio:'ignore'});cleanup.push(()=>owner.kill());
  const bridgePort=await freePort();
  const launcher=spawn(process.execPath,[projectRoot+'/scripts/clipboard-bridge.mjs','--port',String(bridgePort)],{env,stdio:['ignore','pipe','pipe']});cleanup.push(()=>launcher.kill('SIGTERM'));
  await new Promise((res,rej)=>{let out='';launcher.stdout.on('data',d=>{out+=d;if(out.includes('listening'))res();});launcher.on('exit',c=>rej(Error('bridge exited '+c)));setTimeout(()=>rej(Error('bridge did not start')),15000);});
  const realSock=path.join(temp,'real.sock');await forward(realSock,bridgePort);config.bridgeSocket=realSock;
  const fetched=await r.readUnixClipboard(save,temp,undefined,{SSH_CONNECTION:'1 2 3 4'},'linux');
  assert.equal(fetched.length,1);assert.deepEqual(await fs.readFile(fetched[0]),pic);real='passed';
 }
 console.log(`PASS bridge over forwarded Unix socket, image filtering and .jpeg normalization, scratch release, SSH remote read, busy guard, local read error, HTTP probe ignored, bridge-not-running and missing-socket notices; real launcher + X11 clipboard ${real}.`);
}finally{for(const f of cleanup.reverse())try{f();}catch{}await fs.rm(temp,{recursive:true,force:true});}
process.exit(0);
