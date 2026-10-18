import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { highlightSync } from './highlight';
import { codeblocks as config, features } from '../../config';
import { hostGlobals, type RenderCodeBlock } from '../host/globals';
import { PI_HOST_VERSION } from '../host/version.mjs';

/** Streaming responses contain unterminated fences; those are drawn plain until the closing fence arrives. */
export function isClosed(raw: string): boolean {
  const first = raw.split('\n')[0].match(/^\s*(`{3,}|~{3,})/);
  if (!first) return true;
  const fence = first[1];
  return raw.split('\n').slice(1).some(line => new RegExp(`^\\s{0,3}${fence[0]}{${fence.length},}\\s*$`).test(line));
}

export function renderBlock(code: string, lang: string | undefined, width: number, theme: any, closed: boolean, ready?: () => void): string[] {
  if (width <= 0) return [];
  const indent = config.indent, prefix = indent + config.prefix;
  const available = Math.max(1, width - visibleWidth(prefix));
  const label = lang?.trim().split(/\s/)[0] || 'code';
  const title = indent + label + ' ';
  const lines = [theme.fg('dim', truncateToWidth(title + '─'.repeat(Math.max(0, width - visibleWidth(title))), width))];
  const source = closed ? highlightSync(code, lang, ready) : code.split('\n');
  for (const line of source) for (const part of wrapTextWithAnsi(line, available)) lines.push(truncateToWidth(theme.fg('dim', prefix) + part, width));
  const count = code.split('\n').length;
  if (count > config.footerAfterLines) lines.push(theme.fg('dim', truncateToWidth(`${indent}╰─ ${count} lines`, width)));
  return lines;
}

export default function registerCodeblock(pi: ExtensionAPI) {
  const g = hostGlobals;
  let hook: RenderCodeBlock | undefined, previous: RenderCodeBlock | undefined, tui: any;
  let active = false;
  pi.on('session_start', (_event, ctx) => {
    if (ctx.mode !== 'tui') return;
    if (g.__sydneyKitMarkdownHookVersion !== PI_HOST_VERSION) {
      // With automatic maintenance on, the patch maintainer reports problems; avoid a second warning.
      if (!features.codeblockPatch) ctx.ui.notify('代码块钩子未加载：已应用补丁请完整重启 Pi；未应用请在 sydney-kit 目录运行 node patches/apply.mjs apply 后重启。', 'warning');
      return;
    }
    active = true;
    // An empty widget is the public way to obtain the TUI handle for async re-renders after highlighting.
    ctx.ui.setWidget('sydney-kit-codeblock', (_tui) => { tui = _tui; return { render: () => [], invalidate() {} }; });
    g.__sydneyKit ??= {};
    previous = g.__sydneyKit.renderCodeBlock;
    hook = (code, lang, width, meta) => {
      if (!active || meta?.styled) return undefined;
      return renderBlock(code, lang, width, ctx.ui.theme, isClosed(meta?.raw ?? ''), () => { if (active) { meta?.invalidate?.(); tui?.requestRender(); } });
    };
    g.__sydneyKit.renderCodeBlock = hook;
  });
  pi.on('session_shutdown', (_event, ctx) => {
    active = false;
    if (hook && g.__sydneyKit?.renderCodeBlock === hook) {
      if (previous) g.__sydneyKit.renderCodeBlock = previous;
      else delete g.__sydneyKit.renderCodeBlock;
    }
    if (tui) ctx.ui.setWidget('sydney-kit-codeblock', undefined);
    tui = undefined;
  });
}
