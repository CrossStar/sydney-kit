# Subagents SSH adapter

Supported upstream: `@tintinweb/pi-subagents` 0.22.0, exact runner SHA-256 checked by installer. No Pi host changes.

Run `node integrations/subagents/install.mjs <subagents-package-root> dry-run`, then `apply` to install, or `revert` to restore the exclusive backup. Restart/reload Pi after apply/revert. Installer refuses unexpected source or edited installations. Tests use a temporary package copy; installed package is untouched.

Provider contract: `src/ssh/child-binding.ts`. On synchronous `sydney-kit:ssh-child:v1`, call envelope `claim(binding)` only when remote routing is active. Capture the connection now, freeze metadata `{cwd, platform, routeId}`, and implement async `prepare({toolNames})` returning `{tools, cleanup}`. Each tool must use pinned connection operations; never resolve the current active route at execution. Provider owns cleanup of partial preparation failures. Tools must exactly match requested names; missing remote grep/find/ls or any other tool fails closed. `createChildTools` accepts backend factories for this purpose; transport/search implementations belong to the provider.

Runner captures before its first await and local git probes, preserves local SDK/config cwd, uses remote prompt cwd, disables ambient child extensions and skills for remote sessions, and injects only scoped remote replacements before session creation. Memory, cwd/worktree overrides and nested agents are rejected. Structured output remains available. Cleanup stays with returned sessions until dispose, permitting resume; errors clean up preparation.

Workflow tool and startup-file admission capture before scheduling and retain the binding in a task WeakMap. The host passes that exact binding through manager admission to every ordinary agent step; explicit null pins a local run. Manager admission rejects remote worktrees before queue insertion or worktree creation. Remote workflow shell gates and nested scopes explicitly fail closed. The four patched upstream files (runner, manager, index, workflow host) are independently hash-checked before any writes. Apply preflights backups and rolls back on write failure.

Late claims return false without throwing into async event handlers. Invalid or duplicate synchronous claims are recorded and thrown after emit returns, even with Pi's exception-catching bus. Tests exercise the installed Pi bus (override PI_EVENT_BUS if needed).

Tests: `node --test tests/ssh-agent.test.mjs` (Node with stripTypeScriptTypes). Set SUBAGENTS_ROOT for alternate upstream location. Tests execute the patched runner preamble and real helper, verify exact scopes and unsupported options, syntax-check the whole patched runner, and round-trip installation. No model/network calls.
