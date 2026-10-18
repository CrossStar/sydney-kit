import { compact as cfg } from '../../config';
import type { ToolPresentation } from './presenters';
import { lineCount } from './utils';

export interface ToolStatus { stat: string; failed: boolean; running: boolean; cancelled: boolean; mutation: boolean }

export interface StatusInput {
  name: string;
  args: any;
  result: any;
  output: string;
  presentation?: ToolPresentation;
  /** +/- counts from the enhanced diff, or from the host diff for edit. */
  changes?: { added: number; removed: number };
  failed: boolean;
  expanded: boolean;
  isPartial: boolean;
  durationMs?: number;
}

/** Later rules override earlier ones: presenter stat, then streaming, then failure. */
export function toolStatus(s: StatusInput): ToolStatus {
  const exitCode = s.result?.details?.exitCode;
  let stat = s.result ? (s.output ? `${lineCount(s.output)} ${lineCount(s.output) === 1 ? 'line' : 'lines'}` : 'ok') : '…';
  if (s.name === 'write' && s.result && !s.failed && typeof s.args.content === 'string') stat = `${lineCount(s.args.content)} lines`;
  if (s.changes) stat = `+${s.changes.added} −${s.changes.removed} ${s.expanded ? '▾' : '▸'}`;
  if (s.presentation?.stat) stat = s.presentation.stat;
  if (s.isPartial) stat = s.presentation?.stat ?? 'running';
  if (s.failed) stat = typeof exitCode === 'number' ? `exit ${exitCode}` : 'failed';
  if (typeof s.durationMs === 'number') stat += ` · ${Math.round(s.durationMs / 100) / 10}s`;
  return {
    stat,
    failed: s.failed,
    running: !s.result || s.isPartial || !!s.presentation?.pending,
    cancelled: !!s.presentation?.cancelled,
    mutation: cfg.mutationTools.includes(s.name),
  };
}
