# Native execution backend

sydney-kit provides `subagents:execution-backend:v1`. Only the pi-subagents fork implementing this native contract is supported. Load the updated versions of both extensions together and reload Pi. There is no old-consumer detection, patch installer, patch marker, separate readiness handshake or legacy protocol fallback.

The provider claims synchronously and captures route and cwd in `capture`. Each `prepare` owns a separate connection and idempotent `dispose`. Read/write/edit/bash/grep/find/ls are supported; powershell is rejected. External capabilities are false. Search uses remote GNU utilities, whose ignore and glob semantics differ from local Pi tools.

Agent and SubagentWorkflow proceed directly to native admission. The consumer validates the versioned contract and requested tool scope. An active SSH route that is unavailable or restoring returns an error; preparation never falls back to local execution. Captured bindings remain fixed when the parent changes route or cwd. No extra RPC capability declaration is required.

Tests execute the real Pi event bus and the current consumer capture/prepare implementation; set `SUBAGENTS_ROOT` to its source checkout. No model-driven or live-network session validation is claimed for this migration.
