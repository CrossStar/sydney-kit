import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const queryEvent = 'sydney-kit:entry-ownership:v1';
type Query = { name: string; claimed: boolean };
const installed = new WeakMap<ExtensionAPI, Set<string>>();

/** APIs differ between entries; the host event bus is the runtime-wide authority.
 * Shutdown removes listeners even when the bus survives /reload.
 */
export function isInstalled(pi: ExtensionAPI, name: string): boolean {
  const query: Query = { name, claimed: false };
  pi.events.emit(queryEvent, query);
  return query.claimed;
}

export function claim(pi: ExtensionAPI, name: string): boolean {
  if (installed.get(pi)?.has(name) || isInstalled(pi, name)) return false;
  const names = installed.get(pi) ?? new Set<string>();
  installed.set(pi, names);
  names.add(name);
  const unsubscribe = pi.events.on(queryEvent, (data: unknown) => {
    const query = data as Query;
    if (query.name === name) query.claimed = true;
  });
  pi.on('session_shutdown', () => {
    unsubscribe();
    names.delete(name);
  });
  return true;
}

export function deferLocalSnapshot(pi: ExtensionAPI, register: () => void): void {
  let registered = false;
  // Every factory has completed before session_start. Do not infer entry presence
  // from features.ssh: that flag may be enabled with only tool-view selected.
  pi.on('session_start', () => {
    if (!registered && !isInstalled(pi, 'ssh-workspace')) {
      register();
      registered = true;
    }
  });
}
