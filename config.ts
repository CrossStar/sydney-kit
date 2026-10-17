import { resolveHostRoot } from './src/host/paths.mjs';
export const footerConfig = { warningPercent: 80, errorPercent: 90, shortContextWidth: 65, barWidthThreshold: 85, barCells: 10, indent: 2, icons: { model: '\uf2db', effort: '\uf0e7', context: '\uf1c0', folder: '\uf07c', branch: '\ue0a0' } };
export const features = { footer: true, compact: true, userMessage: true, appearance: true, codeblock: true, diff: true, pasteImage: true, ternImagePatch: true, codeblockPatch: true, compactionCard: true };
export const highlighting = { theme: 'github-dark-dimmed', preload: ['typescript','tsx','javascript','json','python','markdown','bash','powershell','yaml'], aliases: {ts:'typescript',js:'javascript',py:'python',md:'markdown',ps1:'powershell',pwsh:'powershell',sh:'bash',shell:'bash',yml:'yaml'} as Record<string,string>, maxChars: 200000, maxLineChars: 2000, cacheEntries: 64 };
export const codeblocks = { footerAfterLines: 5, indent: '  ', prefix: '│ ', patchVersion: '1.3.0' };
export const diffs = { sideBySide: false, previewLineChars: 300, parsedCacheEntries: 16, sideBySideMinWidth: 72, contextLines: 4, maxSnapshotBytes: 2_000_000, wordCompareLimit: 10000 };
export const appearance = { boxedEditor: true, borderColor: 'borderMuted' as const, statusLabels: { working: 'Working…', thinking: 'Thinking…', responding: 'Responding…', tools: 'Running tools…' }, frameIntervalMs: 90, maxHighlightChars: 80000 };
export const pasteImage = { shortcut: 'alt+v' as const, directory: '~/.pi/agent/sydney-kit/clipboard', retentionDays: 7, maxEdge: 2000, processTimeoutMs: 8000, cleanupIntervalMs: 3600000, maxFileBytes: 50 * 1024 * 1024 };
export const ternImagePatch = { nodeCommand: 'node', timeoutMs: 6000, packageRoot: resolveHostRoot() };
export const codeblockPatch = { nodeCommand: 'node', timeoutMs: 6000, packageRoot: resolveHostRoot() };
export const compactionCardPatch = { nodeCommand: 'node', timeoutMs: 6000, packageRoot: resolveHostRoot() };
export const messageRules = { top: '▔', bottom: '▁' };
export const compact = {
  showExpandedArgs: false,
  nameWidth: 7, nameCacheEntries: 256, editPreviewLines: 6, errorLines: 3, webPreviewLines: 4,
  filePreviewLines: 5, taskPreviewLines: 4, logPreviewLines: 6,
  icons: { success: '✓', failure: '✗', mutation: '✎', running: '…', cancelled: '■' },
  mutationTools: ['edit', 'write', 'apply_patch'],
  indent: '    ', ellipsis: '…',
  aliases: { powershell: 'ps', pwsh: 'ps' } as Record<string, string>,
  summaryFields: ['path', 'file_path', 'query', 'queries', 'pattern', 'command', 'url', 'urls', 'name', 'objective', 'claim', 'prompt'],
  powershellWrapper: /^\s*(?:powershell|pwsh)(?:\.exe)?\s+(?:-NoProfile\s+)?-Command\s+([\s\S]*)$/i,
  encodingPrelude: /^\s*\[Console\]::OutputEncoding\s*=\s*[^;]*;\s*/i,
};
