// Transport independent v1 contract. Providers must capture the connection synchronously.
export const SSH_CHILD_EVENT = "sydney-kit:ssh-child:v1";
export interface ChildTool { name: string; [key: string]: unknown }
export interface ChildBinding {
  readonly metadata: Readonly<{ cwd: string; platform: string; routeId: string }>;
  prepare(request: { toolNames: readonly string[] }): Promise<{
    tools: ChildTool[];
    cleanup(): void | Promise<void>;
  }>;
}
export interface ChildBindingRequest { /** false means the synchronous claim window closed or the request is invalid. */ claim(binding: ChildBinding): boolean }
/** Backends close over pinned operations, never consult the current global route. */
export async function createChildTools(
  toolNames: readonly string[],
  factories: Readonly<Record<string, (() => ChildTool | Promise<ChildTool>) | undefined>>,
): Promise<ChildTool[]> {
  return Promise.all(toolNames.map(async name => {
    if (!Object.hasOwn(factories, name) || !factories[name]) throw new Error(`Unsupported SSH child tool: ${name}`);
    const tool = await factories[name]!();
    if (tool.name !== name) throw new Error(`SSH tool name mismatch: ${name}`);
    return tool;
  }));
}
