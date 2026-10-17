import { footerConfig } from '../../config';
import { homedir } from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const clean = (text: string) => text.replace(/[\r\n\t]/g, " ");
// Nerd Font: microchip, bolt, database, folder-open, git branch.
const icons = footerConfig.icons;

// Keep the model and context readable when the terminal becomes narrow.
function columns(left: string, right: string, width: number): string {
  if (width <= 0) return "";
  const leftWidth = visibleWidth(left);
  if (leftWidth >= width) return truncateToWidth(left, width, "…");
  const clipped = truncateToWidth(right, Math.max(0, width - leftWidth - 2), "…");
  return left + " ".repeat(Math.max(0, width - leftWidth - visibleWidth(clipped))) + clipped;
}

export default function (pi: ExtensionAPI) {
  let current: ExtensionContext;
  let redraw: (() => void) | undefined;
  let enabled = true;
  let usageRevision=0;

  function install(ctx: ExtensionContext) {
    current = ctx;
    if (ctx.mode !== "tui") return;
    ctx.ui.setFooter((tui, theme, footerData) => {
      redraw = () => tui.requestRender();
      const unsubscribe = footerData.onBranchChange(redraw);
      let usageKey:unknown[]|undefined;
      let cachedUsage:ReturnType<ExtensionContext['getContextUsage']>;
      return {
        invalidate() {},
        dispose() { unsubscribe(); redraw = undefined; },
        render(width: number): string[] {
          const ctx = current;
          const sm = ctx.sessionManager;
          const available = Math.max(0, width - footerConfig.indent);
          let cwd = clean(sm.getCwd()).replace(/\\/g, "/");
          const home = homedir().replace(/\\/g, "/");
          if (cwd.toLowerCase() === home.toLowerCase()) cwd = "~";
          else if (cwd.toLowerCase().startsWith(home.toLowerCase() + "/")) cwd = "~" + cwd.slice(home.length);
          const branch = footerData.getGitBranch();
          const path = theme.fg("accent", `${icons.folder} `) + theme.fg("dim", cwd)
            + (branch ? theme.fg("muted", `  ${icons.branch} ${clean(branch)}`) : "");
          const model = theme.fg("accent", `${icons.model} ${clean(ctx.model?.id ?? "no-model")}`)
            + (ctx.model?.reasoning ? theme.fg("muted", `  ${icons.effort} ${pi.getThinkingLevel()}`) : "");

          const modelInfo=ctx.model;
          const nextUsageKey=[sm,sm.getLeafId?.(),modelInfo?.provider,modelInfo?.id,modelInfo?.contextWindow,usageRevision];
          if(!usageKey||nextUsageKey.some((value,i)=>!Object.is(value,usageKey![i]))){cachedUsage=ctx.getContextUsage();usageKey=nextUsageKey;}
          const usage = cachedUsage;
          const percent = usage?.percent;
          const known = typeof percent === "number" && Number.isFinite(percent);
          const color = known && percent >= footerConfig.errorPercent ? "error" : known && percent >= footerConfig.warningPercent ? "warning" : "accent";
          const filled = known ? Math.round(Math.max(0, Math.min(100, percent)) / (100 / footerConfig.barCells)) : 0;
          const context = theme.fg(color, `${icons.context} ${available < footerConfig.shortContextWidth ? "Ctx" : "Context"} ${known ? `${Math.round(percent)}%` : "?"}`)
            + (available >= footerConfig.barWidthThreshold ? " " + theme.fg(color, "▰".repeat(filled)) + theme.fg("muted", "▱".repeat(footerConfig.barCells - filled)) : "");
          const indent = width >= footerConfig.indent ? " ".repeat(footerConfig.indent) : "";
          const lines = [indent + columns(model + "   " + context, path, available)];
          // Extension statuses remain visible; background-task widgets are owned by their extension.
          const statuses = [...footerData.getExtensionStatuses().entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, text]) => clean(text).trim()).filter(Boolean);
          if (statuses.length) lines.push(indent + truncateToWidth(statuses.join("   ·   "), available, "…"));
          return lines;
        },
      };
    });
  }

  pi.on("session_start", (_event, ctx) => { if (enabled) install(ctx); });
  for (const event of ["agent_start", "agent_end", "agent_settled", "model_select", "session_switch", "session_tree", "session_compact", "message_end"] as const) {
    pi.on(event, (_event, ctx) => { current = ctx; usageRevision++; redraw?.(); });
  }
  pi.on("session_shutdown", () => { redraw = undefined; });
  pi.registerCommand("clean-footer", {
    description: "Toggle the compact status bar for this session",
    handler: async (_args, ctx) => {
      enabled = !enabled;
      if (enabled) install(ctx);
      else { ctx.ui.setFooter(undefined); redraw = undefined; }
      ctx.ui.notify(enabled ? "简洁状态栏已启用" : "已恢复默认状态栏（本次会话）", "info");
    },
  });
}
