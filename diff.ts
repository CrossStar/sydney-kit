// Original implementation inspired by pi-diff's patch -> word ranges -> ANSI layering design.
import { createTwoFilesPatch, parsePatch, diffWordsWithSpace } from 'diff';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createWriteToolDefinition, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { visibleWidth, wrapTextWithAnsi, truncateToWidth } from '@earendil-works/pi-tui';
import { highlightSync, languageForPath, type HighlightCache } from './highlight';
import { diffs as config, compact } from './config';
type Row={sign:string;text:string;number?:number;oldNumber?:number;newNumber?:number;old?:number;next?:number;ranges:[number,number][];prepare?:()=>void};
export function makePatch(path:string,oldText:string,newText:string){return createTwoFilesPatch(path,path,oldText,newText,'','',{context:config.contextLines});}
function buildRows(patch:string){
  const rows:Row[]=[],old:string[]=[],next:string[]=[];
  for(const file of parsePatch(patch))for(const h of file.hunks){
    rows.push({sign:'@',text:`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,ranges:[]});
    let a=h.oldStart,b=h.newStart;
    for(const line of h.lines){const sign=line[0],text=line.slice(1);if(![' ','+','-'].includes(sign))continue;
      const row:Row={sign,text,ranges:[]};
      if(sign!=='+' ){row.old=old.length;row.oldNumber=a;row.number=a++;old.push(text);}
      if(sign!=='-' ){row.next=next.length;row.newNumber=b;row.number=b++;next.push(text);}
      rows.push(row);
    }
  }
  for(let i=0;i<rows.length;){if(!['+','-'].includes(rows[i].sign)){i++;continue;}
    const removed:Row[]=[],added:Row[]=[];
    while(i<rows.length&&['+','-'].includes(rows[i].sign)){const r=rows[i++];(r.sign==='-'?removed:added).push(r);}
    for(let n=0;n<Math.max(removed.length,added.length);n++){
      const a=removed[n],b=added[n];
      let computed=false;
      const prepare=()=>{
      if(computed)return;computed=true;
      if(!a||!b||(a.text.length+b.text.length)>config.wordCompareLimit){if(a)a.ranges=[[0,a.text.length]];if(b)b.ranges=[[0,b.text.length]];return;}
      let x=0,y=0;
      for(const p of diffWordsWithSpace(a.text,b.text)){if(p.removed){a.ranges.push([x,x+p.value.length]);x+=p.value.length;}else if(p.added){b.ranges.push([y,y+p.value.length]);y+=p.value.length;}else{x+=p.value.length;y+=p.value.length;}}
      };
      if(a)a.prepare=prepare;if(b)b.prepare=prepare;
    }
  }
  return {rows,old,next};
}
export type DiffModelCache={key?:string;parsed?:ReturnType<typeof buildRows>};
const parsedCache=new Map<string,ReturnType<typeof buildRows>>();
function rowsFor(patch:string){
  let parsed=parsedCache.get(patch);
  if(parsed){parsedCache.delete(patch);parsedCache.set(patch,parsed);return parsed;}
  parsed=buildRows(patch);parsedCache.set(patch,parsed);
  if(parsedCache.size>config.parsedCacheEntries)parsedCache.delete(parsedCache.keys().next().value!);
  return parsed;
}
function emphasize(ansi:string,ranges:[number,number][],theme:any,color:'success'|'error'){
  let result='',position=0,style='',range=0;
  for(const part of ansi.match(/\x1b\[[0-?]*[ -/]*[@-~]|[^\x1b]+/g)??[]){
    if(part.startsWith('\x1b')){style=part==='\x1b[39m'?'':style+part;result+=part;continue;}
    let offset=0;
    while(offset<part.length){
      while(range<ranges.length&&position>=ranges[range][1])range++;
      const changed=range<ranges.length&&position>=ranges[range][0];
      const boundary=range<ranges.length?ranges[range][changed?1:0]:Infinity;
      const length=Math.min(part.length-offset,boundary-position);
      const text=part.slice(offset,offset+length);
      result+=changed?theme.fg(color,theme.underline(text))+style:text;
      position+=length;offset+=length;
    }
  }
  return result;
}
function splitView(rows:Row[],old:string[],next:string[],theme:any,width:number,preview=false):string[]{
  const leftWidth=Math.floor((width-3)/2),rightWidth=width-3-leftWidth;
  const gutter=String(rows.reduce((max,r)=>Math.max(max,r.oldNumber??0,r.newNumber??0),1)).length;
  const join=(left:string,right:string)=>left+'\x1b[0m'+' '.repeat(Math.max(0,leftWidth-visibleWidth(left)))+theme.fg('dim',' │ ')+right+'\x1b[0m';
  const result=[join(theme.fg('dim',truncateToWidth('修改前',leftWidth)),theme.fg('dim',truncateToWidth('修改后',rightWidth)))];
  function cell(row:Row|undefined,left:boolean,space:number):string[]{
    if(!row)return [''];
    const color=left?'error':'success',changed=row.sign!==' ';
    const raw=(left?old[row.old!]:next[row.next!])??row.text;
    row.prepare?.();
    const text=changed?emphasize(raw,row.ranges,theme,color):raw;
    return wrapTextWithAnsi(text,Math.max(1,space-gutter-3)).map((part,i)=>{
      const sign=i===0&&changed?theme.fg(color,left?'−':'+'):' ';
      const number=i===0?String((left?row.oldNumber:row.newNumber)??''):'';
      return `${sign} ${theme.fg('dim',number.padStart(gutter))} ${part}`;
    });
  }
  let omitted=false;
  function pair(a?:Row,b?:Row){
    if(preview && result.length>compact.editPreviewLines){omitted=true;return;}
    const l=cell(a,true,leftWidth),r=cell(b,false,rightWidth);
    for(let k=0;k<Math.max(l.length,r.length);k++){
      if(preview && result.length>compact.editPreviewLines){omitted=true;break;}
      result.push(join(l[k]??'',r[k]??''));
    }
  }
  for(let i=0;i<rows.length && !omitted;){
    const row=rows[i];
    if(row.sign==='@'){if(!preview)result.push(theme.fg('dim',truncateToWidth(row.text,width)));i++;}
    else if(row.sign===' '){if(!preview)pair(row,row);i++;}
    else{
      const removed:Row[]=[],added:Row[]=[];
      while(i<rows.length&&['+','-'].includes(rows[i].sign)){const item=rows[i++];(item.sign==='-'?removed:added).push(item);}
      for(let k=0;k<Math.max(removed.length,added.length) && !omitted;k++)pair(removed[k],added[k]);
    }
  }
  if(omitted)result.push(theme.fg('dim','… 展开查看完整差异'));
  return result;
}
function previewRows(rows:Row[],paired:boolean){
  if(!paired)return rows.filter(r=>r.sign==='+'||r.sign==='-').slice(0,compact.editPreviewLines);
  const keep=new Set<Row>();let count=0;
  for(let i=0;i<rows.length&&count<compact.editPreviewLines;){
    if(!['+','-'].includes(rows[i].sign)){i++;continue;}
    const a:Row[]=[],b:Row[]=[];
    while(i<rows.length&&['+','-'].includes(rows[i].sign)){const r=rows[i++];(r.sign==='-'?a:b).push(r);}
    for(let n=0;n<Math.max(a.length,b.length)&&count<compact.editPreviewLines;n++,count++){if(a[n])keep.add(a[n]);if(b[n])keep.add(b[n]);}
  }
  return rows.filter(r=>keep.has(r)||r.sign==='@');
}
function previewText(text:string){return text.length>config.previewLineChars?text.slice(0,config.previewLineChars).replace(/[\uD800-\uDBFF]$/,'')+'…':text;}
export function enhancedDiff(patch:string,path:string,theme:any,expanded:boolean,ready:()=>void,width=0,highlightCache?:HighlightCache,modelCache?:DiffModelCache){
  try{
    const parsed=modelCache?.key===patch&&modelCache.parsed?modelCache.parsed:rowsFor(patch),lang=languageForPath(path);
    if(modelCache){modelCache.key=patch;modelCache.parsed=parsed;}
    const changes=parsed.rows.filter(r=>r.sign==='+'||r.sign==='-');
    const sideBySide=config.sideBySide && width>=config.sideBySideMinWidth;
    const selected=expanded?parsed.rows:previewRows(parsed.rows,sideBySide);
    let old:string[],next:string[];
    if(expanded){old=highlightSync(parsed.old.join('\n'),lang,ready,highlightCache);next=highlightSync(parsed.next.join('\n'),lang,ready,highlightCache);}
    else{
      const side=(key:'old'|'next')=>{
        const rows=selected.filter(r=>r[key]!==undefined),out:string[]=[];
        const lines=highlightSync(rows.map(r=>previewText(r.text)).join('\n'),lang,ready,highlightCache);
        rows.forEach((r,i)=>out[r[key]!]=lines[i]??previewText(r.text));return out;
      };
      old=side('old');next=side('next');
    }
    const lines=sideBySide
      ? splitView(selected,old,next,theme,width,!expanded)
      : selected.map(r=>{
      if(r.sign==='@')return theme.fg('dim',r.text);
      const color=r.sign==='+'?'success':'error';
      r.prepare?.();
      const body=(r.sign==='-'?old[r.old!]:next[r.next!])??(expanded?r.text:previewText(r.text));
      const prefix=r.sign===' '?theme.fg('dim',' '):theme.fg(color,r.sign==='+'?'+':'−');
      return `${prefix} ${theme.fg('dim',String(r.number??''))} ${r.sign===' '?body:emphasize(body,r.ranges,theme,color)}`;
    });
    if(!expanded&&sideBySide&&selected.filter(r=>r.sign!=='@').length<changes.length&&!lines.some(l=>l.includes('展开查看完整差异')))lines.push(theme.fg('dim','… 展开查看完整差异'));
    if(!expanded&&!sideBySide&&changes.length>compact.editPreviewLines)lines.push(theme.fg('dim',`… 还有 ${changes.length-compact.editPreviewLines} 行`));
    return {lines,added:changes.filter(r=>r.sign==='+').length,removed:changes.filter(r=>r.sign==='-').length};
  }catch{return undefined;}
}
export default function registerDiff(pi:ExtensionAPI){
  const base=createWriteToolDefinition(process.cwd());
  pi.registerTool({...base,async execute(id,args,signal,onUpdate,ctx){
    let before:string|undefined,isNew=false;
    const tool=createWriteToolDefinition(process.cwd(),{operations:{
      mkdir:async dir=>{await mkdir(dir,{recursive:true});},
      writeFile:async(path,content)=>{
        try{if((await stat(path)).size<=config.maxSnapshotBytes)before=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await readFile(path));}catch(e:any){if(e.code==='ENOENT'){before='';isNew=true;}}
        await writeFile(path,content,'utf8');
      }
    }});
    const result=await tool.execute(id,args,signal,onUpdate,ctx);
    if(before!==undefined&&Buffer.byteLength(args.content,'utf8')<=config.maxSnapshotBytes){try{result.details={...result.details,sydneyDiffPatch:makePatch(args.path,before,args.content),sydneyNewFile:isNew};}catch{}}
    return result;
  }});
}
