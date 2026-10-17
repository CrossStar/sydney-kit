import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { hostPath, hostImport, projectRoot } from './helpers/paths.mjs';
const { visibleWidth } = await hostImport('pi-tui/dist/index.js');
const themeModule = await hostImport('pi-coding-agent/dist/modes/interactive/theme/theme.js');
themeModule.initTheme();
let source=fs.readFileSync(projectRoot+'/patches/compaction-card.js','utf8');
for(const [from,to] of Object.entries({
 '@earendil-works/pi-tui':'pi-tui/dist/index.js',
 '../theme/theme.js':'pi-coding-agent/dist/modes/interactive/theme/theme.js',
 './keybinding-hints.js':'pi-coding-agent/dist/modes/interactive/components/keybinding-hints.js',
}))source=source.replace(JSON.stringify(from),JSON.stringify(pathToFileURL(hostPath(to)).href));
const {CompactionSummaryMessageComponent:Card}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const strip=s=>s.replace(/\x1b\[[0-9;]*m/g,'');
const card=new Card({tokensBefore:61521,summary:'Readable summary 中文 '.repeat(20),details:{encrypted_content:'SECRET'}},undefined,0);
assert.equal(card.render(120).length,1);
assert.match(strip(card.render(120)[0]),/✓ 压缩上下文 压缩前 61.5k tokens ▸ .*展开/);
assert.ok(card.render(120)[0].includes(themeModule.theme.fg('accent','压缩上下文')));
card.setExpanded(true);
assert.match(strip(card.render(120)[0]),/61,521 tokens ▾ .*收起/);
assert.ok(card.render(40).length>2);
assert.ok(!card.render(120).join('').includes('SECRET'));
for(const expanded of [false,true])for(const pad of [0,1,3])for(const width of [0,1,2,3,4,5,10,20,80]){
 card.setExpanded(expanded);card.setOutputPad(pad);card.invalidate();
 for(const line of card.render(width))assert.ok(visibleWidth(line)<=width,`width ${width}, pad ${pad}`);
}
const empty=new Card({tokensBefore:0,summary:''},undefined,0);empty.setExpanded(true);
assert.ok(strip(empty.render(80).join('')).includes('暂无可读摘要'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sydney-card-'));
try{
 const relative='pi-coding-agent/dist/modes/interactive/components/compaction-summary-message.js';
 const target=path.join(temp,relative);fs.mkdirSync(path.dirname(target),{recursive:true});
 const stock=hostPath(relative)+'.sydney-compaction-card-1.3.0.bak';
 fs.copyFileSync(fs.existsSync(stock)?stock:hostPath(relative),target);
 for(const pkg of ['pi-tui','pi-coding-agent']){fs.mkdirSync(path.join(temp,pkg),{recursive:true});fs.writeFileSync(path.join(temp,pkg,'package.json'),JSON.stringify({version:'1.3.0'}));}
 const original=fs.readFileSync(target,'utf8');
 const run=command=>spawnSync(process.execPath,[projectRoot+'/patches/compaction-card.mjs',command,'--root',temp],{encoding:'utf8'});
 for(const command of ['status','apply','apply','revert']){const r=run(command);assert.equal(r.status,0,r.stderr);}
 assert.equal(fs.readFileSync(target,'utf8'),original);
 fs.appendFileSync(target,'\n// unrelated edit');assert.notEqual(run('apply').status,0);
 assert.ok(fs.readFileSync(target,'utf8').endsWith('// unrelated edit'));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log('PASS compaction card rendering, widths, expansion, summary isolation and reversible patch');
