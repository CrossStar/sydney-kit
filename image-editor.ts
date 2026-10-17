import { CustomEditor, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { matchesKey } from '@earendil-works/pi-tui';
/** Decorates the public editor instance without changing prototypes or host files. */
export function installImageEditor(ctx:ExtensionContext,isImageToken:(token:string)=>boolean){
  const previous=ctx.ui.getEditorComponent();
  const factory=(tui:any,theme:any,keys:any)=>{
    const editor:any=previous?previous(tui,theme,keys):new CustomEditor(tui,theme,keys);
    const input=editor.handleInput.bind(editor),bound=new Map<PropertyKey,unknown>();
    const handler=(data:string)=>{
      if(matchesKey(data,'backspace')||matchesKey(data,'shift+backspace')){
        const cursor=editor.getCursor?.(),line=cursor?editor.getLines()[cursor.line]:'';
        if(cursor){
          for(const match of line.matchAll(/\[图片 \d+(?: · \d+×\d+)?\]/g)){
            const start=match.index!,end=start+match[0].length;
            if(!isImageToken(match[0])||cursor.col<=start||cursor.col>end+1||(cursor.col===end+1&&line[end]!==' '))continue;
            // Route through native editing so other paste markers, cursor state and undo history survive.
            for(let n=cursor.col;n<end;n++)input('\x1b[C');
            const count=[...line.slice(start,Math.max(end,cursor.col))].length;
            for(let n=0;n<count;n++)input('\x7f');
            tui.requestRender();return;
          }
        }
      }
      input(data);
    };
    return new Proxy(editor,{get(target,key){
      if(key==='handleInput')return handler;
      const value=Reflect.get(target,key,target);
      if(typeof value!=='function')return value;
      if(!bound.has(key))bound.set(key,value.bind(target));return bound.get(key);
    },set(target,key,value){bound.delete(key);return Reflect.set(target,key,value,target);}});
  };
  ctx.ui.setEditorComponent(factory);
  return ()=>{if(ctx.ui.getEditorComponent()===factory)ctx.ui.setEditorComponent(previous);};
}
