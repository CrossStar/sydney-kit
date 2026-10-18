import { toolBase } from '../catalog';
import { nonEmptyLines } from '../utils';
import { askPresenter, parallelPresenter } from './interactive';
import { backgroundPresenter } from './background';
import { listingPresenter, readPresenter } from './files';
import { shellPresenter } from './shell';
import type { Presenter, ToolPresentation } from './types';
import { webEnablePresenter, webPresenter } from './web';

export type { ToolPresentation } from './types';

const presenters: Presenter[] = [webPresenter, readPresenter, shellPresenter, webEnablePresenter, parallelPresenter, listingPresenter, askPresenter, backgroundPresenter];

/** First matching presenter wins; undefined means the generic summary is used. */
export function present(name: string, args: any, result: any, output: string, cwd: string): ToolPresentation | undefined {
  const input = { name, base: toolBase(name), args, result, details: result?.details ?? {}, output, outputLines: nonEmptyLines(output), cwd };
  for (const presenter of presenters) {
    const presentation = presenter(input);
    if (presentation) return presentation;
  }
  return undefined;
}
