import { emphasize } from './emphasize';
import type { Row } from './model';

export function renderUnified(rows: Row[], old: string[], next: string[], theme: any, fallback: (row: Row) => string): string[] {
  return rows.map(row => {
    if (row.sign === '@') return theme.fg('dim', row.text);
    const color = row.sign === '+' ? 'success' : 'error';
    row.prepare?.();
    const body = (row.sign === '-' ? old[row.old!] : next[row.next!]) ?? fallback(row);
    const prefix = row.sign === ' ' ? theme.fg('dim', ' ') : theme.fg(color, row.sign === '+' ? '+' : '−');
    return `${prefix} ${theme.fg('dim', String(row.number ?? ''))} ${row.sign === ' ' ? body : emphasize(body, row.ranges, theme, color)}`;
  });
}
