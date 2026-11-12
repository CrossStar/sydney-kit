import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { features } from '../config';
import compact from '../src/tools/compact';
import writeSnapshot from '../src/tools/write-snapshot';
import { claim, deferLocalSnapshot } from './shared/registration';

export default function toolView(pi: ExtensionAPI) {
  if (!claim(pi, 'tool-view')) return;
  if (features.compact) compact(pi);
  if (features.diff) deferLocalSnapshot(pi, () => writeSnapshot(pi));
}
