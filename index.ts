import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { features } from './config';
import theme from './src/ui/theme';
import footer from './src/ui/footer';
import appearance from './src/ui/appearance';
import userMessage from './src/ui/user-message';
import codeblock from './src/rendering/codeblock';
import diff from './src/rendering/diff';
import pasteImage from './src/clipboard/paste-image';
import compact from './src/tools/compact';
import { codeblockPatch, compactionCardPatch, registerHostPatch, ternImagePatch } from './src/host/host-patches';
export default function(pi: ExtensionAPI) {
  theme(pi);
  if (features.footer) footer(pi);
  if (features.compact) compact(pi);
  if (features.userMessage) userMessage(pi);
  if (features.appearance) appearance(pi);
  if (features.codeblock) codeblock(pi);
  if (features.codeblock && features.codeblockPatch) registerHostPatch(pi, codeblockPatch);
  if (features.diff) diff(pi);
  if (features.pasteImage) pasteImage(pi);
  if (features.ternImagePatch) registerHostPatch(pi, ternImagePatch);
  if (features.compactionCard) registerHostPatch(pi, compactionCardPatch);
}
