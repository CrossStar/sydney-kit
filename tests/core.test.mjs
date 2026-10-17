import {projectRoot,hostRoot,hostPath,hostImport} from './helpers/paths.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {createJiti}=await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');
const {visibleWidth}=await hostImport('pi-tui/dist/index.js');
const root=projectRoot;
const jiti=createJiti(import.meta.url,{alias:{'@earendil-works/pi-coding-agent':hostPath('pi-coding-agent/dist/index.js'),'@earendil-works/pi-tui':hostPath('pi-tui/dist/index.js')}});
const {default:entry}=await jiti.import(root+'/index.ts');
const {features}=await jiti.import(root+'/config.ts');
features.userMessage=false;features.appearance=false;features.diff=false;features.codeblock=false;features.pasteImage=false;features.ternImagePatch=false;
const {initTheme}=await hostImport('pi-coding-agent/dist/index.js');initTheme('dark');
const theme={fg:(_,s)=>s};
let resolver;
for(const footer of [false,true])for(const compact of [false,true]){
 features.footer=footer;features.compact=compact;let events=0,commands=0,renders=0;
 entry({on(){events++},registerCommand(){commands++},registerToolRenderer(r){resolver=r;renders++}});
 assert.equal(commands,footer?1:0);assert.equal(renders,compact?1:0);assert.equal(events>0,footer||compact);
}
features.footer=true;features.compact=true;
for(const name of ['bash','read','edit','write','grep','unknown_mcp'])for(const expanded of [false,true]){
 const r=resolver(name,()=>undefined);
 const ctx={state:{},cwd:'F:/Workspace',expanded,isError:false,durationMs:1234};
 const args={path:'F:\\Workspace\\中文.txt',command:name==='bash'?"powershell.exe -NoProfile -Command '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding; Get-Process'":undefined};
 const component=r.renderCall(args,theme,ctx);
 const diff=Array.from({length:10},(_,i)=>`+ ${i+1} 中文`).join('\n');
 r.renderResult({content:[{type:'text',text:Array.from({length:100},(_,i)=>'中文输出 '+i).join('\n')}],details:name==='edit'?{diff}:{}},{expanded,isPartial:false},theme,ctx);
 for(const width of [0,1,20,80,120])for(const line of component.render(width))assert.ok(visibleWidth(line)<=width,`${name} overflow ${width}`);
 if(!expanded&&!['edit','grep'].includes(name))assert.equal(component.render(80).length,1);
 if(!expanded&&name==='grep')assert.ok(component.render(80).length>1);
 assert.ok(component.render(80)[0].startsWith(name==='edit'||name==='write'?'✎':'✓'));
 assert.ok(!component.render(80).some(l=>/[\u2502\u251c\u2570\u256d]/.test(l)));
 if(expanded&&name!=='edit')assert.ok(component.render(80).some(l=>l.includes('中文输出 99')));
 ctx.isError=true;r.renderResult({content:[{type:'text',text:'error1\nerror2\nerror3\nerror4'}]}, {expanded:false,isPartial:false},theme,ctx);assert.equal(component.render(80).length,4);assert.ok(component.render(80)[0].startsWith('✗'));assert.ok(component.render(80)[1].startsWith('    '));
}
const old=projectRoot+'/tests/fixtures/original-footer.ts';
const fixture=fs.mkdtempSync((process.env.TEMP ?? '.')+'/sydney-footer-');
fs.writeFileSync(fixture+'/original.ts',fs.readFileSync(fs.existsSync(old)?old:old+'.bak'));
let original;
try { original=await jiti.import(fixture+'/original.ts'); } finally { fs.rmSync(fixture,{recursive:true,force:true}); }
const migrated=await jiti.import(root+'/src/ui/footer.ts');
for(const width of [1,20,64,65,80,85,120])for(const percent of [0,79,80,89,90,100]){
 const render=(install)=>{let hook,component;install({on:(n,f)=>{if(n==='session_start')hook=f},registerCommand(){},getThinkingLevel:()=> 'medium'});hook({}, {mode:'tui',model:{id:'model',reasoning:true},sessionManager:{getCwd:()=> 'F:\\Workspace'},getContextUsage:()=>({percent}),ui:{setFooter:f=>{component=f({requestRender(){}},theme,{onBranchChange:()=>()=>{},getGitBranch:()=> 'main',getExtensionStatuses:()=>new Map([['b','中文'],['a','ready']])})}}});return component.render(width)};
 assert.deepEqual(render(original.default),render(migrated.default));
}
const sdk=await hostImport('pi-coding-agent/dist/index.js');
const os=await import('node:os');const path=await import('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sydney-kit-'));
try {
 for(const [name,args] of [['write',{path:'sample.txt',content:'hello\n'}],['read',{path:'sample.txt'}],['edit',{path:'sample.txt',edits:[{oldText:'hello',newText:'hello Sydney'}]}],['bash',{command:'rg hello sample.txt'}],['bash',{command:"powershell.exe -NoProfile -Command 'Write-Output ok'"}],['bash',{command:"powershell.exe -NoProfile -Command '1..1000'"}]]){
 const factory=sdk['create'+name[0].toUpperCase()+name.slice(1)+'ToolDefinition'];
 const result=await factory(temp).execute('smoke',args,undefined,undefined,{cwd:temp,sessionManager:{getSessionId:()=> 'sydney-kit-test',getSessionFile:()=>undefined}});
 const r=resolver(name,()=>undefined),ctx={state:{},cwd:temp,expanded:false,isError:false};
 const c=r.renderCall(args,theme,ctx);r.renderResult(result,{expanded:false,isPartial:false},theme,ctx);
 assert.ok(c.render(80).every(l=>visibleWidth(l)<=80));if(name!=='edit')assert.equal(c.render(80).length,1);
 }
 await assert.rejects(()=>sdk.createReadToolDefinition(temp).execute('missing',{path:'missing.txt'},undefined,undefined,{cwd:temp}));
}finally{fs.rmSync(temp,{recursive:true,force:true})}
for (const [name,args,details,text] of [
 ['web_search',{queries:['Pi rendering','中文测试']},{totalResults:3},'Source: Pi Docs (https://pi.dev)'],
 ['fetch_content',{urls:['https://pi.dev','https://example.com']},{successful:2,urlCount:2},'## Fetched URLs\n\n- Pi Docs (123 chars)\n- Example (456 chars)'],
 ['get_search_content',{responseId:'abc',urlIndex:0},{returnedChars:42},'Readable page content'],
 ['source_check',{claim:'A claim'},{sourceCount:2},'Source evidence'],
 ['mcp__web__web_search',{query:'test'},{totalResults:1},'Source: test'],
]) {
 const r=resolver(name,()=>undefined),ctx={state:{},cwd:'F:/Workspace',expanded:false,isError:false};
 const c=r.renderCall(args,theme,ctx);r.renderResult({details,content:[{type:'text',text}]},{expanded:false,isPartial:false},theme,ctx);
 assert.ok(c.render(80).length>1);assert.ok(!c.render(80)[0].includes('{'));
 for(const width of [1,20,80,120])assert.ok(c.render(width).every(l=>visibleWidth(l)<=width));
 r.renderResult({details:{error:'network failure'},content:[{type:'text',text:'network failure'}]},{expanded:false,isPartial:false},theme,ctx);
 assert.ok(c.render(80)[0].startsWith('✗'));
}
for(const [name,args,details,text,icon,expected] of [
 ['read',{path:'F:/Workspace/a.ts',offset:10,limit:6},{},'const value = 1;','✓','从第 10 行'],
 ['bash',{command:'node test.js'},{exitCode:1,stderr:'Actual failure'},'normal output\nnoise','✗','Actual failure'],
 ['bash',{command:'node test.js'},{exitCode:0},'Error is just a string in this successful output','✓','exit 0'],
 ['web_enable',{}, {},'Enabled tools','✓','启用网页工具'],
 ['multi_tool_use.parallel',{tool_uses:[{recipient_name:'functions.read'},{recipient_name:'functions.ls'}]}, {},'done','✓','functions.read'],
 ['mcp__custom__lookup',{queries:['中文','test']},{},'result','✓','中文'],
 ['find',{pattern:'*.ts',path:'F:/Workspace'},{},'F:/Workspace/a.ts\nF:/Workspace/b.ts','✓','a.ts'],
 ['grep',{pattern:'hello',path:'F:/Workspace'},{matchCount:1},'F:/Workspace/a.ts:12:hello','✓','a.ts:12'],
 ['ls',{path:'F:/Workspace'},{},'src/\nREADME.md','✓','src/'],
 ['ask_user_question',{questions:[{header:'Scope'}]},{answers:{Scope:'Visual only'}},'','✓','Scope → Visual only'],
 ['bg_run',{name:'Tests'},{status:'running'},'Started task','…','running'],
 ['bg_result',{taskId:'a'},{status:'not_ready'},'Not ready','…','not_ready'],
 ['bg_status',{}, {tasks:[{name:'Tests',status:'completed',durationMs:1500}]},'','✓','Tests · completed'],
 ['bg_kill',{taskId:'a'},{status:'killed'},'Task stopped','■','killed'],
 ['ask_user_question',{questions:[]},{cancelled:true},'Cancelled','■','已取消'],
 ['bg_result',{taskId:'a'},{status:'failed',error:'Failure'},'Failure','✗','Failure'],
 ['bg_logs',{taskId:'a'},{},Array.from({length:20},(_,i)=>'log '+i).join('\n'),'✓','log 19'],
]) {
 const r=resolver(name,()=>undefined),ctx={state:{},cwd:'F:/Workspace',expanded:false,isError:false};
 const c=r.renderCall(args,theme,ctx);r.renderResult({details,content:[{type:'text',text}]},{expanded:false,isPartial:false},theme,ctx);
 assert.ok(c.render(80)[0].startsWith(icon),name);assert.ok(c.render(80).some(l=>l.includes(expected)),name);
 if(name.startsWith('bg_'))assert.ok(c.render(80)[0].includes(name.replace('bg_','bg ')),`background label: ${name}`);
 for(const w of [1,20,80,120])assert.ok(c.render(w).every(l=>visibleWidth(l)<=w));
 r.renderResult({details,content:[{type:'text',text}]},{expanded:true,isPartial:false},theme,ctx);
 assert.ok(!c.render(80).some(l=>l.trim()==='参数'));
}
const {ResultNames}=await jiti.import(root+'/src/tools/result-names.ts');
const names=new ResultNames();
names.remember('bg_run',{name:'TypeScript检查'},{details:{taskId:'task-123456'},content:[]});
assert.ok(names.describe('bg_logs',{taskId:'task-123'}).includes('TypeScript检查'));
names.remember('bg_run',{name:'Another'},{details:{taskId:'task-123999'},content:[]});
assert.equal(names.describe('bg_logs',{taskId:'task-123'}),undefined,'ambiguous IDs stay raw');
names.remember('web_search',{queries:['第一条','第二条']},{details:{responseId:'response-1'},content:[]});
assert.equal(names.describe('get_search_content',{responseId:'response-1',queryIndex:1}),'第一条 · 第二条 · query 1');
assert.equal(names.describe('get_search_content',{responseId:'response-1',query:'explicit'}),undefined);
names.clear();assert.equal(names.describe('bg_logs',{taskId:'task-123456'}),undefined);
console.log('PASS: session-local task/source names, unique prefixes, explicit arguments and cache reset.');
console.log('PASS: file/search/task/question adapters, pending vs completed states, output-first expansion and widths.');
console.log('PASS: web query arrays, URL arrays, previews, real result counts, namespace aliases, errors and narrow widths.');
console.log('PASS: actual built-in rg/PowerShell/read/write/edit/long-output/missing-file smoke; component widths; feature flags; footer output equality across 42 fixtures.');
