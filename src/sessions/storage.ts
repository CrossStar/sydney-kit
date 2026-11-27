import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';

/** Read only: never opens SessionManager (which can migrate old files). */
export async function snapshot(path: string) {
  const raw = await readFile(path, 'utf8');
  const entries = raw.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  return { entries, fingerprint: createHash('sha256').update(raw).digest('hex') };
}
export function recordedChildren(entries: any[], cwd: string): Set<string> {
  return new Set(entries.flatMap(e => e.type === 'custom' && e.customType === 'subagents:record' && typeof e.data?.sessionFile === 'string' ? [resolve(cwd, e.data.sessionFile)] : []));
}
export async function childrenOf(sessions: {path: string; cwd: string; parentSessionPath?: string}[]) {
  const children = new Set<string>();
  const files = new Map<string, string>();
  for (const s of sessions) {
    files.set(s.path, s.cwd);
    if (s.parentSessionPath) files.set(resolve(dirname(s.path), s.parentSessionPath), s.cwd);
  }
  for (const [path, cwd] of files) {
    try {
      const {entries} = await snapshot(path);
      for (const child of recordedChildren(entries, entries.find(e => e.type === 'session')?.cwd ?? cwd)) children.add(child);
    } catch { /* Unknown sessions remain visible. */ }
  }
  return children;
}
export function transcript(entries: any[], limit: number): string {
  let text = '';
  for (const e of entries) {
    const m = e.message;
    if (e.type !== 'message' || !['user', 'assistant'].includes(m?.role)) continue;
    const content = typeof m.content === 'string' ? m.content : (m.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
    text += `${m.role}: ${content}\n`.slice(0, limit - text.length);
    if (text.length >= limit) break;
  }
  return text;
}
