import { posix } from 'node:path';
import { Type } from 'typebox';
import { createChildTools } from './child-binding';
import { createReadToolDefinition, createWriteToolDefinition, createEditToolDefinition, createBashToolDefinition } from '@earendil-works/pi-coding-agent';
const q = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;
/** All callbacks are bound to one owned client; no callback consults active route state. */
export async function pinnedChildTools(toolNames: readonly string[], cwd: string, backend: {
  file(path: string): Promise<any>;
  exec(command: string, signal?: AbortSignal, timeout?: number): Promise<{output: string; exitCode: number}>;
}) {
  const factories: Record<string, () => any> = {};
  for (const [name,make] of [['read',createReadToolDefinition],['write',createWriteToolDefinition],['edit',createEditToolDefinition]] as const) {
    factories[name] = () => ({...make(cwd), execute: async (id: string, args: any, signal: AbortSignal, update: any) => {
      const file = await backend.file(args.path);
      const detect = file.read.detectImageMimeType;
      file.read.detectImageMimeType = async (path: string) => { const mime = await detect(path); return mime?.startsWith('image/') ? mime : undefined; };
      const operations = name === 'read' ? file.read : name === 'write' ? file.write : {...file.read,...file.write};
      return make(cwd,{operations} as any).execute(id,args,signal,update);
    }});
  }
  factories.bash=()=>createBashToolDefinition(cwd,{operations:{exec:async(command,_cwd,{onData,signal,timeout})=>{
    const result=await backend.exec(command,signal,timeout);onData(Buffer.from(result.output));return {exitCode:result.exitCode};
  }}});
  for(const name of ['grep','find','ls']) factories[name]=()=>({
    name,label:name,description:`Search or list files in the pinned remote workspace (${name}).`,
    parameters:Type.Object({path:Type.Optional(Type.String()),pattern:Type.Optional(Type.String()),limit:Type.Optional(Type.Number()),glob:Type.Optional(Type.String()),ignoreCase:Type.Optional(Type.Boolean()),literal:Type.Optional(Type.Boolean()),context:Type.Optional(Type.Number())}),
    execute:async(_id: string,args: any,signal: AbortSignal)=>{
      const target=q(posix.resolve(cwd,args.path ?? '.'));
      const limit=Math.min(1000,Math.max(1,Math.floor(args.limit ?? 100)));
      let command: string;
      if(name==='grep') command=`grep -rn ${args.ignoreCase?'-i':''} ${args.literal?'-F':'-E'} ${args.glob?`--include=${q(args.glob)}`:''} -- ${q(args.pattern??'')} ${target}`;
      else if(name==='find') command=`find ${target} -type f -name ${q(args.pattern??'*')}`;
      else command=`ls -la -- ${target}`;
      const result=await backend.exec(`${command} | head -n ${limit} | head -c 50000`,signal,30);
      return {content:[{type:'text',text:result.output}],details:{remote:true}};
    },
  });
  return createChildTools(toolNames,factories);
}
