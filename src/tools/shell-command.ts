import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { lineWriter } from './layout';
import { clean, textOutput, summary } from './utils';
import { compact as cfg } from '../../config';

/** Shell rows use execution-owned metadata only, never the current SSH connection. */
export function renderShellCommand(theme: any, width: number, args: any, result: any, ctx: any, metadata?: any): string[] {
  if (width <= 0) return [];
  const m = result?.details?.sydneyShell ?? metadata;
  const command = String(m?.command ?? args.remoteCommand ?? args.command ?? '').split('\n').map(clean).join('\n');
  const [program, parameters] = summary('bash', {command}, m?.cwd ?? ctx.cwd ?? '');
  const running = !result || ctx.isPartial;
  const code = result?.details?.exitCode ?? m?.exitCode;
  const failed = ctx.isError || result?.isError || (typeof code === 'number' && code !== 0);
  const status = running ? (ctx.executionStarted ? 'running' : '…') : typeof code === 'number' ? `exit ${code}` : failed ? 'failed' : 'ok';
  const host = m?.host ? clean(String(m.host)) : '';
  const violet = (s: string) => process.env.NO_COLOR !== undefined ? s : `\x1b[1;38;5;177m${s}\x1b[0m`;
  const prefix = theme.fg(failed ? 'error' : running ? 'dim' : 'success', failed ? '✗' : running ? '…' : '✓') + ' ' + theme.fg('accent', program + ' '.repeat(Math.max(0, cfg.nameWidth - visibleWidth(program))));
  const suffix = (host ? violet(host) + theme.fg('dim', ' · ') : '') + theme.fg('dim', status + (result ? (ctx.expanded ? ' ▾' : ' ▸') : ''));
  const duration = typeof ctx.durationMs === 'number' ? ` · ${Math.round(ctx.durationMs / 100) / 10}s` : '';
  let right = suffix + theme.fg('dim', duration);
  if (visibleWidth(prefix + '  ' + parameters + '  ' + right) > width) right = suffix;
  const room = width - visibleWidth(prefix) - visibleWidth(right) - 3;
  const lines: string[] = [];
  if (room < 0) {
    lines.push(truncateToWidth(prefix, width));
    lines.push(truncateToWidth(right, width));
  } else {
    const left = prefix + '  ' + truncateToWidth(parameters, room, '…');
    lines.push(left + ' '.repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right))) + right);
  }
  const add = lineWriter(lines, theme, width);
  if (ctx.expanded) {
    const rows = command.split('\n');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].replace(/^(\s*)("[^"]+"|\S+)/, (_: string, space: string, executable: string) => space + theme.fg('accent', executable));
      add((i === 0 ? `${host ? host + ':' : ''}${clean(m?.cwd ?? ctx.cwd ?? '')} $ ` : '') + row, undefined, true, true);
    }
    if (cfg.showExpandedArgs) {
      add('参数', 'dim');
      add(JSON.stringify(args, null, 2).slice(0, 4096), 'dim', true);
    }
  }
  const output = failed && typeof result?.details?.stderr === 'string' ? result.details.stderr : textOutput(result);
  const rows = output.split('\n');
  for (const row of (ctx.expanded ? rows : rows.slice(-(failed ? cfg.errorLines : Math.max(1, Math.min(50, Number(result?.details?.displayLines ?? args.displayLines) || 5)))))) if (row) add(row, failed ? 'error' : undefined, ctx.expanded);
  return lines;
}
