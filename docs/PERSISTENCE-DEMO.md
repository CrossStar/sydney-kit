# Persistence demo

Run from a real interactive terminal (stdin and stdout must both be TTYs):

```sh
node scripts/demo-persistence.mjs --check
node scripts/demo-persistence.mjs --model provider/model
node scripts/demo-persistence.mjs --host raspi --model provider/model
node scripts/demo-persistence.mjs --local --model provider/model
```

Default host is `raspi`, using your normal SSH configuration and host-key checks.
The script loads the three development projects, matching `start-raspi-test.sh`.
`SYDNEY_BG_ROOT` and `SUBAGENTS_ROOT` override the sibling plugin paths.
No global configuration or file permissions are changed. Existing credentials are
used; SSH authentication and host-key prompts remain interactive. Remote setup
requires a POSIX shell, `printenv`, `cat`, `date`, and `sleep`.

Pi receives an initial prompt to connect/chdir and launch the foreground heartbeat
script through `bg_run` with `isAgent:false`. After Pi displays a task ID and two
heartbeats, **exit Pi without cancelling the task**. The outer process then reads
logs independently for 30 seconds. It never launches the heartbeat itself and
never cancels it; it finishes naturally after approximately 10 minutes. Use Pi's
normal exit command rather than terminating the entire terminal/process group.

The printed run directory contains `run.json` and is the Pi session working
directory. SSH task files live in a unique directory under the remote HOME;
local task files live in the run directory. START records include UUID, PID and
UTC date; heartbeat logs include sequence, PID, UTC date and an exit marker.
Metadata contains no credentials.

```sh
node scripts/demo-persistence.mjs --resume /absolute/run/directory --model provider/model
node scripts/demo-persistence.mjs --observe /absolute/run/directory --seconds 30
```

Resume uses `pi --continue` in the same directory and requests inspection of the
original task, never restart. Observe does not launch Pi. Both use the saved
host/local setting. `--check` only validates local dependencies and arguments;
it does not connect, validate credentials, or invoke a model.

The observer prints appended lines, START count and heartbeat growth relative to
its first snapshot after Pi exits (or after observation begins). One START and
positive growth are evidence of continued execution, not independent proof of
plugin attribution: retain the Pi task ID/session too. Missing logs, no growth,
multiple STARTs or an already finished task are reported as NOT VERIFIED with
exit code 2. SSH/setup failures use exit code 1. An SSH read can take up to 60s
before timing out, so connection failure can extend the observation duration.
Logs remain for manual review; cleanup is manual after the task finishes.
