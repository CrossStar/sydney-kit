import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import registerInterface from './entries/interface';
import toolView from './entries/tool-view';
import sshWorkspace from './entries/ssh-workspace';

/** Legacy combined entry. The package manifest loads the three entries instead. */
export default async function sydneyKit(pi: ExtensionAPI) {
  await registerInterface(pi);
  toolView(pi);
  sshWorkspace(pi);
}
