import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { messageRules } from '../../config';

// A display-only closing fence prevents unfinished code blocks from swallowing
// the footer. Preserve the original prompt; this suffix exists only in Markdown.
function closeOpenFence(text: string): string {
  let fence: { marker: string; length: number } | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (close && close[1][0] === fence.marker && close[1].length >= fence.length) fence = undefined;
    } else {
      const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (open && !(open[1][0] === '`' && open[2].includes('`'))) fence = { marker: open[1][0], length: open[1].length };
    }
  }
  return fence ? `\n${fence.marker.repeat(fence.length)}` : '';
}

export default function registerUserMessage(pi: ExtensionAPI) {
  let current: ExtensionContext | undefined;
  for (const event of ['session_start', 'session_switch', 'session_tree', 'message_start'] as const) {
    pi.on(event, (_event, ctx) => { current = ctx; });
  }
  pi.on('session_shutdown', () => { current = undefined; });
  pi.registerMarkdownTransformer((text, context) => {
    if (context.messageType !== 'user') return text;
    const width = Math.max(0, context.availableWidth);
    const topRule = messageRules.top.repeat(width);
    const bottomRule = messageRules.bottom.repeat(width);
    const top = current?.ui.theme.fg('borderMuted', topRule) ?? topRule;
    const bottom = current?.ui.theme.fg('borderMuted', bottomRule) ?? bottomRule;
    // Blank lines end list/quote/table blocks before the standalone rules.
    return `${top}\n\n${text}${closeOpenFence(text)}\n\n${bottom}`;
  });
}
