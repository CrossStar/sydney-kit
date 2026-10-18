import { CustomEditor, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { EditorBase } from './editor';
import { createPromptEditorClass } from '../../vendor/prompt-editor';
import { appearance } from '../../config';

type Phase = keyof typeof appearance.statusLabels;
export default function registerAppearance(pi: ExtensionAPI): EditorBase {
  let active = false;
  let phase: Phase = 'working';
  let displayed: Phase | undefined;
  const tools = new Set<string>();

  function update(ctx: ExtensionContext) {
    if (!active || ctx.mode !== 'tui') return;
    const next: Phase = tools.size ? 'tools' : phase;
    // A stream delta must not restart the animation on every token.
    if (next === displayed) return;
    displayed = next;
    const chars = [...appearance.statusLabels[next]];
    const frames = chars.map((_, i) => chars.map((c,j) => ctx.ui.theme.fg(j===i?'accent':'muted',c)).join(''));
    ctx.ui.setWorkingIndicator({frames, intervalMs:appearance.frameIntervalMs});
    ctx.ui.setWorkingMessage('');
  }
  function reset(ctx: ExtensionContext) {
    const wasActive = active;
    active=false;phase='working';displayed=undefined;tools.clear();
    if (wasActive && ctx.mode==='tui') {ctx.ui.setWorkingIndicator();ctx.ui.setWorkingMessage();}
  }
  pi.on('agent_start', (_event, ctx) => {
    active=true;phase='working';displayed=undefined;tools.clear();update(ctx);
  });
  pi.on('message_update', (event, ctx) => {
    if (!active) return;
    const type=event.assistantMessageEvent.type;
    if (type==='thinking_start' || type==='thinking_delta') phase='thinking';
    else if (type==='text_start' || type==='text_delta') phase='responding';
    else if (type==='thinking_end' || type==='text_end' || type==='toolcall_start' || type==='toolcall_delta' || type==='toolcall_end' || type==='done' || type==='error') phase='working';
    update(ctx);
  });
  pi.on('message_end', (event,ctx) => {
    if (event.message.role==='assistant') {phase='working';update(ctx);}
  });
  pi.on('tool_execution_start', (event,ctx) => {
    if (!active) return;
    tools.add(event.toolCallId);update(ctx);
  });
  pi.on('tool_execution_end', (event,ctx) => {
    tools.delete(event.toolCallId);update(ctx);
  });
  pi.on('agent_end', (_event, ctx) => reset(ctx));
  pi.on('agent_settled', (_event, ctx) => reset(ctx));
  pi.on('session_switch', (_event, ctx) => reset(ctx));
  pi.on('session_shutdown', (_event, ctx) => reset(ctx));

  return ctx => {
    const Editor = createPromptEditorClass(CustomEditor, text => ctx.ui.theme.fg('accent', text), appearance.boxedEditor);
    class MatchedBorderEditor extends Editor {
      override render(width: number): string[] {
        // The host assigns thinking-level border colors on mode changes.
        // This editor deliberately keeps its public borderColor aligned with message rules.
        this.borderColor = text => ctx.ui.theme.fg(appearance.borderColor, text);
        return super.render(width);
      }
    }
    return (tui, theme, keys) => new MatchedBorderEditor(tui, theme, keys);
  };
}
