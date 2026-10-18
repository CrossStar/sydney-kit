import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { emphasize } from './emphasize';
import { segments, type Row } from './model';

export const MORE_HINT = '… 展开查看完整差异';

/** Two columns (before | after). With previewLimit, only change pairs are drawn, up to that many output lines. */
export function renderSplit(rows: Row[], old: string[], next: string[], theme: any, width: number, previewLimit?: number): string[] {
  const leftWidth = Math.floor((width - 3) / 2), rightWidth = width - 3 - leftWidth;
  const gutter = String(rows.reduce((max, r) => Math.max(max, r.oldNumber ?? 0, r.newNumber ?? 0), 1)).length;
  const join = (left: string, right: string) => left + '\x1b[0m' + ' '.repeat(Math.max(0, leftWidth - visibleWidth(left))) + theme.fg('dim', ' │ ') + right + '\x1b[0m';
  const result = [join(theme.fg('dim', truncateToWidth('修改前', leftWidth)), theme.fg('dim', truncateToWidth('修改后', rightWidth)))];

  function cell(row: Row | undefined, left: boolean, space: number): string[] {
    if (!row) return [''];
    const color = left ? 'error' : 'success', changed = row.sign !== ' ';
    const raw = (left ? old[row.old!] : next[row.next!]) ?? row.text;
    row.prepare?.();
    const text = changed ? emphasize(raw, row.ranges, theme, color) : raw;
    return wrapTextWithAnsi(text, Math.max(1, space - gutter - 3)).map((part, i) => {
      const sign = i === 0 && changed ? theme.fg(color, left ? '−' : '+') : ' ';
      const number = i === 0 ? String((left ? row.oldNumber : row.newNumber) ?? '') : '';
      return `${sign} ${theme.fg('dim', number.padStart(gutter))} ${part}`;
    });
  }

  let omitted = false;
  const full = () => previewLimit !== undefined && result.length > previewLimit;
  function pair(a?: Row, b?: Row) {
    if (full()) { omitted = true; return; }
    const l = cell(a, true, leftWidth), r = cell(b, false, rightWidth);
    for (let k = 0; k < Math.max(l.length, r.length); k++) {
      if (full()) { omitted = true; break; }
      result.push(join(l[k] ?? '', r[k] ?? ''));
    }
  }

  for (const segment of segments(rows)) {
    if (omitted) break;
    if (segment.row) {
      if (previewLimit !== undefined) continue;
      if (segment.row.sign === '@') result.push(theme.fg('dim', truncateToWidth(segment.row.text, width)));
      else pair(segment.row, segment.row);
      continue;
    }
    for (const [a, b] of segment.pairs) { if (omitted) break; pair(a, b); }
  }
  if (omitted) result.push(theme.fg('dim', MORE_HINT));
  return result;
}
