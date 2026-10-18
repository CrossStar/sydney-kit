import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { compact as cfg } from '../../config';
import type { ToolStatus } from './status';
import { clean } from './utils';

export type LineColor = 'success' | 'error' | 'dim';
export type AddLine = (text: string, color?: LineColor, wrap?: boolean, highlighted?: boolean) => void;

/** `icon label  description ............ stat`, never wider than width. */
export function headerLine(theme: any, width: number, short: string, description: string, s: ToolStatus): string {
  const icon = s.failed ? cfg.icons.failure : s.cancelled ? cfg.icons.cancelled : s.running ? cfg.icons.running : s.mutation ? cfg.icons.mutation : cfg.icons.success;
  const iconColor = s.failed ? 'error' : s.cancelled ? 'warning' : s.running ? 'dim' : s.mutation ? 'warning' : 'success';
  // Background-tool labels such as "bg delegate" keep their full name instead of being clipped to nameWidth.
  const labelWidth = short.startsWith('bg ') ? Math.max(cfg.nameWidth, visibleWidth(short)) : cfg.nameWidth;
  const label = truncateToWidth(clean(short), labelWidth, cfg.ellipsis);
  const padded = label + ' '.repeat(Math.max(0, labelWidth - visibleWidth(label)));
  const prefix = theme.fg(iconColor, icon) + ' ' + theme.fg(s.failed ? 'error' : s.mutation ? 'warning' : 'accent', padded) + ' ';
  const right = theme.fg('dim', s.stat);
  const room = width - visibleWidth(prefix) - visibleWidth(right) - 2;
  const left = prefix + truncateToWidth(description, Math.max(0, room), cfg.ellipsis);
  const header = room >= 0 ? left + ' '.repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right))) + right : truncateToWidth(prefix + description, width, cfg.ellipsis);
  return truncateToWidth(header, width, cfg.ellipsis);
}

/** Appends indented body lines; unhighlighted text is stripped of control sequences first. */
export function lineWriter(lines: string[], theme: any, width: number): AddLine {
  return (text, color, wrap = false, highlighted = false) => {
    const prefix = theme.fg('dim', cfg.indent);
    const available = Math.max(1, width - visibleWidth(prefix));
    for (const raw of text.split('\n')) {
      const safe = highlighted ? raw : clean(raw);
      const chunks = wrap ? wrapTextWithAnsi(safe, available) : [truncateToWidth(safe, available, cfg.ellipsis)];
      for (const chunk of chunks) lines.push(truncateToWidth(prefix + (color ? theme.fg(color, chunk) : chunk), width, cfg.ellipsis));
    }
  };
}
