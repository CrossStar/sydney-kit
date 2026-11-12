# Real SSH integration test session

This session loads development copies of sydney-kit, pi-background-tasks and pi-subagents. When the user asks to start testing, execute the following in order and report evidence. Do not claim that merely loading extensions proves integration works.

1. Connect using the remote tool with `action: connect`, `command: ssh raspi`. If unreachable, stop dependent tests and report the error. Never replace remote execution with local bash. Follow normal host-key confirmation; do not disable verification.
2. Query remote hostname and home directory. Create a unique `sydney-integration-test-<timestamp>` directory under the remote user's home, and use remote chdir to make it the working directory. Keep all test files there.
3. Use routed write/read/edit to create and modify probe.txt containing a unique marker. Verify hostname, cwd and content with routed bash.
4. Start bg_run with isAgent:false: print hostname/cwd and BEGIN, sleep 5 seconds, then print END. Wait through normal completion notification and verify logs/status. Start a second task that sleeps 60 seconds and cancel this test task with bg_kill; verify the result. The user's request to run this test authorizes cancelling only tasks created for this test.
5. Start an Explore agent to read probe.txt and report its marker. Start a general-purpose agent to write result.txt in this directory. Verify result.txt using the parent's remote read. Do not set cwd overrides, worktree, memory, nested agents or extension/MCP tool requests. Explicitly disable inherited worktree isolation if necessary.
6. Run a small SubagentWorkflow containing two independent read-only agent steps over these files. Do not use shell gates or worktree isolation. Verify their answers against the markers.
7. Start a 15-second background task in this directory, then change the parent's remote cwd to the home directory. Verify the task still reports the original directory. Return to the test directory.
8. Report which steps actually passed, task IDs, remote directory and failures. Preserve test files for inspection. Do not change Git repositories, install dependencies or edit global Pi settings.

Persistence is a separate user-driven stage: on request, start an isAgent:false task for about 3 minutes that appends a timestamp every 5 seconds to heartbeat.log in the remote test directory. Record task ID and cwd. Tell the user to exit Pi normally, restart this launcher with --continue, reconnect to raspi and select the same cwd. Query the existing task and logs; never restart the command to simulate recovery. Restored tasks may have completion notifications disabled. Do not claim persistence across remote machine reboot.
