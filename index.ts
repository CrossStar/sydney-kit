import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { features } from './config';
import theme from './src/ui/theme';
import footer from './src/ui/footer';
import appearance from './src/ui/appearance';
import userMessage from './src/ui/user-message';
import writeSnapshot from './src/tools/write-snapshot';
import pasteImage from './src/clipboard/paste-image';
import { imageBackspace } from './src/clipboard/image-editor';
import registerEditor, { EditorPipeline } from './src/ui/editor';
import compact from './src/tools/compact';
export default function(pi: ExtensionAPI) {
  const editor = new EditorPipeline();
  theme(pi);
  if (features.footer) footer(pi);
  if (features.compact) compact(pi);
  if (features.userMessage) userMessage(pi);
  if (features.appearance) editor.setBase(appearance(pi));
  if (features.diff) writeSnapshot(pi);
  if (features.pasteImage) editor.decorate(imageBackspace(pasteImage(pi).isImageToken));
  registerEditor(pi, editor);
}
