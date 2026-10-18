import { createTwoFilesPatch, diffWordsWithSpace, parsePatch } from 'diff';
import { diffs as config } from '../../../config';

export type Range = [number, number];
export interface Row {
  sign: string;
  text: string;
  number?: number;
  oldNumber?: number;
  newNumber?: number;
  /** Index into DiffModel.old / DiffModel.next, used to look up highlighted text. */
  old?: number;
  next?: number;
  ranges: Range[];
  /** Word ranges are computed lazily: only rows that are actually drawn pay for diffWords. */
  prepare?: () => void;
}
export interface DiffModel { rows: Row[]; old: string[]; next: string[] }
export type ChangePair = [removed: Row | undefined, added: Row | undefined];
export type Segment = { row: Row; pairs?: undefined } | { row?: undefined; pairs: ChangePair[] };

export const isChange = (row: Row) => row.sign === '+' || row.sign === '-';

export function makePatch(path: string, oldText: string, newText: string) {
  return createTwoFilesPatch(path, path, oldText, newText, '', '', { context: config.contextLines });
}

/** Yields context/hunk rows one by one and each run of +/- rows as removed/added pairs. */
export function* segments(rows: Row[]): Generator<Segment> {
  for (let i = 0; i < rows.length;) {
    if (!isChange(rows[i])) { yield { row: rows[i++] }; continue; }
    const removed: Row[] = [], added: Row[] = [];
    while (i < rows.length && isChange(rows[i])) { const row = rows[i++]; (row.sign === '-' ? removed : added).push(row); }
    yield { pairs: Array.from({ length: Math.max(removed.length, added.length) }, (_, n): ChangePair => [removed[n], added[n]]) };
  }
}

function attachWordRanges(a: Row | undefined, b: Row | undefined) {
  let computed = false;
  const prepare = () => {
    if (computed) return;
    computed = true;
    if (!a || !b || a.text.length + b.text.length > config.wordCompareLimit) {
      if (a) a.ranges = [[0, a.text.length]];
      if (b) b.ranges = [[0, b.text.length]];
      return;
    }
    let x = 0, y = 0;
    for (const part of diffWordsWithSpace(a.text, b.text)) {
      if (part.removed) { a.ranges.push([x, x + part.value.length]); x += part.value.length; }
      else if (part.added) { b.ranges.push([y, y + part.value.length]); y += part.value.length; }
      else { x += part.value.length; y += part.value.length; }
    }
  };
  if (a) a.prepare = prepare;
  if (b) b.prepare = prepare;
}

function buildModel(patch: string): DiffModel {
  const rows: Row[] = [], old: string[] = [], next: string[] = [];
  for (const file of parsePatch(patch)) for (const hunk of file.hunks) {
    rows.push({ sign: '@', text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`, ranges: [] });
    let a = hunk.oldStart, b = hunk.newStart;
    for (const line of hunk.lines) {
      const sign = line[0], text = line.slice(1);
      if (![' ', '+', '-'].includes(sign)) continue;
      const row: Row = { sign, text, ranges: [] };
      if (sign !== '+') { row.old = old.length; row.oldNumber = a; row.number = a++; old.push(text); }
      if (sign !== '-') { row.next = next.length; row.newNumber = b; row.number = b++; next.push(text); }
      rows.push(row);
    }
  }
  for (const segment of segments(rows)) for (const [a, b] of segment.pairs ?? []) attachWordRanges(a, b);
  return { rows, old, next };
}

const models = new Map<string, DiffModel>();
export function diffModel(patch: string): DiffModel {
  let model = models.get(patch);
  if (model) { models.delete(patch); models.set(patch, model); return model; }
  model = buildModel(patch);
  models.set(patch, model);
  if (models.size > config.parsedCacheEntries) models.delete(models.keys().next().value!);
  return model;
}
