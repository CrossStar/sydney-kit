import { clean } from './utils';

// Only recognize named web tools, including common MCP namespace prefixes.
export function webKind(name: string) {
  const n = name.replace(/-/g, '_');
  if (/(?:^|[_.])web_search$/.test(n)) return 'search';
  if (/(?:^|[_.])fetch(?:_content)?$/.test(n)) return 'fetch';
  if (/(?:^|[_.])get_search_content$/.test(n)) return 'content';
  if (/(?:^|[_.])source_check$/.test(n)) return 'sources';
  return undefined;
}
export function webPresentation(name: string, args: any, result: any, output: string) {
  const kind = webKind(name);
  if (!kind) return undefined;
  const d = result?.details ?? {};
  const list = (a: unknown, b: unknown): string[] => Array.isArray(a) ? a.map(String) : b == null ? [] : [String(b)];
  const queries = list(args.queries, args.query);
  const urls = list(args.urls, args.url);
  let description = kind === 'search' ? queries.join(' · ') : kind === 'sources' ? String(args.claim ?? queries.join(' · ')) : urls.join(' · ');
  if (kind === 'content') description = String(args.findText ?? args.query ?? args.url ?? args.responseId ?? '') + (args.queryIndex != null ? ` · query ${args.queryIndex}` : args.urlIndex != null ? ` · page ${args.urlIndex}` : '');
  let stat: string | undefined;
  if (kind === 'search' && typeof d.totalResults === 'number') stat = `${d.totalResults} results`;
  if (kind === 'fetch' && typeof d.successful === 'number') stat = `${d.successful}/${d.urlCount ?? urls.length} pages`;
  if (kind === 'sources' && typeof d.sourceCount === 'number') stat = `${d.sourceCount} sources`;
  if (kind === 'content' && typeof d.returnedChars === 'number') stat = `${d.returnedChars} chars`;
  if (d.phase) stat = String(d.phase);
  const previews: string[] = [];
  const sources = (d.curatedQueries ?? []).flatMap((q: any)=>Array.isArray(q.sources)?q.sources:[]);
  for (const source of sources) {
    let host=source.url ?? '';try{host=new URL(host).hostname;}catch{}
    previews.push(`${source.title ?? ''} — ${host}`);
  }
  // Read the real returned text, including title/URL lists from fetch_content.
  // Do not fetch stored content or invoke another tool just for rendering.
  const meaningful = output.split('\n').map(s=>s.trim()).filter(s=>s && !/^[-*_]{3,}$/.test(s) && !/^#{1,3}\s*(Fetched URLs|Sources:|Query:|Page answers)/i.test(s) && !/^(Use get_search_content|Full search results are stored|\*\*Providers used)/.test(s));
  const sourceLines = meaningful.filter(s=>/^Source:|^\d+\. |^- .*(?:https?:|chars\))/.test(s));
  if (!previews.length) previews.push(...(sourceLines.length ? sourceLines : meaningful));
  if (d.error) previews.unshift(String(d.error));
  return { short: kind === 'content' ? 'content' : kind, description: clean(description), stat, previews: [...new Set(previews.map(clean))], error: !!d.error || (kind === 'fetch' && d.successful === 0) };
}
