import type { Range } from './model';

/** Underlines changed character ranges inside already-highlighted ANSI text, restoring the token color afterwards. */
export function emphasize(ansi: string, ranges: Range[], theme: any, color: 'success' | 'error') {
  let result = '', position = 0, style = '', range = 0;
  for (const part of ansi.match(/\x1b\[[0-?]*[ -/]*[@-~]|[^\x1b]+/g) ?? []) {
    if (part.startsWith('\x1b')) { style = part === '\x1b[39m' ? '' : style + part; result += part; continue; }
    let offset = 0;
    while (offset < part.length) {
      while (range < ranges.length && position >= ranges[range][1]) range++;
      const changed = range < ranges.length && position >= ranges[range][0];
      const boundary = range < ranges.length ? ranges[range][changed ? 1 : 0] : Infinity;
      const length = Math.min(part.length - offset, boundary - position);
      const text = part.slice(offset, offset + length);
      result += changed ? theme.fg(color, theme.underline(text)) + style : text;
      position += length;
      offset += length;
    }
  }
  return result;
}
