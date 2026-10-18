import { homedir } from 'node:os';
import { compact as cfg } from '../../config';

const SUMMARY_FIELDS = ['path', 'file_path', 'query', 'queries', 'pattern', 'command', 'url', 'urls', 'name', 'objective', 'claim', 'prompt'];
const POWERSHELL_WRAPPER = /^\s*(?:powershell|pwsh)(?:\.exe)?\s+(?:-NoProfile\s+)?-Command\s+([\s\S]*)$/i;
const ENCODING_PRELUDE = /^\s*\[Console\]::OutputEncoding\s*=\s*[^;]*;\s*/i;

export const clean = (s: unknown) => String(s ?? '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x1f\x7f]/g, ' ');
export const nonEmptyLines = (text: string) => text.split(/\r?\n/).filter(s => s.trim()).map(clean);
export const textOutput = (result: any): string => (result?.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
export const lineCount = (s: string) => s ? s.replace(/\r?\n$/, '').split('\n').length : 0;

/** Tools that print a JSON object as text get it merged under their structured details. */
export function withJsonOutput(details: any, output: string) {
  try {
    const parsed = JSON.parse(output);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { ...parsed, ...details };
  } catch {}
  return details;
}

export function shortPath(value: string, cwd: string) {
  const p = value.replace(/\\/g, '/');
  for (const [root, prefix] of [[cwd, ''], [homedir(), '~']] as const) {
    const r = root.replace(/\\/g, '/').replace(/\/$/, '');
    if (p.toLowerCase() === r.toLowerCase()) return prefix || '.';
    if (p.toLowerCase().startsWith(r.toLowerCase() + '/')) return (prefix ? prefix + '/' : '') + p.slice(r.length + 1);
  }
  return p;
}

/** Generic [label, description] for any tool call: the executable for commands, otherwise the first known argument. */
export function summary(name: string, args: any, cwd: string): [string, string] {
  if (typeof args.command === 'string') {
    let cmd = args.command.trim();
    const ps = cmd.match(POWERSHELL_WRAPPER);
    if (ps) {
      cmd = ps[1];
      if ((cmd.startsWith("'") && cmd.endsWith("'")) || (cmd.startsWith('"') && cmd.endsWith('"'))) cmd = cmd.slice(1, -1);
      return ['ps', clean(cmd.replace(ENCODING_PRELUDE, ''))];
    }
    const exe = cmd.match(/^\s*(?:"([^"]+)"|([^\s]+))/);
    const token = exe?.[1] ?? exe?.[2] ?? name;
    const base = token.replace(/\\/g, '/').split('/').pop()!.replace(/\.exe$/i, '');
    if (base === 'rg' && cmd.includes('--files')) {
      const patterns = [...cmd.matchAll(/(?:-g|--glob)\s+(?:'([^']*)'|"([^"]*)"|(\S+))/g)].map(m => m[1] ?? m[2] ?? m[3]).filter(s => !s.startsWith('!'));
      if (patterns.length) return ['rg', clean(patterns.join(' '))];
    }
    return [cfg.aliases[base] ?? base, clean(cmd.slice(exe?.[0].length ?? 0).trim())];
  }
  const short = name.split(/\.|__/).pop() ?? name;
  for (const key of SUMMARY_FIELDS) if (args[key] != null) {
    const value = args[key];
    const display = ['path', 'file_path'].includes(key) ? shortPath(String(value), cwd) : typeof value === 'string' ? value : JSON.stringify(value);
    return [short, clean(display)];
  }
  return [short, clean(JSON.stringify(args))];
}
