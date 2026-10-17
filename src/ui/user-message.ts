import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { messageRules } from '../../config';

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
    return `${top}  \n${text}  \n${bottom}`;
  });
}
