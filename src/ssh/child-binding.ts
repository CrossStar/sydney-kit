import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
/** Structural mirror of pi-subagents' process-local execution backend v1. */
export const EXECUTION_BACKEND_EVENT = 'subagents:execution-backend:v1';
export interface ExecutionBackendRequest {
  readonly version: 1;
  readonly cwd: string;
  claim(provider: ExecutionBackendProvider): void;
}
export interface ExecutionBackendProvider {
  readonly version: 1;
  readonly id: string;
  capture(cwd: string): { ok: true; binding: ExecutionBackendBinding } | { ok: false; code: 'unavailable' | 'incompatible'; message: string };
}
export interface ExecutionBackendBinding {
  readonly version: 1;
  readonly id: string;
  readonly cwd: string;
  readonly platform: string;
  readonly capabilities?: Readonly<Partial<Record<'worktree' | 'cwdOverride' | 'memory' | 'nesting' | 'extensions' | 'skills' | 'shellGates', false>>>;
  prepare(toolNames: readonly string[], signal?: AbortSignal): Promise<{ tools: readonly ToolDefinition[]; dispose(): Promise<void> }>;
}
