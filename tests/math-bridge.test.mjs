import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createMathBridge } from '../src/latex/math-bridge.mjs';
import { patch } from '../scripts/math-host.mjs';
const root=process.env.MATH_HOST_ROOT;
if(!root) { console.log('SKIP math host integration: set MATH_HOST_ROOT to isolated node_modules/@earendil-works'); process.exit(0); }
const tui=await import(pathToFileURL(path.join(root,'pi-tui/dist/index.js')));
const identity=s=>s;
const theme=new Proxy({}, {get:()=>identity});
const key=Symbol.for('sydney-kit.math-block');
for (const [open, close] of [['$$', '$$'], ['\\[', '\\]']]) {
test(`real parser (${open}): closed math async replacement, source preservation, fences, pending, widths and themes`,async()=>{
 let ink='#ffffff', calls=0, finish, rerenders=0;
 const bridge=createMathBridge({render:()=>{calls++;return new Promise(r=>finish=r)},color:()=>ink,supported:()=>true,image:()=>({render:()=>['IMAGE',''],invalidate(){}})});
 globalThis[key]=bridge;
 globalThis[Symbol.for('sydney-kit.math-tui')]={requestRender(){rerenders++}};
 const formula=`${open}\nx^2\n${close}`;
 const source=`Before\n\n${formula}\n\nAfter`;
 const md=new tui.Markdown(source,0,0,theme,undefined,{sydneyMath:true});
 assert.match(md.render(60).join('\n'),/x\^2/);
 assert.equal(calls,1);
 md.render(60);assert.equal(calls,1);
 finish('png');await new Promise(setImmediate);
 assert.equal(rerenders,1);
 assert.match(md.render(60).join('\n'),/IMAGE/);
 assert.deepEqual(bridge(md, {raw:formula,text:'x^2'}, 60, ()=>{}), ['IMAGE', '', ''],
   'append one spacing row after all image occupancy rows without mutating cached image lines');
 assert.deepEqual(bridge(md, {raw:formula,text:'x^2'}, 60, ()=>{}), ['IMAGE', '', '']);
 for (const width of [120, 40, 80, 23, 60]) {
   assert.match(md.render(width).join('\n'), /IMAGE/);
   assert.equal(calls, 1, 'viewport resize must reuse the existing raster');
 }
 assert.equal(md.text,source);
 const fence=new tui.Markdown('```tex\n'+formula+'\n```',0,0,theme,undefined,{sydneyMath:true});
 assert.doesNotMatch(fence.render(60).join('\n'),/IMAGE/);
 const pending=new tui.Markdown(`${open}\nx^2`,0,0,theme,undefined,{sydneyMath:true});
 assert.match(pending.render(60).join('\n'),/x\^2/);
 assert.equal(calls,1);
 assert.doesNotMatch(md.render(10).join('\n'),/IMAGE/);
 ink='#000000';md.invalidate();md.render(60);assert.equal(calls,2);
 finish(null);await new Promise(setImmediate);
 assert.match(md.render(60).join('\n'),/x\^2/);
 bridge.dispose();delete globalThis[key];
});
}
test('unsupported terminals and non-opted-in Markdown never render images',()=>{
 let calls=0;
 globalThis[key]=createMathBridge({render:()=>{calls++},color:()=>'',supported:()=>false,image:()=>{throw Error()}});
 const md=new tui.Markdown('$$\nx^2\n$$',0,0,theme,undefined,{sydneyMath:true});
 assert.match(md.render(60).join('\n'),/x\^2/);assert.equal(calls,0);
 globalThis[key]=()=>{throw Error('must not be called')};
 new tui.Markdown('$$\nx^2\n$$',0,0,theme).render(60);
 delete globalThis[key];
});
test('bundled Markdown is patched and parses real blocks',async()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'../../manifest.json')));
 const name=manifest.files.find(n=>n.includes('/chunks/')&&fs.readFileSync(path.join(root,n),'utf8').includes('sydneyMath'));
 const modules=await import(pathToFileURL(path.join(root,name)));
 assert.ok(modules.Markdown);
 let calls=0;globalThis[key]=()=>{calls++;return ['IMAGE']};
 for (const source of ['$$\nx\n$$', '\\[\nx\n\\]']) {
 const md=new modules.Markdown(source,0,0,theme,undefined,{sydneyMath:true});
 assert.match(md.render(60).join('\n'),/IMAGE/);
 }
 assert.equal(calls,2);
 delete globalThis[key];
});
test('assistant opts in while thinking and transcript remain unchanged',async()=>{
 const {initTheme}=await import(pathToFileURL(path.join(root,'pi-coding-agent/dist/modes/interactive/theme/theme.js')));initTheme('dark',false);
 const {AssistantMessageComponent}=await import(pathToFileURL(path.join(root,'pi-coding-agent/dist/modes/interactive/components/assistant-message.js')));
 const message={role:'assistant',content:[{type:'text',text:'$$\nx\n$$'},{type:'thinking',thinking:'$$\ny\n$$'}],stopReason:'stop'};
 const original=JSON.stringify(message);let calls=0;
 globalThis[key]=()=>{calls++;return ['IMAGE']};
 const component=new AssistantMessageComponent(message,false,theme);
 assert.match(component.render(60).join('\n'),/IMAGE/);
 assert.equal(calls,1);assert.equal(JSON.stringify(message),original);
 delete globalThis[key];
});
test('queue deduplicates, bounds admission and suppresses shutdown notifications',async()=>{
 let calls=0,resolve,notified=0;
 const bridge=createMathBridge({limit:2,render:()=>{calls++;return new Promise(r=>resolve=r)},image:()=>({render:()=>['image']}),color:()=>'',supported:()=>true});
 const owner={},token={raw:'$$x$$',text:'x'};
 bridge(owner,token,60,()=>notified++);bridge(owner,token,60,()=>notified++);
 bridge({}, {...token,text:'y'},60,()=>notified++);
 bridge({}, {...token,text:'z'},60,()=>notified++);
 assert.equal(calls,1);resolve(null);await new Promise(setImmediate);
 assert.equal(calls,2);assert.equal(notified,1);
 bridge.dispose();resolve(null);await new Promise(setImmediate);assert.equal(notified,1);
});
test('Pi Image keeps its image id and supplies height rows',()=>{
 tui.setCapabilities({images:'kitty',trueColor:true,hyperlinks:true});
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=';
 const component=new tui.Image(png,'image/png',{fallbackColor:identity},{maxWidthCells:30});
 const lines=component.render(40), id=component.getImageId();
 assert.ok(lines.length>0);assert.ok(id!==undefined);
 assert.deepEqual(component.render(40),lines);assert.equal(component.getImageId(),id);
 tui.resetCapabilitiesCache();
});
test('zoom changes display size while reusing the PNG and keeps the spacing row', async()=>{
 let zoom=1, renders=0;
 const sizes=[];
 const bridge=createMathBridge({render:async()=>{renders++;return 'png'}, color:()=> '#ffffff', supported:()=>true,
   zoom:()=>zoom, image:(_data,cells)=>{sizes.push(cells);return {render:()=>['IMAGE']}}});
 const owner={}, token={raw:'$$x$$',text:'x'};
 bridge(owner,token,120,()=>{});
 await new Promise(setImmediate);
 assert.deepEqual(bridge(owner,token,120,()=>{}), ['IMAGE','']);
 zoom=2;
 assert.deepEqual(bridge(owner,token,120,()=>{}), ['IMAGE','']);
 zoom=1;
 bridge(owner,token,120,()=>{});
 assert.deepEqual(sizes,[60,120]);
 assert.equal(renders,1);
 bridge.dispose();
});
test('patch refuses unknown signatures',()=>assert.throws(()=>patch('unknown','markdown'),/Incompatible/));
