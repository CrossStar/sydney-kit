import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { features } from './config';
import footer from './footer';
import appearance from './appearance';
import userMessage from './user-message';
import codeblockPatch from './codeblock-patch';
import codeblock from './codeblock';
import diff from './diff';
import pasteImage from './paste-image';
import ternImagePatch from './tern-image-patch';
import compact from './compact';
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
