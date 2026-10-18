import type { Presenter } from './types';

export const askPresenter: Presenter = ({ base, args, result, details: d, outputLines }) => {
  if (base !== 'ask_user_question') return undefined;
  const questions = Array.isArray(args.questions) ? args.questions : [];
  const answers = d.answers;
  const previews = answers && typeof answers === 'object' ? Object.entries(answers).map(([q, a]) => `${q} → ${typeof a === 'string' ? a : JSON.stringify(a)}`) : outputLines;
  return {
    short: 'ask',
    description: questions.map((q: any) => q.header ?? q.question).join(' · '),
    stat: d.cancelled ? '已取消' : result ? '已返回' : '等待回答',
    previews, error: !!d.error, cancelled: !!d.cancelled,
  };
};

export const parallelPresenter: Presenter = ({ base, args, details: d }) => {
  if (base !== 'parallel') return undefined;
  const calls = Array.isArray(args.tool_uses) ? args.tool_uses : [];
  return { short: 'parallel', description: `并行调用 ${calls.length} 项`, previews: calls.map((c: any) => String(c.recipient_name ?? c.name ?? '工具')), error: !!d.error };
};
