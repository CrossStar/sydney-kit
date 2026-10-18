import { webKind } from '../catalog';
import { clean } from '../utils';
import type { Presenter } from './types';

const list = (many: unknown, one: unknown): string[] => Array.isArray(many) ? many.map(String) : one == null ? [] : [String(one)];

export const webPresenter: Presenter = ({ name, args, details: d, output }) => {
  const kind = webKind(name);
  if (!kind) return undefined;
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
  for (const source of (d.curatedQueries ?? []).flatMap((q: any) => Array.isArray(q.sources) ? q.sources : [])) {
    let host = source.url ?? '';
    try { host = new URL(host).hostname; } catch {}
    previews.push(`${source.title ?? ''} — ${host}`);
  }
  // Read the real returned text, including title/URL lists from fetch_content.
  // Do not fetch stored content or invoke another tool just for rendering.
  const meaningful = output.split('\n').map(s => s.trim()).filter(s => s && !/^[-*_]{3,}$/.test(s) && !/^#{1,3}\s*(Fetched URLs|Sources:|Query:|Page answers)/i.test(s) && !/^(Use get_search_content|Full search results are stored|\*\*Providers used)/.test(s));
  const sourceLines = meaningful.filter(s => /^Source:|^\d+\. |^- .*(?:https?:|chars\))/.test(s));
  if (!previews.length) previews.push(...(sourceLines.length ? sourceLines : meaningful));
  if (d.error) previews.unshift(String(d.error));
  return { short: kind, description: clean(description), stat, previews: [...new Set(previews.map(clean))], error: !!d.error || (kind === 'fetch' && d.successful === 0) };
};

export const webEnablePresenter: Presenter = ({ base, result, details: d }) => {
  if (base !== 'web_enable') return undefined;
  return { short: 'web', description: '启用网页工具', stat: result ? '已返回' : undefined, previews: [], error: !!d.error };
};
