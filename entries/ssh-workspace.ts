import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { features } from '../config';
import ssh from '../src/ssh';
import { claim } from './shared/registration';

export default function sshWorkspace(pi: ExtensionAPI) {
  if (features.ssh && claim(pi, 'ssh-workspace')) ssh(pi);
}
