import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.argv[2];
if(!root) throw Error('Usage: node integrations/background/install.mjs <pi-background-tasks root> [--record]');
const manifestPath=new URL('./manifest.json',import.meta.url);
const rules=[
['src/extension.ts',[
['export default function backgroundTasksExtension(pi: ExtensionAPI): void {','export default function backgroundTasksExtension(pi: ExtensionAPI): void {\n  pi.events.on("sydney-kit:bg-hook:v1", (request: any) => { request.available = true; });'],
['new BackgroundTaskRegistry({','new BackgroundTaskRegistry({\n    resolveExecution: () => {\n      const request: any = {};\n      pi.events.emit("sydney-kit:bg-execution:v1", request);\n      if (request.error) throw request.error;\n      return request.provider;\n    },']]],
['src/core/registry.ts',[
['export interface BackgroundTaskRegistryOptions {','export interface BackgroundTaskRegistryOptions {\n  resolveExecution?: () => { spawn(command: string, isAgent: boolean): BackgroundTaskChildProcess } | undefined;'],
['  constructor(options: BackgroundTaskRegistryOptions) {','  private readonly resolveExecution: BackgroundTaskRegistryOptions["resolveExecution"];\n\n  constructor(options: BackgroundTaskRegistryOptions) {\n    this.resolveExecution = options.resolveExecution;'],
['    const baseInvocation = shellInvocation(normalizedCommand, this.platform, this.env);','    const execution = this.resolveExecution?.();\n    if (execution && isAgent) throw new Error("Remote bg_run requires isAgent:false");\n    const baseInvocation = execution ? { shell: "", args: [], dialect: "posix" as const, windowsVerbatimArguments: false } : shellInvocation(normalizedCommand, this.platform, this.env);'],
['      const child = this.spawn(invocation.shell, invocation.args, {','      const child = execution ? execution.spawn(normalizedCommand, isAgent) : this.spawn(invocation.shell, invocation.args, {'],
['      task.child = child;','      if (execution) {\n        task.managedCancel = () => { child.kill("SIGTERM"); };\n        task.managedStopWaitMs = 10000;\n      }\n      task.child = child;']
]]];
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
if(process.argv.includes('--record')) {
 const manifest={version:JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,files:{}};
 for(const [file] of rules) manifest.files[file]=hash(fs.readFileSync(path.join(root,file)));
 fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
} else {
 const manifest=JSON.parse(fs.readFileSync(manifestPath));
 if(JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version!==manifest.version) throw Error('Package version mismatch');
 const changes=[];
 for(const [file,replacements] of rules){
  const target=path.join(root,file), original=fs.readFileSync(target,'utf8');
  const installed=original.includes('sydney-kit:bg-execution:v1') || original.includes('private readonly resolveExecution:');
  const source=installed ? fs.readFileSync(target+'.sydney-original','utf8') : original;
  if(hash(source)!==manifest.files[file]) throw Error('Source hash mismatch: '+file);
  let next=source;
  for(const [before,after] of replacements){if(next.split(before).length!==2 && before !== '      task.child = child;') throw Error('Nonunique anchor: '+before);next=next.replace(before,after);}
  if(installed) { if(original!==next) throw Error('Installed patch differs from maintained patch: '+file); console.log('Already patched and verified:',file); continue; }
  changes.push({target,original,next});
 }
 for(const {target,original,next} of changes){fs.writeFileSync(target+'.sydney-original',original,{flag:'wx'});fs.writeFileSync(target,next);console.log('Patched:',target);}
}
