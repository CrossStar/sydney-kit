# Persistent SSH background tasks

Native background-task releases advertise a runtime bundle through `sydney-kit:bg-hook:v1` with `includePersistentRuntime: true`. Sydney pins the resolved SSH route and working directory when discovering a provider. Each request opens and closes its own authenticated route; commands are never replayed after transport failures. Reconnect interactively if authentication needs a password or key passphrase.

The remote host must already have Node 22 or newer. Sydney does not install Node. Runtime assets are validated against their canonical SHA256 and installed under `~/.pi/background-tasks-runtime/<digest>` using private permissions and atomic directory publication. The supervisor's stable service root is `~/.pi/background-tasks-remote`. Runtime installation alone does not submit a task.

The historical install.mjs entry point is now a read-only native source compatibility check. Releases without the native execution provider contract and readiness hook must be upgraded; source patching and manifest recording are no longer supported. Native releases without the persistence capability retain the connection-bound spawn compatibility behavior.

Stub verification: `node scripts/test.mjs ssh-persistent`. These tests do not connect to SSH. Live reconnect, daemon restart and runtime deployment should be exercised in an explicitly authorized test environment before relying on production task recovery.
