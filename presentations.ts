import { compact as cfg } from './config';
import { clean, shortPath, summary } from './utils';
export interface ToolPresentation { short: string; description: string; stat?: string; previews: string[]; error?: boolean; cancelled?: boolean; pending?: boolean; limit?: number; errorPreview?: string[] }
export const toolBase = (name: string) => name.replace(/-/g,'_').split(/\.|__/).pop()!;
const lines = (text: string) => text.split(/\r?\n/).filter(s=>s.trim()).map(clean);
export function extraPresentation(name: string, args: any, result: any, output: string, cwd: string): ToolPresentation | undefined {
  const base=toolBase(name), d=result?.details ?? {};
  const out=lines(output);
  if(base==='read') {
    const image=(result?.content ?? []).some((c:any)=>c.type==='image');
    const range=[args.offset != null?`从第 ${args.offset} 行`:null,args.limit != null?`最多 ${args.limit} 行`:null].filter(Boolean).join(' · ');
    return {short:'read',description:`${shortPath(String(args.path ?? ''),cwd)}${range?' · '+range:''}`,stat:image?'image':undefined,previews:[],error:!!d.error};
  }
  if(base==='bash' || base==='powershell') {
    const [short,description]=summary(name,args,cwd);
    const exitCode=typeof d.exitCode==='number'?d.exitCode:undefined;
    const stderr=typeof d.stderr==='string'?lines(d.stderr):undefined;
    return {short,description,stat:exitCode!==undefined?`exit ${exitCode}`:undefined,previews:[],error:!!d.error || (exitCode!==undefined && exitCode!==0),errorPreview:stderr?.length?stderr:out.slice(-cfg.errorLines)};
  }
  if(base==='web_enable') return {short:'web',description:'启用网页工具',stat:result?'已返回':undefined,previews:[],error:!!d.error};
  if(base==='parallel') {
    const calls=Array.isArray(args.tool_uses)?args.tool_uses:[];
    return {short:'parallel',description:`并行调用 ${calls.length} 项`,previews:calls.map((c:any)=>String(c.recipient_name ?? c.name ?? '工具')),error:!!d.error};
  }
  if (['grep','find','ls'].includes(base)) {
    const path=shortPath(String(args.path ?? '.'),cwd);
    const description=base==='ls'?path:`${args.pattern ?? args.query ?? ''}  ${path}${args.glob ? ` · ${args.glob}` : ''}`;
    const previews=out.map(line=> {
      if(base!=='grep')return shortPath(line,cwd);
      const match=line.match(/^(.*?):(\d+)(?::|\s)(.*)$/);
      return match?`${shortPath(match[1],cwd)}:${match[2]}  ${match[3].trimStart()}`:line;
    });
    const count=d.matchCount ?? d.totalMatches;
    return {short:base,description,stat:typeof count==='number'?`${count} matches`:undefined,previews,error:!!d.error,limit:cfg.filePreviewLines};
  }
  if(base==='ask_user_question') {
    const questions=Array.isArray(args.questions)?args.questions:[];
    const answer=d.answers;
    const previews=answer && typeof answer==='object' ? Object.entries(answer).map(([q,a])=>`${q} → ${typeof a==='string'?a:JSON.stringify(a)}`) : out;
    return {short:'ask',description:questions.map((q:any)=>q.header ?? q.question).join(' · '),stat:d.cancelled?'已取消':result?'已返回':'等待回答',previews,error:!!d.error,cancelled:!!d.cancelled};
  }
  const aliases:Record<string,string>={bg_run:'bg run',bg_delegate:'bg delegate',bg_run_pi_attested:'bg attest',bg_status:'bg status',bg_logs:'bg logs',bg_result:'bg result',bg_kill:'bg kill',fusion_reason:'reason',fusion_investigate:'inspect',fusion_research:'research',fusion_validate:'review'};
  if (!aliases[base]) return undefined;
  let data=d;
  try {const parsed=JSON.parse(output);if(parsed && typeof parsed==='object'&&!Array.isArray(parsed))data={...parsed,...d};}catch{}
  const starting=['bg_run','bg_delegate','bg_run_pi_attested'].includes(base)||base.startsWith('fusion_');
  const rawStatus=data.status ?? data.state ?? output.match(/^Status:\s*(\w+)/im)?.[1];
  const status=typeof rawStatus==='string'?rawStatus.toLowerCase():undefined;
  const pending=['running','queued','pending','not_ready','not-ready','started'].includes(status ?? '');
  const cancelled=['killed','cancelled','canceled','stopped'].includes(status ?? '');
  const error=!!data.error || status==='failed';
  // A successful launch receipt is not task completion. Avoid inferring job status from arbitrary log text.
  const stat=status ?? (starting && result && !error?'已提交':undefined);
  const description=String(args.name ?? args.objective ?? args.taskId ?? args.description ?? (starting?'后台任务':'后台任务列表'));
  const taskRows=Array.isArray(data.tasks)?data.tasks.map((task:any)=>`${task.name ?? task.id ?? task.taskId ?? '任务'} · ${task.status ?? '未知'}${typeof task.durationMs==='number'?` · ${Math.round(task.durationMs/100)/10}s`:''}`):undefined;
  const previews=base==='bg_logs'?out.slice(-cfg.logPreviewLines):taskRows ?? out;
  return {short:aliases[base],description:clean(description),stat:base==='bg_logs'&&result?`末尾 ${previews.length} 行`:stat,previews,error,cancelled,pending:pending || (starting && !!result && !error && !cancelled && !['completed','done'].includes(status ?? '')),limit:base==='bg_logs'?cfg.logPreviewLines:cfg.taskPreviewLines};
}
