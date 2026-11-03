/** Automatic LaTeX display rendering and user-facing display commands. */

import type {
  ExtensionAPI,
  ExtensionCommandContext
} from "@earendil-works/pi-coding-agent";
import { Image, getCapabilities } from '@earendil-works/pi-tui';
import { formulaColor } from './theme.js';
import { createMathBridge } from './math-bridge.mjs';
import { homedir } from "node:os";
import { join } from "node:path";
import { CacheManager } from "./cache.js";
import { LatexRenderer } from "./renderer.js";

const CACHE_DIR = join(homedir(), ".pi", "cache", "latex-inline");
const VERSION = "1.0.1"; // Bump when debugging reload issues
const CACHE_MAX_AGE_DAYS = 30;

export default async function activate(pi: ExtensionAPI): Promise<void> {
  // Initialize cache and renderer
  const cache = new CacheManager(CACHE_DIR);
  await cache.ensureDir();

  const renderer = new LatexRenderer(cache);
  let zoom = 1;
  const bridgeKey = Symbol.for('sydney-kit.math-block');
  let bridge: ReturnType<typeof createMathBridge> | undefined;
  pi.on('session_start', (_event, ctx) => {
    if (ctx.mode !== 'tui') return;
    bridge = createMathBridge({
      render: renderer.render.bind(renderer),
      zoom: () => zoom,
      color: () => formulaColor(ctx.ui.theme),
      supported: () => Boolean(getCapabilities().images),
      image: (data: string, cells: number) => new Image(data, 'image/png', { fallbackColor: (text: string) => text }, { maxWidthCells: cells }),
    });
    (globalThis as any)[bridgeKey] = bridge;
  });
  pi.on('session_shutdown', () => {
    bridge?.dispose();
    if ((globalThis as any)[bridgeKey] === bridge) delete (globalThis as any)[bridgeKey];
  });

  // Detect available renderers
  const availability = await renderer.detectRenderers();
  if (!availability.mathjax) {
    console.warn("[pi-latex] MathJax not available.");
  }
  if (!availability.sharp) {
    console.warn("[pi-latex] sharp not available.");
  }

  // Evict old cache entries on startup
  await cache.evictOldEntries(CACHE_MAX_AGE_DAYS);


  // Register slash commands
  pi.registerCommand('latex-zoom', {
    description: 'Set automatic formula zoom (0.5–3, reset = 1)',
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const value = args.trim();
      if (!value) {
        ctx.ui.notify(`Formula zoom: ${zoom}×. Usage: /latex-zoom 1.5 (0.5–3), /latex-zoom reset`, 'info');
        return;
      }
      const next = value === 'reset' ? 1 : Number(value);
      if (!Number.isFinite(next) || next < 0.5 || next > 3) {
        ctx.ui.notify('Usage: /latex-zoom <0.5–3> or /latex-zoom reset', 'error');
        return;
      }
      const tui = (globalThis as any)[Symbol.for('sydney-kit.math-tui')];
      if (!tui || !bridge) {
        ctx.ui.notify('Automatic formula zoom requires the patched host (scripts/pi-tern).', 'warning');
        return;
      }
      zoom = next;
      tui.invalidate();
      tui.requestRender(true);
      ctx.ui.notify(`Automatic formula zoom: ${zoom}× (limited by pane width)`, 'info');
    },
  });

  pi.registerCommand("latex-clear-cache", {
    description: "Clear the LaTeX render cache",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      await cache.clear();
      ctx.ui.notify("[pi-latex] Cache cleared", "info");
    }
  });

  pi.registerCommand("latex-status", {
    description: "Show LaTeX renderer status and cache info",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const stats = await cache.getStats();
      const availability = await renderer.detectRenderers();

      const lines = [
        "LaTeX Renderer Status",
        `  Version: ${VERSION}`,
        `  MathJax: ${availability.mathjax ? "available" : "not found"}`,
        `  sharp: ${availability.sharp ? "available" : "not found"}`,
        "",
        "Settings",
        `  Automatic formula zoom: ${zoom}×`,
        `  Base raster width: 60 cells`,
        "",
        "Cache Info",
        `  Location: ${CACHE_DIR}`,
        `  Entries: ${stats.entryCount}`,
        `  Size: ${formatBytes(stats.totalBytes)}`
      ];

      ctx.ui.notify(lines.join("\n"), "info");
    }
  });

}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
