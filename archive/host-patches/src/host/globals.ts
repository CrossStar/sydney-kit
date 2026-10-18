/** Contract with the patched host markdown.js (patches/apply.mjs). Property names are fixed by the patch. */
export interface CodeBlockMeta { raw: string; styled: boolean; invalidate: () => void }
export type RenderCodeBlock = (code: string, lang: string | undefined, width: number, meta: CodeBlockMeta) => string[] | undefined;

interface SydneyGlobals {
  __sydneyKit?: { renderCodeBlock?: RenderCodeBlock };
  /** Set by the patched module when it loads; absent until Pi restarts after patching. */
  __sydneyKitMarkdownHookVersion?: string;
}

export const hostGlobals = globalThis as typeof globalThis & SydneyGlobals;
