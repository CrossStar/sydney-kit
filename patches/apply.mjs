// Markdown code-block hook: lets sydney-kit render fenced code while keeping Pi's renderer as fallback.
import { PI_HOST_VERSION, runPatchCli } from './engine.mjs';
const anchor = '            case "code": {\n';
const marker = `// sydney-kit markdown hook v1 (Pi ${PI_HOST_VERSION})\nglobalThis.__sydneyKitMarkdownHookVersion = "${PI_HOST_VERSION}";\n`;
const hook = `                // sydney-kit: presentation only; any failure preserves the stock renderer.
                try {
                    const custom = globalThis.__sydneyKit?.renderCodeBlock?.(token.text, token.lang, width, {
                        raw: token.raw, styled: !!this.defaultTextStyle,
                        invalidate: () => this.invalidate()
                    });
                    if (Array.isArray(custom) && custom.every(line => typeof line === "string")) {
                        lines.push(...custom);
                        if (nextTokenType && nextTokenType !== "space") lines.push("");
                        break;
                    }
                } catch { /* Fall back to Pi's original cli-highlight renderer. */ }
`;
runPatchCli({
  target: 'pi-tui/dist/components/markdown.js',
  backupSuffix: 'sydney-kit',
  originalSha256: '43185f806cc13c2adbe7f30b30be35bba4fce7a5ead4da81f53fe62b9bbbdc3d',
  transform(original) {
    if (original.split(anchor).length !== 2) throw Error('Expected exactly one code-token anchor');
    return marker + original.replace(anchor, () => anchor + hook);
  },
});
