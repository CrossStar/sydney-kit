export function capture(events) {
  let binding, error, open = true;
  try {
    events.emit('sydney-kit:ssh-child:v1', { claim(value) {
      // Return an explicit refusal for late claims: never throw into an async listener.
      if (!open) return false;
      if (binding) { error = new Error('SSH child claim must be unique'); return false; }
      if (!value || typeof value.prepare !== 'function' || !value.metadata || !Object.isFrozen(value.metadata)) {
        error = new Error('Invalid SSH child binding'); return false;
      }
      binding = value;
      return true;
    } });
  } finally { open = false; }
  if (error) throw error;
  return binding;
}
export function admit(events, options, config) {
  const binding = Object.hasOwn(options, 'sshBinding') ? options.sshBinding : capture(events);
  guard(binding, options, config);
  if (binding && (options.isolation === 'worktree' || (!options.workflowId && config?.isolation === 'worktree'))) throw new Error('SSH child worktrees unsupported');
  return { ...options, sshBinding: binding ?? null };
}
export function guard(binding, options, config) {
  if (binding && (options.worktreeBase || options.cwd || config?.memory || config?.nested || config?.allowedSubagents)) throw new Error('SSH child worktree, cwd override, memory or nested scope unsupported');
}
export async function prepare(binding, names) {
  const requested = [...new Set(names)];
  const result = await binding.prepare({ toolNames: Object.freeze(requested) });
  try {
    if (!result || typeof result.cleanup !== 'function' || !Array.isArray(result.tools)) throw new Error('Malformed SSH preparation');
    const actual = result.tools.map(t => t?.name);
    if (actual.length !== requested.length || new Set(actual).size !== actual.length || actual.some(n => !requested.includes(n))) throw new Error('SSH child tools do not exactly match allowed scope');
  } catch (error) {
    if (typeof result?.cleanup === 'function') { try { await result.cleanup(); } catch {} }
    throw error;
  }
  return result;
}
