import { highlighting as config } from './config';
export const highlightStats = { initializations: 0, jobs: 0 };
let instance: Promise<any> | undefined;
let cli: any;
type HighlightEntry={promise:Promise<string[]>;lines?:string[];listeners:Set<()=>void>};
export type HighlightCache=Map<string,HighlightEntry>;
const cache:HighlightCache = new Map();
const pendingJobs=new Set<Promise<string[]>>();
const notifications=new Set<()=>void>();let notificationScheduled=false;
function notify(listener:()=>void){
  notifications.add(listener);if(notificationScheduled)return;notificationScheduled=true;
  queueMicrotask(()=>{notificationScheduled=false;const pending=[...notifications];notifications.clear();for(const fn of pending){try{fn();}catch{}}});
}
export const languageName=(lang?:string)=>{const key=(lang??'text').trim().split(/\s/)[0].toLowerCase();return config.aliases[key]??key;};
export const languageForPath=(path:string)=>languageName(path.split('.').pop());
const plain=(code:string)=>code.split('\n');
function usePlain(code:string,lang?:string){return !code||code.length>config.maxChars||['text','plain','plaintext',''].includes(languageName(lang))||code.split('\n').some(line=>line.length>config.maxLineChars);}
async function initialize(){
  if(!instance){highlightStats.initializations++;instance=(async()=>{
    const shiki=await import('shiki');
    const highlighter=await shiki.getSingletonHighlighter({themes:[config.theme],langs:config.preload});
    try{cli=(await import('@shikijs/cli')).codeToANSI;}catch{}
    return {highlighter,shiki};
  })().catch(()=>null);}
  return instance;
}
function tokenAnsi(tokens:any[][]):string[]{return tokens.map(line=>line.map(t=>{
  const hex=t.color?.match(/^#([\da-f]{6})$/i)?.[1];
  return hex?`\x1b[38;2;${parseInt(hex.slice(0,2),16)};${parseInt(hex.slice(2,4),16)};${parseInt(hex.slice(4,6),16)}m${t.content}\x1b[39m`:t.content;
}).join(''));}
async function compute(code:string,lang:string):Promise<string[]>{
  try{
    const loaded=await initialize();if(!loaded)return plain(code);
    const {highlighter,shiki}=loaded;
    if(!highlighter.getLoadedLanguages().includes(lang)){
      if(!shiki.bundledLanguages[lang])return plain(code);
      await highlighter.loadLanguage(lang);
    }
    if(cli){try{return (await cli(code,lang,config.theme,{colorLevel:3})).replace(/\n$/,'').split('\n');}catch{}}
    return tokenAnsi(highlighter.codeToTokens(code,{lang,theme:config.theme}).tokens);
  }catch{return plain(code);}
}
function entry(code:string,language?:string,owner?:HighlightCache){
  const lang=languageName(language),key=`${config.theme}\0${lang}\0${code}`;
  let item=owner?.get(key)??cache.get(key);
  if(!item){
    highlightStats.jobs++;
    item={promise:Promise.resolve([]),listeners:new Set()};
    const target=item;
    target.promise=compute(code,lang).then(lines=>{target.lines=lines;for(const listener of target.listeners)notify(listener);target.listeners.clear();return lines;});
    pendingJobs.add(target.promise);void target.promise.then(()=>pendingJobs.delete(target.promise),()=>pendingJobs.delete(target.promise));
    cache.set(key,item);if(cache.size>config.cacheEntries)cache.delete(cache.keys().next().value!);
  }else{cache.delete(key);cache.set(key,item);if(cache.size>config.cacheEntries)cache.delete(cache.keys().next().value!);}
  if(owner){owner.delete(key);owner.set(key,item);if(owner.size>2)owner.delete(owner.keys().next().value!);}
  return item;
}
export async function settleHighlights(){while(pendingJobs.size)await Promise.all([...pendingJobs]);}
export function highlight(code:string,lang?:string):Promise<string[]>{
  if(usePlain(code,lang))return Promise.resolve(plain(code));
  return entry(code,lang).promise;
}
export function highlightSync(code:string,lang?:string,onReady?:()=>void,owner?:HighlightCache):string[]{
  if(usePlain(code,lang))return plain(code);
  const item=entry(code,lang,owner);if(item.lines)return item.lines;
  if(onReady)item.listeners.add(onReady);
  return plain(code);
}
