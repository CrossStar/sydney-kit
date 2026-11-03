# Automatic display math (optional Pi 1.5.0 host)

The normal Pi command is unchanged. To enable automatic assistant `$$` images, create an isolated host and launch it with sydney-kit loaded:

```powershell
node scripts/math-host.mjs C:/Users/PC/.bun/install/global/node_modules/@earendil-works D:/Workspace/Projects/sydney-kit/.pi/math-host --extension D:/Workspace/Projects/sydney-kit/index.ts
```

The first argument is the directory containing pi-coding-agent and pi-tui. The second is a new local directory. Repeating the command verifies the existing patch and reuses it. No global installation files are written. Dependencies are linked to the source installation, so keep that installation available. A host upgrade requires a newly supported patch and a new isolated directory. Normal Pi configuration, authentication, working directory and session paths are preserved; the launcher does not copy credentials or change HOME.

The installer validates both package versions and unique source signatures before copying. It patches the actual bundled CLI chunks as well as unbundled modules. Unknown layouts fail closed. The generated manifest lists modified files. There is no automatic installation at extension startup.

The extension registers `Symbol.for('sydney-kit.math-block')` during interactive session startup and removes its registration at shutdown. Only assistant text Markdown opts in. The original Markdown and transcript remain unchanged. Closed, top-level `$$...$$` and `\[...\]` blocks render asynchronously through MathJax and Pi's Image component. Pending, failed, narrow (<22 columns), oversized (>16000 characters), unsupported-terminal, and nested blocks retain raw math. Inline math is outside this feature's scope. User messages, thinking and fenced code are unaffected.

Rendering uses one asynchronous worker, at most 64 cached/inflight keys, 128 waiting owners per job, and 16 image instances per Markdown owner. Keys include source and resolved theme foreground. Automatic formulas use a fixed 60-cell raster target; viewport resizing reuses the PNG and Image instance, with Pi fitting it to the available width instead of rerunning MathJax/sharp. Identical equations within one Markdown owner share an instance. The existing disk cache remains available. Theme invalidation triggers a render with the new foreground. Completion invalidates Markdown and schedules the captured host TUI.

Run integration tests after installing an isolated host:

```powershell
$env:MATH_HOST_ROOT='D:/Workspace/Projects/sydney-kit/.pi/math-host/node_modules/@earendil-works'
node --test tests/math-bridge.test.mjs
```

These tests import actual patched bundled and unbundled Markdown, exercise its parser and asynchronous fallback paths, and check Pi Image instance behavior. They make no provider requests. Without MATH_HOST_ROOT the optional integration test is skipped. Interactive terminal appearance still requires a Kitty/iTerm-compatible terminal; automated tests do not establish visual correctness on every terminal.
