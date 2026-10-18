import { compact as cfg } from '../../../config';
import { TASK_LABELS, TASK_LAUNCH_TOOLS } from '../catalog';
import { clean, withJsonOutput } from '../utils';
import type { Presenter } from './types';

const PENDING = ['running', 'queued', 'pending', 'not_ready', 'not-ready', 'started'];
const CANCELLED = ['killed', 'cancelled', 'canceled', 'stopped'];

export const backgroundPresenter: Presenter = ({ base, args, result, details, output, outputLines }) => {
  const label = TASK_LABELS[base];
  if (!label) return undefined;
  const data = withJsonOutput(details, output);
  const starting = TASK_LAUNCH_TOOLS.includes(base);
  const rawStatus = data.status ?? data.state ?? output.match(/^Status:\s*(\w+)/im)?.[1];
  const status = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : undefined;
  const pending = PENDING.includes(status ?? '');
  const cancelled = CANCELLED.includes(status ?? '');
  const error = !!data.error || status === 'failed';
  // A successful launch receipt is not task completion. Avoid inferring job status from arbitrary log text.
  const stat = status ?? (starting && result && !error ? '已提交' : undefined);
  const description = String(args.name ?? args.objective ?? args.taskId ?? args.description ?? (starting ? '后台任务' : '后台任务列表'));
  const taskRows = Array.isArray(data.tasks)
    ? data.tasks.map((task: any) => `${task.name ?? task.id ?? task.taskId ?? '任务'} · ${task.status ?? '未知'}${typeof task.durationMs === 'number' ? ` · ${Math.round(task.durationMs / 100) / 10}s` : ''}`)
    : undefined;
  const logs = base === 'bg_logs';
  const previews = logs ? outputLines.slice(-cfg.logPreviewLines) : taskRows ?? outputLines;
  return {
    short: label,
    description: clean(description),
    stat: logs && result ? `末尾 ${previews.length} 行` : stat,
    previews, error, cancelled,
    pending: pending || (starting && !!result && !error && !cancelled && !['completed', 'done'].includes(status ?? '')),
    limit: logs ? cfg.logPreviewLines : cfg.taskPreviewLines,
  };
};
