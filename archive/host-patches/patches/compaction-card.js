import { Box, Markdown, MouseRegion, truncateToWidth } from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";
import { keyText } from "./keybinding-hints.js";

// Sydney Kit compaction card, Pi 1.3.0. Only public summary text is rendered.
export class CompactionSummaryMessageComponent extends Box {
    expanded = false;
    constructor(message, markdownTheme = getMarkdownTheme(), outputPad = 1) {
        super(outputPad, 0);
        this.message = message;
        this.markdownTheme = markdownTheme;
        this.updateDisplay();
    }
    render(width) {
        if (width <= 0) return [];
        return super.render(width).map(line => truncateToWidth(line, width, "…"));
    }
    setExpanded(expanded) { this.expanded = expanded; this.updateDisplay(); }
    setOutputPad(outputPad) { this.setPaddingX(outputPad); }
    invalidate() { super.invalidate(); this.updateDisplay(); }
    updateDisplay() {
        this.clear();
        const count = this.message.tokensBefore;
        const valid = Number.isFinite(count) && count >= 0;
        const exact = valid ? count.toLocaleString("en-US") : "未知";
        const short = valid && count >= 1000 ? `${(count / 1000).toFixed(1)}k` : exact;
        const summary = typeof this.message.summary === "string" && this.message.summary.trim()
            ? this.message.summary : "暂无可读摘要。";
        const markdown = new Markdown(summary, 0, 0, this.markdownTheme);
        const content = {
            invalidate() { markdown.invalidate(); },
            render: (width) => {
                if (width <= 0) return [];
                const header = theme.fg("success", "✓") + " " + theme.fg("accent", "压缩上下文") + " "
                    + theme.fg("muted", `压缩前 ${this.expanded ? exact : short} tokens ${this.expanded ? "▾" : "▸"} ${keyText("app.tools.expand")} ${this.expanded ? "收起" : "展开"}`);
                const lines = [truncateToWidth(header, width, "…")];
                if (this.expanded) {
                    const prefix = theme.fg("dim", "  │ ");
                    for (const line of markdown.render(Math.max(1, width - 4))) {
                        lines.push(truncateToWidth(prefix + line, width, "…"));
                    }
                }
                return lines;
            },
        };
        this.addChild(new MouseRegion(content, (event) => {
            if (event.type !== "click" || event.button !== "left") return undefined;
            this.setExpanded(!this.expanded);
            return { handled: true };
        }));
    }
}
