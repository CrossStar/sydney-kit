import { compact as cfg } from '../../../config';
import { nonEmptyLines, summary } from '../utils';
import type { Presenter } from './types';

export const shellPresenter: Presenter = ({ name, base, args, details: d, outputLines, cwd }) => {
  if (base !== 'bash' && base !== 'powershell') return undefined;
  const [short, description] = summary(name, args, cwd);
  const exitCode = typeof d.exitCode === 'number' ? d.exitCode : undefined;
  const stderr = typeof d.stderr === 'string' ? nonEmptyLines(d.stderr) : undefined;
  return {
    short, description,
    stat: exitCode !== undefined ? `exit ${exitCode}` : undefined,
    previews: [],
    error: !!d.error || (exitCode !== undefined && exitCode !== 0),
    errorPreview: stderr?.length ? stderr : outputLines.slice(-cfg.errorLines),
  };
};
