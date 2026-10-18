import { getLanguageFromPath, highlightCode, renderDiff } from '@earendil-works/pi-coding-agent';
import { appearance, compact as cfg } from '../../config';
import type { AddLine } from './layout';
import type { ToolPresentation } from './presenters';
import type { ToolRenderCache } from './render-cache';

export interface BodyInput {
  name: string;
  args: any;
  argsSignature: string;
  result: any;
  output: string;
  failed: boolean;
  presentation?: ToolPresentation;
  /** Enhanced diff lines, already highlighted. */
  rich?: { lines: string[] };
  /** Unified diff text provided by the host (edit). */
  hostDiff: string;
  hostChanges: string[];
  cache: ToolRenderCache;
  palette: unknown;
}

const fileTool = (name: string) => name === 'edit' || name === 'write';

export function expandedBody(add: AddLine, b: BodyInput) {
  const hasDiff = !b.failed && (!!b.rich || !!b.hostDiff);
  if (!b.failed && b.rich) for (const line of b.rich.lines) add(line, undefined, true, true);
  else if (!b.failed && b.hostDiff) add(b.cache.get('diff', [b.hostDiff, b.palette], () => renderDiff(b.hostDiff)), undefined, true, true);
  if (b.output && !(hasDiff && fileTool(b.name))) {
    // Without a diff, a successful write shows the content it wrote rather than the tool's status text.
    const display = b.name === 'write' && !b.rich && !b.failed && typeof b.args.content === 'string' ? b.args.content : b.output;
    const code = !b.failed && (b.name === 'read' || b.name === 'write') && display.length <= appearance.maxHighlightChars;
    const lang = getLanguageFromPath(String(b.args.path ?? ''));
    const body = code ? b.cache.get('highlight', [display, lang, b.palette], () => highlightCode(display, lang).join('\n')) : display;
    add(body, b.failed ? 'error' : undefined, true, code);
  }
  const nontext = (b.result?.content ?? []).filter((c: any) => c.type !== 'text');
  if (nontext.length) add(nontext.map((c: any) => `[${c.type}]`).join('\n'), 'dim');
  if (cfg.showExpandedArgs) {
    add('参数', 'dim');
    add(b.cache.get('args', [b.argsSignature], () => JSON.stringify(b.args, null, 2)), 'dim', true);
  }
}

export function collapsedBody(add: AddLine, b: BodyInput) {
  const p = b.presentation;
  if (b.failed) {
    for (const line of (p?.errorPreview ?? (p?.previews.length ? p.previews : b.output.split('\n').filter(Boolean))).slice(0, cfg.errorLines)) add(line, 'error');
  } else if (b.rich) {
    for (const line of b.rich.lines) add(line, undefined, false, true);
  } else if (p && b.result) {
    const limit = p.limit ?? cfg.webPreviewLines;
    for (const line of p.previews.slice(0, limit)) add(line);
    if (p.previews.length > limit) add(`… 还有 ${p.previews.length - limit} 条，展开查看`, 'dim');
  } else if (b.name === 'edit' && b.hostDiff) {
    for (const line of b.hostChanges.slice(0, cfg.editPreviewLines)) add(line, line[0] === '+' ? 'success' : 'error');
    if (b.hostChanges.length > cfg.editPreviewLines) add(`… 还有 ${b.hostChanges.length - cfg.editPreviewLines} 行`, 'dim');
  }
}
