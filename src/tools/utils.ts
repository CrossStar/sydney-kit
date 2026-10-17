import { homedir } from 'node:os';
import { compact as cfg } from '../../config';
export const clean = (s: unknown) => String(s ?? '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x1f\x7f]/g, ' ');
export function shortPath(value: string, cwd: string) {
  const p = value.replace(/\\/g, '/');
  for (const [root, prefix] of [[cwd, ''], [homedir(), '~']] as const) {
    const r = root.replace(/\\/g, '/').replace(/\/$/, '');
    if (p.toLowerCase() === r.toLowerCase()) return prefix || '.';
    if (p.toLowerCase().startsWith(r.toLowerCase() + '/')) return (prefix ? prefix + '/' : '') + p.slice(r.length + 1);
  }
  return p;
}
export function summary(name: string, args: any, cwd: string): [string, string] {
  if (typeof args.command === 'string') {
    let cmd = args.command.trim();
    const ps = cmd.match(cfg.powershellWrapper);
    if (ps) {
      cmd = ps[1];
      if ((cmd.startsWith("'") && cmd.endsWith("'")) || (cmd.startsWith('"') && cmd.endsWith('"'))) cmd = cmd.slice(1, -1);
      return ['ps', clean(cmd.replace(cfg.encodingPrelude, ''))];
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
  for (const key of cfg.summaryFields) if (args[key] != null) {
    const value = args[key];
    const display = ['path','file_path'].includes(key) ? shortPath(String(value),cwd) : typeof value === 'string' ? value : JSON.stringify(value);
    return [short,clean(display)];
  }
  return [short, clean(JSON.stringify(args))];
}
export const textOutput = (result: any): string => (result?.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
export const lineCount = (s: string) => s ? s.replace(/\r?\n$/, '').split('\n').length : 0;
