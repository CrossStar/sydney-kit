import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { features } from './config';
import footer from './src/ui/footer';
import appearance from './src/ui/appearance';
import userMessage from './src/ui/user-message';
import codeblockPatch from './src/host/codeblock-patch';
import codeblock from './src/rendering/codeblock';
import diff from './src/rendering/diff';
import pasteImage from './src/clipboard/paste-image';
import ternImagePatch from './src/host/tern-image-patch';
import compact from './src/tools/compact';
export default function(pi: ExtensionAPI) {
  if (features.footer) footer(pi);
  if (features.compact) compact(pi);
  if (features.userMessage) userMessage(pi);
  if (features.appearance) appearance(pi);
  if (features.codeblock) codeblock(pi);
  if (features.codeblock && features.codeblockPatch) codeblockPatch(pi);
  if (features.diff) diff(pi);
  if (features.pasteImage) pasteImage(pi);
  if (features.ternImagePatch) ternImagePatch(pi);
}
