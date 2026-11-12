import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { features } from '../config';
import theme from '../src/ui/theme';
import footer from '../src/ui/footer';
import appearance from '../src/ui/appearance';
import userMessage from '../src/ui/user-message';
import pasteImage from '../src/clipboard/paste-image';
import { imageBackspace } from '../src/clipboard/image-editor';
import registerEditor, { EditorPipeline } from '../src/ui/editor';
import { claim } from './shared/registration';
export default async function(pi: ExtensionAPI) {
  if (!claim(pi, 'interface')) return;
  const editor = new EditorPipeline();
  theme(pi);
  if (features.footer) footer(pi);
  if (features.userMessage) userMessage(pi);
  if (features.appearance) editor.setBase(appearance(pi));
  if (features.pasteImage) editor.decorate(imageBackspace(pasteImage(pi).isImageToken));
  registerEditor(pi, editor);
}
