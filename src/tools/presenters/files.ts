import { compact as cfg } from '../../../config';
import { shortPath } from '../utils';
import type { Presenter } from './types';

export const readPresenter: Presenter = ({ base, args, result, details: d, cwd }) => {
  if (base !== 'read') return undefined;
  const image = (result?.content ?? []).some((c: any) => c.type === 'image');
  const range = [args.offset != null ? `从第 ${args.offset} 行` : null, args.limit != null ? `最多 ${args.limit} 行` : null].filter(Boolean).join(' · ');
  return { short: 'read', description: `${shortPath(String(args.path ?? ''), cwd)}${range ? ' · ' + range : ''}`, stat: image ? 'image' : undefined, previews: [], error: !!d.error };
};

export const listingPresenter: Presenter = ({ base, args, details: d, outputLines, cwd }) => {
  if (!['grep', 'find', 'ls'].includes(base)) return undefined;
  const path = shortPath(String(args.path ?? '.'), cwd);
  const description = base === 'ls' ? path : `${args.pattern ?? args.query ?? ''}  ${path}${args.glob ? ` · ${args.glob}` : ''}`;
  const previews = outputLines.map(line => {
    if (base !== 'grep') return shortPath(line, cwd);
    const match = line.match(/^(.*?):(\d+)(?::|\s)(.*)$/);
    return match ? `${shortPath(match[1], cwd)}:${match[2]}  ${match[3].trimStart()}` : line;
  });
  const count = d.matchCount ?? d.totalMatches;
  return { short: base, description, stat: typeof count === 'number' ? `${count} matches` : undefined, previews, error: !!d.error, limit: cfg.filePreviewLines };
};
