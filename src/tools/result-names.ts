import { compact as cfg } from '../../config';
import { TASK_LAUNCH_TOOLS, WEB_RESULT_TOOLS, toolBase } from './catalog';
import { clean, textOutput, withJsonOutput } from './utils';

// Presentation-only, bounded, session-local names. No polling or filesystem reads.
export class ResultNames {
  private tasks = new Map<string, string>();
  private pages = new Map<string, string>();
  clear() { this.tasks.clear(); this.pages.clear(); }
  private put(map: Map<string, string>, id: unknown, label: unknown) {
    if (typeof id !== 'string' || !id || typeof label !== 'string' || !label) return;
    map.set(id, clean(label));
    if (map.size > cfg.nameCacheEntries) map.delete(map.keys().next().value!);
  }
  remember(name: string, args: any, result: any) {
    const base = toolBase(name), text = textOutput(result);
    const d = withJsonOutput(result?.details ?? {}, text);
    if (TASK_LAUNCH_TOOLS.includes(base)) {
      const id = d.taskId ?? d.task_id ?? text.match(/^Started background task .+ \(([^()]+)\)/m)?.[1];
      this.put(this.tasks, id, args.name ?? args.objective);
    }
    if (base === 'bg_status' && Array.isArray(d.tasks)) for (const task of d.tasks) this.put(this.tasks, task.taskId ?? task.id, task.name);
    if (WEB_RESULT_TOOLS.includes(base)) {
      const id = d.responseId ?? d.searchId ?? d.fetchId ?? text.match(/responseId[\s:=]+["']([^"']+)["']/)?.[1];
      const label = args.query ?? args.queries?.join(' · ') ?? args.url ?? args.urls?.join(' · ') ?? args.claim;
      this.put(this.pages, id, label);
    }
  }
  describe(name: string, args: any): string | undefined {
    const base = toolBase(name);
    if (base.startsWith('bg_') && typeof args.taskId === 'string') {
      let label = this.tasks.get(args.taskId);
      if (!label) {
        const matches = [...this.tasks].filter(([id]) => id.startsWith(args.taskId));
        if (matches.length === 1) label = matches[0][1];
      }
      if (label) return `${label} · ${args.taskId.slice(0, 8)}`;
    }
    if (base === 'get_search_content' && !args.url && !args.query && !args.findText) {
      const label = this.pages.get(args.responseId);
      if (label) return `${label}${args.queryIndex != null ? ` · query ${args.queryIndex}` : args.urlIndex != null ? ` · page ${args.urlIndex}` : ''}`;
    }
  }
}
