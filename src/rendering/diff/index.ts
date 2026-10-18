// Original implementation inspired by pi-diff's patch -> word ranges -> ANSI layering design.
import { diffs as config } from '../../../config';
import { highlightSync, languageForPath, type HighlightCache } from '../highlight';
import { diffModel, isChange, segments, type DiffModel, type Row } from './model';
import { MORE_HINT, renderSplit } from './split';
import { renderUnified } from './unified';

export { makePatch } from './model';
export type DiffModelCache = { key?: string; parsed?: DiffModel };
export interface DiffRenderOptions {
  expanded: boolean;
  /** Collapsed view: maximum change lines (unified) or change pairs / output lines (side by side). */
  previewLines: number;
  onReady: () => void;
  width?: number;
  highlightCache?: HighlightCache;
  modelCache?: DiffModelCache;
}

function previewRows(rows: Row[], paired: boolean, limit: number) {
  if (!paired) return rows.filter(isChange).slice(0, limit);
  const keep = new Set<Row>();
  let count = 0;
  for (const segment of segments(rows)) {
    for (const [a, b] of segment.pairs ?? []) {
      if (count >= limit) break;
      if (a) keep.add(a);
      if (b) keep.add(b);
      count++;
    }
    if (count >= limit) break;
  }
  return rows.filter(r => keep.has(r) || r.sign === '@');
}

function previewText(text: string) {
  return text.length > config.previewLineChars ? text.slice(0, config.previewLineChars).replace(/[\uD800-\uDBFF]$/, '') + '…' : text;
}

export function enhancedDiff(patch: string, path: string, theme: any, options: DiffRenderOptions) {
  const { expanded, previewLines, onReady, width = 0, highlightCache, modelCache } = options;
  try {
    const model = modelCache?.key === patch && modelCache.parsed ? modelCache.parsed : diffModel(patch);
    if (modelCache) { modelCache.key = patch; modelCache.parsed = model; }
    const lang = languageForPath(path);
    const changes = model.rows.filter(isChange);
    const sideBySide = config.sideBySide && width >= config.sideBySideMinWidth;
    const selected = expanded ? model.rows : previewRows(model.rows, sideBySide, previewLines);

    let old: string[], next: string[];
    if (expanded) {
      old = highlightSync(model.old.join('\n'), lang, onReady, highlightCache);
      next = highlightSync(model.next.join('\n'), lang, onReady, highlightCache);
    } else {
      // Highlight only the visible preview rows, each side as one block so Shiki keeps cross-line context.
      const side = (key: 'old' | 'next') => {
        const rows = selected.filter(r => r[key] !== undefined), out: string[] = [];
        const lines = highlightSync(rows.map(r => previewText(r.text)).join('\n'), lang, onReady, highlightCache);
        rows.forEach((r, i) => out[r[key]!] = lines[i] ?? previewText(r.text));
        return out;
      };
      old = side('old');
      next = side('next');
    }

    const lines = sideBySide
      ? renderSplit(selected, old, next, theme, width, expanded ? undefined : previewLines)
      : renderUnified(selected, old, next, theme, row => expanded ? row.text : previewText(row.text));
    if (!expanded && sideBySide && selected.filter(r => r.sign !== '@').length < changes.length && !lines.some(l => l.includes(MORE_HINT))) lines.push(theme.fg('dim', MORE_HINT));
    if (!expanded && !sideBySide && changes.length > previewLines) lines.push(theme.fg('dim', `… 还有 ${changes.length - previewLines} 行`));
    return { lines, added: changes.filter(r => r.sign === '+').length, removed: changes.filter(r => r.sign === '-').length };
  } catch { return undefined; }
}
