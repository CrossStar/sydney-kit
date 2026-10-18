import type { ExtensionAPI, ToolRenderContext } from '@earendil-works/pi-coding-agent';
import { visibleWidth } from '@earendil-works/pi-tui';
import { compact as cfg, features } from '../../config';
import { enhancedDiff } from '../rendering/diff/index';
import { collapsedBody, expandedBody } from './body';
import { headerLine, lineWriter } from './layout';
import { present } from './presenters';
import { ToolRenderCache } from './render-cache';
import { ResultNames } from './result-names';
import { toolStatus } from './status';
import { summary, textOutput } from './utils';

export default function registerCompact(pi: ExtensionAPI) {
  const names = new ResultNames();
  for (const event of ['session_start', 'session_switch', 'session_tree', 'session_shutdown'] as const) pi.on(event, () => names.clear());
  pi.registerToolRenderer((name, _next) => ({
    renderShell: 'self',
    renderCall(args, theme, context) {
      const state = context.state;
      state.args = args;
      state.argsSignature = JSON.stringify(args);
      const cache: ToolRenderCache = state.renderCache ??= new ToolRenderCache();
      state.context = context;
      state.diffReady ??= () => { state.diffRevision = (state.diffRevision ?? 0) + 1; cache.clearLayout(); state.context?.invalidate?.(); };
      return {
        invalidate() { cache.clearLayout(); },
        render(width: number) {
          if (width <= 0) return [];
          const ctx: ToolRenderContext = state.context;
          // Theme is a live proxy in Pi; its resolved colors identify the actual palette.
          const palette = theme.colors ?? theme;
          const knownName = names.describe(name, state.args);
          const layoutKey = [width, palette, cfg.showExpandedArgs, state.diffRevision, state.argsSignature, state.resultSignature, ctx.expanded, ctx.isPartial, ctx.isError, ctx.durationMs, ctx.cwd, knownName];
          return cache.get('layout', layoutKey, () => {
            const { args, result } = state;
            const output: string = cache.get('text', [state.resultSignature], () => textOutput(result));
            const presentation = cache.get('presentation', [state.argsSignature, state.resultSignature, ctx.cwd], () => present(name, args, result, output, ctx.cwd));
            const [short, defaultDescription] = presentation ? [presentation.short, presentation.description] : summary(name, args, ctx.cwd);
            const details = result?.details;
            const failed = !!(ctx.isError || presentation?.error || (typeof details?.exitCode === 'number' && details.exitCode !== 0));

            const hostDiff: string = typeof details?.diff === 'string' ? details.diff : typeof details?.patch === 'string' ? details.patch : '';
            const hostChanges = hostDiff.split('\n').filter(l => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
            const patch = details?.sydneyDiffPatch ?? details?.patch;
            const rich = features.diff && (name === 'edit' || name === 'write') && typeof patch === 'string'
              ? enhancedDiff(patch, String(args.path ?? ''), theme, {
                expanded: ctx.expanded, previewLines: cfg.editPreviewLines, onReady: state.diffReady,
                width: Math.max(0, width - visibleWidth(cfg.indent)),
                highlightCache: state.diffHighlights ??= new Map(), modelCache: state.diffModelCache ??= {},
              })
              : undefined;
            const changes = rich ?? (name === 'edit' && hostDiff
              ? { added: hostChanges.filter(l => l[0] === '+').length, removed: hostChanges.filter(l => l[0] === '-').length }
              : undefined);

            const status = toolStatus({ name, args, result, output, presentation, changes, failed, expanded: ctx.expanded, isPartial: ctx.isPartial, durationMs: ctx.durationMs });
            const lines = [headerLine(theme, width, short, knownName ?? defaultDescription, status)];
            const body = { name, args, argsSignature: state.argsSignature, result, output, failed, presentation, rich, hostDiff, hostChanges, cache, palette };
            (ctx.expanded ? expandedBody : collapsedBody)(lineWriter(lines, theme, width), body);
            return lines;
          }).slice(); // Host containers may modify their returned array; protect the cache.
        },
      };
    },
    renderResult(result, options, _theme, context) {
      if (!options.isPartial) names.remember(name, context.state.args ?? context.args ?? {}, result);
      context.state.result = result;
      // Snapshot at update time, not on scroll. Also catches in-place streaming mutations.
      context.state.resultSignature = JSON.stringify(result);
      context.state.context = { ...context, expanded: options.expanded };
      return { render: () => [], invalidate() {} };
    },
  }));
}
