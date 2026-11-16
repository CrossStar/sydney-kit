import { getLanguageFromPath, highlightCode } from '@earendil-works/pi-coding-agent';
import { visibleWidth } from '@earendil-works/pi-tui';
import { relative, isAbsolute } from 'node:path';
import { compact as cfg } from '../../config';
import { headerLine, lineWriter } from './layout';
import { clean, lineCount } from './utils';

/** Write-specific presentation; unknown snapshots must never imply an unchanged file. */
export function renderWrite(theme: any, width: number, args: any, result: any, ctx: any, output: string, rich: any): string[] {
  const metadata = result?.details?.sydneyWrite;
  const unverified = metadata?.outcome === 'unverified';
  const failed = !!(ctx.isError || result?.isError);
  const pending = !result || ctx.isPartial;
  const patch = result?.details?.sydneyDiffPatch;
  const created = result?.details?.sydneyNewFile === true;
  const unchanged = !created && (metadata?.unchanged === true || patch === '');
  const content = typeof args.content === 'string' ? args.content : '';
  const count = content ? lineCount(content) : 0;
  let stat = pending ? (ctx.executionStarted ? 'writing' : ctx.argsComplete ? 'queued' : `drafting · ${count} lines`) : failed ? (/EACCES|permission denied/i.test(output) ? 'permission denied' : 'failed') : created ? (content ? `created · ${count} lines` : 'created · empty') : unchanged ? 'unchanged' : rich ? `updated · +${rich.added} −${rich.removed}` : 'written';
  if (unverified) stat = 'unverified';
  else if (!pending && !failed && metadata?.eofOnly) stat = 'updated · newline at EOF';
  if (!pending && !unchanged && !metadata?.eofOnly && !(created && !content) && (content || output || rich)) stat += ctx.expanded ? ' ▾' : ' ▸';
  const path = String(metadata?.path ?? args.path ?? '');
  const description = clean(metadata?.displayPath ?? (!metadata?.host && ctx.cwd && isAbsolute(path) ? relative(ctx.cwd, path) || path : path));
  const host = metadata?.host ? clean(String(metadata.host)) + ':' : '';
  const status = { stat, failed, running: pending, cancelled: false, mutation: !unchanged };
  const narrow = width < visibleWidth(host + description) + visibleWidth(stat) + 16;
  const displayPath = host + (narrow && description.includes('/') ? '…/' + description.split('/').pop() : description);
  const lines = [headerLine(theme, width, 'write', displayPath, { ...status, stat: narrow ? '' : stat })];
  if (unverified) lines[0] = lines[0].replace(theme.fg('error', cfg.icons.failure), theme.fg('warning', '!'));
  const add = lineWriter(lines, theme, width);
  if (narrow) add(stat, 'dim');
  if (!pending && !failed && created && !content) return lines;
  if (ctx.expanded) {
    add(host + path, 'dim', true);
    if (cfg.showExpandedArgs) {
      const { content: _content, ...other } = args;
      add(JSON.stringify({ ...other, contentPreview: 'See bounded content preview below' }, null, 2), 'dim', true);
    }
  }
  if (unverified) add('Read the file to confirm the write outcome', 'dim');
  if (failed) { for (const line of output.split('\n').slice(0, ctx.expanded ? 200 : cfg.errorLines)) add(line, 'error'); return lines; }
  if (unchanged && !pending) return lines;
  if (!pending && metadata?.eofOnly) { add(content.endsWith('\n') ? 'Added final newline' : 'Removed final newline', 'dim'); return lines; }
  if (!pending && !created && rich) { for (const line of rich.lines) add(line, undefined, false, true); return lines; }
  if (pending) add(ctx.executionStarted ? 'Writing file' : ctx.argsComplete ? 'Waiting to execute' : 'Not written yet', 'dim');
  else if (!created) add(`Diff unavailable: ${metadata?.reason ?? 'previous content unavailable'}`, 'dim');
  const all = content.split('\n');
  if (content.endsWith('\n')) all.pop();
  const limit = Math.max(1, ctx.expanded && !pending ? 200 : cfg.editPreviewLines);
  const start = pending ? Math.max(0, all.length - limit) : 0;
  const preview = all.slice(start, start + limit).map(line => clean(line).slice(0, 4000));
  const highlighted = highlightCode(preview.join('\n'), getLanguageFromPath(path));
  for (let i = 0; i < highlighted.length; i++) if (preview.length) add(`${start + i + 1}  ${highlighted[i]}`, undefined, false, true);
  if (all.length > limit) add(`… ${all.length - limit} ${pending ? 'earlier' : 'more'} lines`, 'dim');
  return lines;
}
