/** Tool-name knowledge shared by presenters and result-name tracking. Names may carry MCP/namespace prefixes. */
export const toolBase = (name: string) => name.replace(/-/g, '_').split(/\.|__/).pop()!;

export const TASK_LAUNCH_TOOLS = ['bg_run', 'bg_delegate', 'bg_run_pi_attested', 'fusion_reason', 'fusion_investigate', 'fusion_research', 'fusion_validate'];
/** Display labels for background-task and Fusion tools; the `bg` prefix stays visible. */
export const TASK_LABELS: Record<string, string> = {
  bg_run: 'bg run', bg_delegate: 'bg delegate', bg_run_pi_attested: 'bg attest', bg_status: 'bg status', bg_logs: 'bg logs', bg_result: 'bg result', bg_kill: 'bg kill',
  fusion_reason: 'reason', fusion_investigate: 'inspect', fusion_research: 'research', fusion_validate: 'review',
};
/** Web tools whose results carry a stored-response id that get_search_content can later refer to. */
export const WEB_RESULT_TOOLS = ['web_search', 'fetch_content', 'source_check'];

export type WebKind = 'search' | 'fetch' | 'content' | 'sources';
export function webKind(name: string): WebKind | undefined {
  const n = name.replace(/-/g, '_');
  if (/(?:^|[_.])web_search$/.test(n)) return 'search';
  if (/(?:^|[_.])fetch(?:_content)?$/.test(n)) return 'fetch';
  if (/(?:^|[_.])get_search_content$/.test(n)) return 'content';
  if (/(?:^|[_.])source_check$/.test(n)) return 'sources';
  return undefined;
}
