import { CustomEditor, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';

type EditorFactory = NonNullable<ReturnType<ExtensionContext['ui']['getEditorComponent']>>;
type Editor = ReturnType<EditorFactory>;
export type EditorBase = (ctx: ExtensionContext) => EditorFactory;
export type EditorDecorator = (editor: Editor, tui: Parameters<EditorFactory>[0]) => Editor;

/**
 * The single owner of setEditorComponent for this extension. Features contribute an optional base editor and
 * decorators; composition order is fixed here instead of depending on event-handler registration order.
 */
export class EditorPipeline {
  private base?: EditorBase;
  private decorators: EditorDecorator[] = [];
  setBase(base: EditorBase) { this.base = base; }
  decorate(decorator: EditorDecorator) { this.decorators.push(decorator); }
  get empty() { return !this.base && !this.decorators.length; }

  /** Returns a restore function that only reverts if no one else replaced the editor since. */
  install(ctx: ExtensionContext): () => void {
    const previous = ctx.ui.getEditorComponent();
    const base: EditorFactory = this.base?.(ctx) ?? previous ?? ((tui, theme, keys) => new CustomEditor(tui, theme, keys));
    const factory: EditorFactory = (tui, theme, keys) => this.decorators.reduce((editor, decorate) => decorate(editor, tui), base(tui, theme, keys));
    ctx.ui.setEditorComponent(factory);
    return () => { if (ctx.ui.getEditorComponent() === factory) ctx.ui.setEditorComponent(previous); };
  }
}

export default function registerEditor(pi: ExtensionAPI, pipeline: EditorPipeline) {
  let restore: (() => void) | undefined;
  pi.on('session_start', (_event, ctx) => {
    if (ctx.mode !== 'tui' || pipeline.empty) return;
    restore = pipeline.install(ctx);
  });
  pi.on('session_shutdown', () => { restore?.(); restore = undefined; });
}
