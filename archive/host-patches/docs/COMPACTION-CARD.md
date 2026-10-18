# Chat history compaction card

The card shows `✓ 压缩上下文 压缩前 61.5k tokens ▸ Ctrl+O 展开` on one line when collapsed. The title uses `accent`, the check uses `success`, and metadata and the shortcut use `muted`. There is no background fill or outer frame. Narrow terminals truncate the header.

Expanding shows the exact pre-compaction count (for example `61,521`), a collapse hint, and the Markdown summary wrapped inside an indented, subtle vertical rule. The shortcut text comes from Pi's configured `app.tools.expand` binding; Pi retains control of global expansion. Clicking the card also toggles it.

Only `summary` and `tokensBefore` are rendered. No post-compaction count or savings are inferred. The installed `algal/pi-openai-server-compaction` extension stores its portable summary in `summary`, separately from encrypted replacement history in `details.remoteCompaction`. The card does not read those details. Empty summaries display `暂无可读摘要。`; the extension's own textual fallback remains readable.

## Installation and recovery

`features.compactionCard` enables startup maintenance of the Pi 1.3.0 host patch. Maintenance follows the existing patch mechanism: exact original hash and package version checks, a verified backup, atomic replacement, and refusal to overwrite unknown edits.

Manual commands, from the kit directory:

```
node patches/compaction-card.mjs status
node patches/compaction-card.mjs apply
node patches/compaction-card.mjs revert
```

These accept `--root` for the parent directory containing `pi-coding-agent` and `pi-tui`. `SYDNEY_KIT_PI_ROOT` is also supported. The backup remains beside the host component as `.sydney-compaction-card-1.3.0.bak`.

**Fully restart Pi after applying or reverting the host patch.** `/reload` reloads extensions but does not reload the host component module. If startup maintenance applies the patch during startup, another full restart is required. To keep the original card, disable `features.compactionCard`, revert the patch, and restart; disabling maintenance alone does not revert a disk patch.

## Verification

`node scripts/test.mjs compaction-card` exercises the real host TUI components, collapsed and expanded counts, theme accent, summary isolation, empty summaries, width limits and padding, and isolated patch apply/idempotence/revert/tamper refusal. `npm test` runs the full regression suite. Tests do not start Pi or a model session.
