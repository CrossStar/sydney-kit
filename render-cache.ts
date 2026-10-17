// One retained value per slot; no growing cache of widths or old stream chunks.
export class ToolRenderCache {
  private entries = new Map<string,{key:unknown[];value:any}>();
  get<T>(slot:string,key:unknown[],build:()=>T):T {
    const old=this.entries.get(slot);
    if(old && old.key.length===key.length && old.key.every((v,i)=>Object.is(v,key[i])))return old.value;
    const value=build();this.entries.set(slot,{key,value});return value;
  }
  clearLayout(){this.entries.delete('layout');}
}
