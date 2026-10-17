import {projectRoot,hostRoot,hostPath,hostImport} from './helpers/paths.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {performance} from 'node:perf_hooks';
const {createJiti}=await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');
const {initTheme}=await hostImport('pi-coding-agent/dist/index.js');
const {theme}=await hostImport('pi-coding-agent/dist/modes/interactive/theme/theme.js');
const {visibleWidth}=await hostImport('pi-tui/dist/index.js');
const start=performance.now(),root=projectRoot;
const jiti=createJiti(import.meta.url,{alias:{'@earendil-works/pi-coding-agent':hostPath('pi-coding-agent/dist/index.js'),'@earendil-works/pi-tui':hostPath('pi-tui/dist/index.js')}});
const config=await jiti.import(root+'/config.ts');const hl=await jiti.import(root+'/src/rendering/highlight.ts');
if(process.argv.includes('--failure')){config.highlighting.theme='sydney-theme-does-not-exist';assert.deepEqual(await hl.highlight('const x = 1;','ts'),['const x = 1;']);assert.equal(hl.highlightStats.initializations,1);console.log('PASS initialization failure -> plain text');process.exit(0);}
const {default:entry}=await jiti.import(root+'/index.ts');
if(process.argv.includes('--startup')){const on=process.argv.includes('--on');config.features.diff=on;config.features.codeblock=on;entry({on(){},registerToolRenderer(){},registerTool(){},registerCommand(){},registerShortcut(){},registerMarkdownTransformer(){}});console.log(JSON.stringify({on,loadAndRegisterMs:performance.now()-start,shikiInitializations:hl.highlightStats.initializations}));process.exit(0);}
initTheme('dark');const cb=await jiti.import(root+'/src/rendering/codeblock.ts');const df=await jiti.import(root+'/src/rendering/diff.ts');
assert.equal(hl.highlightStats.initializations,0);
assert.equal(cb.isClosed('```ts\nlet x = 1;'),false);assert.equal(cb.isClosed('```ts\nx\n```'),true);
cb.renderBlock('long '.repeat(1000),'ts',80,theme,false);assert.equal(hl.highlightStats.initializations,0,'streaming open fences must not initialize');
const first=performance.now();await hl.highlight('const x: number = 1;','ts');console.log('firstHighlightMs',+(performance.now()-first).toFixed(2));
for(const [lang,code] of [['ts','const value = 1;'],['python','def x():\n    return 1'],['powershell','Get-Process'],['json','{"hello":1}'],[undefined,'plain'],['ahk','MsgBox "Hello"'],['unsupported-language','raw'],['ts','const x = "'+'中'.repeat(500)+'";']]){
 await hl.highlight(code,lang);const lines=cb.renderBlock(code,lang,80,theme,true);assert.ok(lines.every(l=>visibleWidth(l)<=80));assert.ok(!lines.join('\n').includes('```'));
}
const strip=s=>s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
for(const [oldText,newText,filename] of [['const n=1;','const n=2;','a.ts'],['a\nb\nc\nd\ne','A\nb\nc\nd\nE','a.py'],['','新文件\n第二行','new.txt'],['a\n'.repeat(300),'b\n'.repeat(300),'large.ts'],['你好 Sydney','你好 世界','a.ts'],['old','new','a.unsupported']]){
 const patch=df.makePatch(filename,oldText,newText);await hl.highlight(oldText,filename.split('.').pop());await hl.highlight(newText,filename.split('.').pop());
 const rich=df.enhancedDiff(patch,filename,theme,true,()=>{});assert.ok(rich);assert.ok(rich.added+rich.removed>0);assert.ok(!/\x1b\[(?:48|7)[;m]/.test(rich.lines.join('\n')));
 const plain=rich.lines.map(strip).join('\n');assert.ok(plain.includes(newText.split('\n')[0]));
 const folded=df.enhancedDiff(patch,filename,theme,false,()=>{});assert.ok(folded.lines.length<=7);
}
assert.equal(config.diffs.sideBySide,false,'default layout is unified');
config.diffs.sideBySide=true;
for(const width of [72,80,120,160]){
 for(const [before,after] of [['head\nold\ntail','head\nnew\nextra\ntail'],['','新建文件'],['removed',''],['const s = "'+'原'.repeat(200)+'";','const s = "'+'新'.repeat(300)+'";']]){
  const patch=df.makePatch('split.ts',before,after);
  const rich=df.enhancedDiff(patch,'split.ts',theme,true,()=>{},width);
  assert.ok(rich);assert.ok(strip(rich.lines[0]).includes('修改前'));assert.ok(strip(rich.lines[0]).includes('修改后'));
  assert.ok(rich.lines.every(line=>visibleWidth(line)<=width),'split columns must respect terminal width');
  const plain=rich.lines.map(strip);
  if(before.includes('原'))assert.equal((plain.join('\n').match(/原/g)??[]).length,200,'wrapped old content preserved');
  if(after.includes('新'.repeat(10)))assert.equal((plain.join('\n').match(/新/g)??[]).length,300,'wrapped new content preserved');
  assert.ok(!df.enhancedDiff(patch,'split.ts',theme,true,()=>{},50).lines[0].includes('修改前'));
  const preview=df.enhancedDiff(patch,'split.ts',theme,false,()=>{},width).lines;
  assert.ok(preview[0].includes('修改前'));
  assert.ok(preview.length<=8,'preview has header, at most six comparison rows, optional more hint');
  assert.ok(!preview.some(l=>l.includes('@@')));
 }
}
const {default:registerCompact}=await jiti.import(root+'/src/tools/compact.ts');let rendererFactory;
registerCompact({on(){},registerToolRenderer(fn){rendererFactory=fn}});
for(const name of ['edit','write']){
 const renderer=rendererFactory(name),args={path:'preview.ts',content:'const n=2;'},state={};
 const ctx={state,args,cwd:root,expanded:false,isPartial:false,isError:false};
 const component=renderer.renderCall(args,theme,ctx);
 renderer.renderResult({content:[{type:'text',text:'Success'}],details:{patch:df.makePatch(args.path,'const n=1;',args.content)}},{expanded:false,isPartial:false},theme,ctx);
 const output=component.render(100).map(strip);
 assert.ok(output.some(l=>l.includes('修改前')&&l.includes('修改后')),`${name} default compact preview is split`);
 assert.ok(output.some(l=>l.includes('const n=1;')&&l.includes('const n=2;')));
 const result={content:[{type:'text',text:'Success'}],details:{patch:df.makePatch(args.path,'const n=1;',args.content)}};
 renderer.renderResult(result,{expanded:true,isPartial:false},theme,ctx);
 let expanded=component.render(100).map(strip).join('\n');
 assert.ok(expanded.includes('修改前'));
 assert.ok(!expanded.includes('Success'));
 assert.ok(!expanded.includes('参数')&&!expanded.includes('"path":'));
 config.compact.showExpandedArgs=true;
 assert.ok(component.render(100).map(strip).join('\n').includes('"path":'));
 config.compact.showExpandedArgs=false;
 assert.ok(!component.render(100).map(strip).join('\n').includes('"path":'));
 ctx.isError=true;
 renderer.renderResult({...result,content:[{type:'text',text:'Important write error'}]},{expanded:true,isPartial:false},theme,ctx);
 expanded=component.render(100).map(strip).join('\n');
 assert.ok(expanded.includes('Important write error'));assert.ok(!expanded.includes('修改前'));
}
const savedLimit=config.highlighting.cacheEntries;config.highlighting.cacheEntries=2;
const owners=[];let ownerRedraws=0;
for(let n=0;n<12;n++){
 const r=rendererFactory('edit'),a={path:`owner-${n}.ts`},context={state:{},args:a,cwd:root,expanded:false,isPartial:false,isError:false};
 const component=r.renderCall(a,theme,context);context.invalidate=()=>{ownerRedraws++;component.invalidate()};
 r.renderResult({content:[{type:'text',text:'Success'}],details:{patch:df.makePatch(a.path,`const old${n}=1;`,`const new${n}=2;`)}},{expanded:false,isPartial:false},theme,context);
 owners.push(component);component.render(100);
}
await hl.settleHighlights();const jobsAfterPrepare=hl.highlightStats.jobs;
for(let pass=0;pass<3;pass++){for(const component of owners){component.invalidate();component.render(100);}await hl.settleHighlights();}
assert.equal(hl.highlightStats.jobs,jobsAfterPrepare,'component-owned highlights survive global cache eviction');
assert.ok(ownerRedraws<=24);config.highlighting.cacheEntries=savedLimit;
const six=df.makePatch('limit.txt','a\n'.repeat(6),'b\n'.repeat(6));
assert.equal(df.enhancedDiff(six,'limit.txt',theme,false,()=>{},100).lines.length,7);
const seven=df.makePatch('limit.txt','a\n'.repeat(7),'b\n'.repeat(7));
assert.equal(df.enhancedDiff(seven,'limit.txt',theme,false,()=>{},100).lines.length,8);
const numbered=df.enhancedDiff(df.makePatch('n.txt','head\ntail','head\ninsert\ntail'),'n.txt',theme,true,()=>{},100).lines.map(strip);
assert.ok(numbered.some(line=>/2 tail/.test(line.split(' │ ')[0])&&/3 tail/.test(line.split(' │ ')[1])),'context uses distinct old/new line numbers');
config.diffs.sideBySide=false;
const defaultPreview=df.enhancedDiff(df.makePatch('default.ts','const n=1;','const n=2;'),'default.ts',theme,false,()=>{},100);
assert.ok(!defaultPreview.lines.some(line=>line.includes('修改前')));
const longCode='const huge = "'+'z'.repeat(5000)+'";';const jobsBefore=hl.highlightStats.jobs;
assert.deepEqual(await hl.highlight(longCode,'ts'),[longCode]);assert.equal(hl.highlightStats.jobs,jobsBefore,'pathological long lines skip grammar without losing content');
const longPatch=df.makePatch('huge.ts','const huge = "'+'a'.repeat(5000)+'";',longCode);
const fullLong=df.enhancedDiff(longPatch,'huge.ts',theme,true,()=>{},100).lines.map(strip).join('\n');
assert.ok(fullLong.includes('z'.repeat(5000)),'expanded view retains full long content');
let notices=0;const ready=()=>notices++;
for(let n=0;n<12;n++)hl.highlightSync('const notificationTest = 99;','ts',ready);
await hl.settleHighlights();assert.equal(notices,1,'same component subscribes only once');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sydney-write-diff-'));
try{let tool;df.default({registerTool:t=>tool=t});const ctx={cwd:temp};let r=await tool.execute('one',{path:'new.ts',content:'const n=1;'},undefined,undefined,ctx);assert.ok(r.details.sydneyNewFile);assert.ok(r.details.sydneyDiffPatch);r=await tool.execute('two',{path:'new.ts',content:'const n=2;'},undefined,undefined,ctx);assert.ok(!r.details.sydneyNewFile);assert.equal(fs.readFileSync(path.join(temp,'new.ts'),'utf8'),'const n=2;');}finally{fs.rmSync(temp,{recursive:true,force:true});}
await hl.settleHighlights();
assert.equal(hl.highlightStats.initializations,1);console.log('PASS codeblock cases, open stream, diff cases, no backgrounds, write delegation and shared single initialization');
console.log('activeResources',process.getActiveResourcesInfo());
process.exit(0);
