/** Credentials may be shared, but a session's resume route belongs to its event bus. */
export interface ResumeRoute {
  command: string;
  cwd: string;
  routeRemoteTools: boolean;
  forwards?: string[];
}

const key = Symbol.for('sydney-kit.ssh.owner-routes.v1');
const host = globalThis as typeof globalThis & {
  [key]?: WeakMap<object, { resume?: ResumeRoute }>;
};
const owners = host[key] ??= new WeakMap<object, { resume?: ResumeRoute }>();

/** Stable across extension reloads, isolated across independently created sessions. */
export function routeStateForOwner(owner: object): { resume?: ResumeRoute } {
  let state = owners.get(owner);
  if (!state) {
    state = {};
    owners.set(owner, state);
  }
  return state;
}
