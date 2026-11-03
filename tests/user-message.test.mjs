import {projectRoot,hostPath,hostImport} from './helpers/paths.mjs';
import assert from 'node:assert/strict';
const {createJiti}=await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');
const {UserMessageComponent}=await hostImport('pi-coding-agent/dist/modes/interactive/components/user-message.js');
const {loadThemeFromPath,setThemeInstance,getMarkdownTheme}=await hostImport('pi-coding-agent/dist/modes/interactive/theme/theme.js');
const {visibleWidth}=await hostImport('pi-tui/dist/index.js');
const jiti=createJiti(import.meta.url,{alias:{'@earendil-works/pi-tui':hostPath('pi-tui/dist/index.js')}});
const {default:install}=await jiti.import(projectRoot+'/src/ui/user-message.ts');
let transform;const hooks={};install({registerMarkdownTransformer:f=>transform=f,on:(name,f)=>hooks[name]=f});
setThemeInstance(loadThemeFromPath(projectRoot+'/tests/fixtures/tokyo-night.json'));
const samples=['FormulaScratchPad.ahk 隐藏托盘图标','第一行\n第二行','中文长消息'.repeat(50),'- item','1. first\n   - nested','> quote','> - nested quote list','|a|b|\n|-|-|\n|1|2|','# heading','```js\nhello\n```','```js\nunclosed','~~~~python\nunclosed','````js\n```\nstill code','    indented code','- ```js\n  nested code','> ```js\n> quoted code',''];
const plain=s=>s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/\x1b\][^\x07]*\x07/g,'');
for(const text of samples) for(const pad of [0,1,3]) {
 const component=new UserMessageComponent(text,getMarkdownTheme(),pad,[transform]);
 // Reuse the actual component across resizes to exercise its layout cache.
 for(const width of [20,80,120,25,80]) {
  const lines=component.render(width);
  assert.ok(lines.every(l=>visibleWidth(l)<=width),JSON.stringify({text,width,pad}));
  const rendered=lines.map(plain);
  const top=rendered.filter(l=>l.includes('▔'));
  const bottom=rendered.filter(l=>l.includes('▁'));
  const context=JSON.stringify({text,width,pad});
  assert.equal(top.length,1,context);assert.equal(bottom.length,1,context);
  assert.equal(top[0],' '.repeat(pad)+'▔'.repeat(width-2*pad)+' '.repeat(pad),context);
  assert.equal(bottom[0],' '.repeat(pad)+'▁'.repeat(width-2*pad)+' '.repeat(pad),context);
  const transformed=transform(text,{messageType:'user',availableWidth:width-2*pad});
  assert.ok(transformed.includes(text.trimEnd()),context);
  if (text === '第一行\n第二行' || text === 'FormulaScratchPad.ahk 隐藏托盘图标') {
    const first = rendered.findIndex(l => l.includes('▔'));
    const last = rendered.findIndex(l => l.includes('▁'));
    assert.ok(rendered[first+1].trim(), 'no blank row below top rule');
    assert.ok(rendered[last-1].trim(), 'no blank row above bottom rule');
  }
  assert.equal(component.text,text,'stored prompt is unchanged');
 }
}
hooks.session_start({},{ui:{theme:{fg:(_c,s)=>s}}});
assert.equal(transform('message test',{messageType:'user',availableWidth:80}),'▔'.repeat(80)+'  \nmessage test  \n'+'▁'.repeat(80));
assert.equal(transform('assistant unchanged',{messageType:'assistant',availableWidth:80}),'assistant unchanged');
console.log('PASS standalone aligned rules across lists, quotes, tables, open/closed fences, padding and repeated resize; stored prompts unchanged');
