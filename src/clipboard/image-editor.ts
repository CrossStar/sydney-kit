import { matchesKey } from '@earendil-works/pi-tui';
import type { EditorDecorator } from '../ui/editor';
import { imageTokens } from './image-token';

/** Backspace at or inside an image placeholder deletes the whole token. Wraps the instance; no prototypes or host files change. */
export function imageBackspace(isImageToken: (token: string) => boolean): EditorDecorator {
  return (editor: any, tui) => {
    const input = editor.handleInput.bind(editor), bound = new Map<PropertyKey, unknown>();
    const handler = (data: string) => {
      if (matchesKey(data, 'backspace') || matchesKey(data, 'shift+backspace')) {
        const cursor = editor.getCursor?.(), line = cursor ? editor.getLines()[cursor.line] : '';
        if (cursor) {
          for (const match of imageTokens(line)) {
            const start = match.index!, end = start + match[0].length;
            if (!isImageToken(match[0]) || cursor.col <= start || cursor.col > end + 1 || (cursor.col === end + 1 && line[end] !== ' ')) continue;
            // Route through native editing so other paste markers, cursor state and undo history survive.
            for (let n = cursor.col; n < end; n++) input('\x1b[C');
            const count = [...line.slice(start, Math.max(end, cursor.col))].length;
            for (let n = 0; n < count; n++) input('\x7f');
            tui.requestRender();
            return;
          }
        }
      }
      input(data);
    };
    return new Proxy(editor, {
      get(target, key) {
        if (key === 'handleInput') return handler;
        const value = Reflect.get(target, key, target);
        if (typeof value !== 'function') return value;
        if (!bound.has(key)) bound.set(key, value.bind(target));
        return bound.get(key);
      },
      set(target, key, value) { bound.delete(key); return Reflect.set(target, key, value, target); },
    });
  };
}
