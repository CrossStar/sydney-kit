import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';
const host='C:/Users/Sydney/.bun/install/global/node_modules/@earendil-works';
const script=new URL('./apply.mjs',import.meta.url).pathname.replace(/^\/(\w:)/,'$1');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sydney-patch-test-'));
try{
 for(const pkg of ['pi-coding-agent','pi-tui']){fs.mkdirSync(path.join(root,pkg),{recursive:true});fs.copyFileSync(path.join(host,pkg,'package.json'),path.join(root,pkg,'package.json'));}
 const target=path.join(root,'pi-tui/dist/components/markdown.js');fs.mkdirSync(path.dirname(target),{recursive:true});
 const installed=path.join(host,'pi-tui/dist/components/markdown.js');
 const current=fs.readFileSync(installed,'utf8');
 const source=current.includes('// sydney-kit markdown hook v1')?fs.readFileSync(installed+'.sydney-kit-1.3.0.bak','utf8'):current;
 fs.writeFileSync(target,source);
 const run=c=>execFileSync(process.execPath,[script,c,'--root',root],{encoding:'utf8'});
 assert.match(run('status'),/not applied/);run('apply');const patched=fs.readFileSync(target,'utf8');assert.notEqual(patched,source);
 assert.match(run('apply'),/skipped/);run('revert');assert.equal(fs.readFileSync(target,'utf8'),source);run('apply');
 // Simulate package-manager replacement with the same supported upstream build.
 fs.writeFileSync(target,source);assert.match(run('status'),/not applied/);run('apply');assert.equal(fs.readFileSync(target,'utf8'),patched);
 // A new version must not be patched automatically.
 const pkg=path.join(root,'pi-tui/package.json'),json=JSON.parse(fs.readFileSync(pkg,'utf8'));json.version='1.3.1';fs.writeFileSync(pkg,JSON.stringify(json));
 assert.notEqual(spawnSync(process.execPath,[script,'apply','--root',root]).status,0);assert.equal(fs.readFileSync(target,'utf8'),patched);
 json.version='1.3.0';fs.writeFileSync(pkg,JSON.stringify(json));fs.appendFileSync(target,'\n// unknown modification');
 assert.notEqual(spawnSync(process.execPath,[script,'revert','--root',root]).status,0);
 console.log('PASS apply/status/idempotence/revert; supported update overwrite -> missing -> reapply; unsupported version and modified target refused.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
