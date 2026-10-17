import { highlightCode, getLanguageFromPath, renderDiff } from '@earendil-works/pi-coding-agent';
import { appearance, features } from '../../config';
import { enhancedDiff } from '../rendering/diff';
import type { ExtensionAPI, ToolRenderContext } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { compact as cfg } from '../../config';
import { extraPresentation, type ToolPresentation } from './presentations';
import { ToolRenderCache } from './render-cache';
import { ResultNames } from './result-names';
import { webPresentation } from './web';
import { clean, summary, textOutput, lineCount } from './utils';

export default function registerCompact(pi: ExtensionAPI) {
  const names=new ResultNames();
  for(const event of ['session_start','session_switch','session_tree','session_shutdown'] as const)pi.on(event,()=>names.clear());
  pi.registerToolRenderer((name, _next) => ({
    renderShell: 'self',
    renderCall(args, theme, context) {
      const state = context.state;
      state.args = args;
      state.argsSignature = JSON.stringify(args);
      const cache: ToolRenderCache = state.renderCache ??= new ToolRenderCache();
      state.context = context;
      state.diffReady ??= ()=>{state.diffRevision=(state.diffRevision??0)+1;cache.clearLayout();state.context?.invalidate?.();};
      return {
        invalidate() { cache.clearLayout(); },
        render(width: number) {
          if (width <= 0) return [];
          const ctx: ToolRenderContext = state.context;
          // Theme is a live proxy in Pi; its resolved colors identify the actual palette.
          const palette = theme.colors ?? theme;
          const knownName=names.describe(name,state.args);
          return cache.get('layout',[width,palette,cfg.showExpandedArgs,state.diffRevision,state.argsSignature,state.resultSignature,ctx.expanded,ctx.isPartial,ctx.isError,ctx.durationMs,ctx.cwd,knownName],()=>{
          const output: string = cache.get('text',[state.resultSignature],()=>textOutput(state.result));
          const web: ToolPresentation | undefined = cache.get('presentation',[state.argsSignature,state.resultSignature,ctx.cwd],()=>webPresentation(name, state.args, state.result, output) ?? extraPresentation(name, state.args, state.result, output, ctx.cwd));
          const [short, defaultDescription] = web ? [web.short, web.description] : summary(name, state.args, ctx.cwd);
          const description=knownName ?? defaultDescription;
          const failed = ctx.isError || web?.error || (typeof state.result?.details?.exitCode === 'number' && state.result.details.exitCode !== 0);
          const diff = typeof state.result?.details?.diff === 'string' ? state.result.details.diff : typeof state.result?.details?.patch === 'string' ? state.result.details.patch : '';
          const patch=state.result?.details?.sydneyDiffPatch ?? state.result?.details?.patch;
          const rich=features.diff && ['edit','write'].includes(name) && typeof patch==='string' ? enhancedDiff(patch,String(state.args.path??''),theme,ctx.expanded,state.diffReady,Math.max(0,width-visibleWidth(cfg.indent)),state.diffHighlights??=new Map(),state.diffModelCache??={}) : undefined;
          const changes = diff.split('\n').filter((l: string) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
          const edited = name === 'edit' && !!diff;
          let stat = state.result ? (output ? `${lineCount(output)} ${lineCount(output) === 1 ? 'line' : 'lines'}` : 'ok') : '…';
          if (name === 'write' && state.result && !failed && typeof args.content === 'string') stat = `${lineCount(args.content)} lines`;
          if (edited) stat = `+${changes.filter((l: string) => l[0] === '+').length} −${changes.filter((l: string) => l[0] === '-').length} ${ctx.expanded ? '▾' : '▸'}`;
          if (rich) stat=`+${rich.added} −${rich.removed} ${ctx.expanded?'▾':'▸'}`;
          if (web?.stat) stat = web.stat;
          if (ctx.isPartial) stat = web?.stat ?? 'running';
          if (failed) stat = typeof state.result?.details?.exitCode === 'number' ? `exit ${state.result.details.exitCode}` : 'failed';
          if (typeof ctx.durationMs === 'number') stat += ` · ${Math.round(ctx.durationMs / 100) / 10}s`;
          const running = !state.result || ctx.isPartial || web?.pending;
          const mutation = cfg.mutationTools.includes(name);
          const icon = failed ? cfg.icons.failure : web?.cancelled ? cfg.icons.cancelled : running ? cfg.icons.running : mutation ? cfg.icons.mutation : cfg.icons.success;
          const labelWidth=short.startsWith('bg ')?Math.max(cfg.nameWidth,visibleWidth(short)):cfg.nameWidth;
          const label = truncateToWidth(clean(short), labelWidth, cfg.ellipsis);
          const padded = label + ' '.repeat(Math.max(0, labelWidth - visibleWidth(label)));
          const prefix = theme.fg(failed ? 'error' : web?.cancelled ? 'warning' : running ? 'dim' : mutation ? 'warning' : 'success', icon) + ' ' + theme.fg(failed ? 'error' : mutation ? 'warning' : 'accent', padded) + ' ';
          const right = theme.fg('dim', stat);
          const room = width - visibleWidth(prefix) - visibleWidth(right) - 2;
          const left = prefix + truncateToWidth(description, Math.max(0, room), cfg.ellipsis);
          const header = room >= 0 ? left + ' '.repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right))) + right : truncateToWidth(prefix + description, width, cfg.ellipsis);
          const lines = [truncateToWidth(header, width, cfg.ellipsis)];
          const add = (text: string, color?: 'success' | 'error' | 'dim', wrap = false, highlighted = false) => {
            const prefix = theme.fg('dim', cfg.indent);
            const available = Math.max(1, width - visibleWidth(prefix));
            for (const raw of text.split('\n')) {
              const safe = highlighted ? raw : clean(raw);
              const chunks = wrap ? wrapTextWithAnsi(safe, available) : [truncateToWidth(safe, available, cfg.ellipsis)];
              for (const chunk of chunks) lines.push(truncateToWidth(prefix + (color ? theme.fg(color, chunk) : chunk), width, cfg.ellipsis));
            }
          };
          if (ctx.expanded) {
            const hasDiff=!failed && (!!rich || !!diff);
            if (!failed && rich) { for(const line of rich.lines) add(line,undefined,true,true); }
            else if (!failed && diff) add(cache.get('diff',[diff,palette],()=>renderDiff(diff)), undefined, true, true);
            if (output && !(hasDiff && ['edit','write'].includes(name))) {
              const display = name === 'write' && !rich && !failed && typeof state.args.content === 'string' ? state.args.content : output;
              const code = !failed && ['read','write'].includes(name) && display.length <= appearance.maxHighlightChars;
              const lang=getLanguageFromPath(String(state.args.path ?? ''));
              const body = code ? cache.get('highlight',[display,lang,palette],()=>highlightCode(display,lang).join('\n')) : display;
              add(body, failed ? 'error' : undefined, true, code);
            }
            const nontext = (state.result?.content ?? []).filter((c: any) => c.type !== 'text');
            if (nontext.length) add(nontext.map((c: any) => `[${c.type}]`).join('\n'), 'dim');
            if (cfg.showExpandedArgs) {
              add('参数', 'dim');
              add(cache.get('args',[state.argsSignature],()=>JSON.stringify(state.args, null, 2)), 'dim', true);
            }
          } else if (failed) {
            for (const line of (web?.errorPreview ?? (web?.previews.length ? web.previews : output.split('\n').filter(Boolean))).slice(0, cfg.errorLines)) add(line, 'error');
          } else if (rich && !failed) {
            for(const line of rich.lines) add(line,undefined,false,true);
          } else if (web && state.result) {
            const limit=web.limit ?? cfg.webPreviewLines;
            for (const line of web.previews.slice(0, limit)) add(line);
            if (web.previews.length > limit) add(`… 还有 ${web.previews.length - limit} 条，展开查看`, 'dim');
          } else if (edited) {
            for (const line of changes.slice(0, cfg.editPreviewLines)) add(line, line[0] === '+' ? 'success' : 'error');
            if (changes.length > cfg.editPreviewLines) add(`… 还有 ${changes.length - cfg.editPreviewLines} 行`, 'dim');
          }
          return lines;
          }).slice(); // Host containers may modify their returned array; protect the cache.
        },
      };
    },
    renderResult(result, options, _theme, context) {
      if(!options.isPartial)names.remember(name,context.state.args ?? context.args ?? {},result);
      context.state.result = result;
      // Snapshot at update time, not on scroll. Also catches in-place streaming mutations.
      context.state.resultSignature = JSON.stringify(result);
      context.state.context = { ...context, expanded: options.expanded };
      return { render: () => [], invalidate() {} };
    },
  }));
}
