import {projectRoot,hostPath,hostImport} from '../tests/helpers/paths.mjs';
import assert from 'node:assert/strict';
const {createJiti}=await hostImport('pi-coding-agent/dist/core/extensions/jiti-loader.js');
const {initTheme}=await hostImport('pi-coding-agent/dist/index.js');
const {theme}=await hostImport('pi-coding-agent/dist/modes/interactive/theme/theme.js');
const jiti=createJiti(import.meta.url,{alias:{'@earendil-works/pi-coding-agent':hostPath('pi-coding-agent/dist/index.js'),'@earendil-works/pi-tui':hostPath('pi-tui/dist/index.js')}});
const {default:install}=await jiti.import(projectRoot+'/src/tools/compact.ts');
const {renderShellCommand}=await jiti.import(projectRoot+'/src/tools/shell-command.ts');
initTheme('dark');let resolver;install({on(){},registerToolRenderer:f=>resolver=f});
const renderer=resolver('bash',()=>undefined);
const args={command:'python 分析.py --report',displayLines:10};
const result={content:[{type:'text',text:'中文 é 🙂 evaluation completed 1234567890\n'.repeat(2000)}],details:{exitCode:0}};
for(const expanded of [false,true]) {
 const ctx={state:{},cwd:'/tmp',expanded,isPartial:false,executionStarted:true,durationMs:1234};
 const c=renderer.renderCall(args,theme,ctx);renderer.renderResult(result,{expanded,isPartial:false},theme,ctx);
 const before=()=>renderShellCommand(theme,100,args,result,ctx),after=()=>c.render(100);
 assert.deepEqual(before(),after());
 for(let i=0;i<20;i++){before();after();}
 const measure=f=>{const start=performance.now();for(let i=0;i<200;i++)f();return performance.now()-start;};
 console.log(JSON.stringify({expanded,width:100,outputLines:2000,renders:200,beforeMs:measure(before),afterMs:measure(after)}));
}
