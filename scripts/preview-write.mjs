#!/usr/bin/env node
// Visual proposal v2 for the compact write card. Mock data only: no writes, SSH, or model calls.
import { setTimeout as delay } from 'node:timers/promises';

const argv = process.argv.slice(2);
const opt = { compare: false, zh: false, plain: false, animate: false, width: undefined };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help') {
    console.log(`Usage: node scripts/preview-write.mjs [--compare] [--zh] [--animate] [--width N] [--plain]
  --compare  show the current card above each proposal
  --zh       Chinese status words (default English, matching other tool cards)
  --animate  replay drafting -> writing -> created in place (TTY only)
  --width N  render at N columns (default: terminal width, max 100)
Mock-up only; no write, SSH, or model calls.`);
    process.exit(0);
  } else if (a === '--compare') opt.compare = true;
  else if (a === '--zh') opt.zh = true;
  else if (a === '--plain') opt.plain = true;
  else if (a === '--animate') opt.animate = true;
  else if (a === '--width') {
    opt.width = Number(argv[++i]);
    if (!Number.isInteger(opt.width) || opt.width < 30 || opt.width > 200) throw Error('--width must be an integer from 30 to 200');
  } else throw Error(`Unknown option: ${a}`);
}

const W = opt.width ?? Math.min(process.stdout.columns || 100, 100);
const color = process.stdout.isTTY && !opt.plain && !process.env.NO_COLOR;
const sgr = code => s => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const c = { dim: sgr('2'), bold: sgr('1'), green: sgr('32'), red: sgr('31'), yellow: sgr('33'), cyan: sgr('36') };
const plain = s => s;

const T = opt.zh
  ? {
      drafting: '生成中', writing: '写入中', created: '新建', updated: '更新', unchanged: '未变化', written: '已写入',
      empty: '空文件', denied: '权限不足', unverified: '结果未确认', eof: '末尾换行', lines: n => `${n} 行`,
      more: n => `… 还有 ${n} 行`, noDiff: '无差异：原文件超过 2 MB 快照上限，以下为新内容',
      lost: '写入期间连接中断，请读取文件确认', eofNote: '在文件末尾补充换行',
    }
  : {
      drafting: 'drafting', writing: 'writing', created: 'created', updated: 'updated', unchanged: 'unchanged', written: 'written',
      empty: 'empty', denied: 'permission denied', unverified: 'unverified', eof: 'newline at EOF', lines: n => `${n} lines`,
      more: n => `… ${n} more lines`, noDiff: 'no diff: previous file exceeds the 2 MB snapshot limit; new content below',
      lost: 'connection lost during write · read the file to confirm', eofNote: 'newline added at end of file',
    };

// Display width with CJK double-width characters; enough for this mock-up.
const ANSI = /\x1b\[[0-9;]*m/g;
const cw = ch => {
  const p = ch.codePointAt(0);
  return p >= 0x1100 && (p <= 0x115f || (p >= 0x2e80 && p <= 0xa4cf) || (p >= 0xac00 && p <= 0xd7a3) || (p >= 0xf900 && p <= 0xfaff) || (p >= 0xfe30 && p <= 0xfe4f) || (p >= 0xff00 && p <= 0xff60) || (p >= 0xffe0 && p <= 0xffe6)) ? 2 : 1;
};
const vis = s => [...s.replace(ANSI, '')].reduce((n, ch) => n + cw(ch), 0);
function clipRight(s, w) {
  if (vis(s) <= w) return s;
  let out = '', n = 0;
  for (const ch of s) { if (n + cw(ch) > w - 1) break; out += ch; n += cw(ch); }
  return out + '…';
}
function clipLeft(s, w) {
  if (vis(s) <= w) return s;
  const chars = [...s];
  let out = '', n = 0;
  for (let i = chars.length - 1; i >= 0; i--) { if (n + cw(chars[i]) > w - 1) break; out = chars[i] + out; n += cw(chars[i]); }
  return '…' + out;
}

// Drop whole leading directories first so the file name stays readable.
function clipPath(path, w) {
  if (vis(path) <= w) return path;
  const parts = path.split('/');
  for (let i = 1; i < parts.length; i++) {
    const tail = '…/' + parts.slice(i).join('/');
    if (vis(tail) <= w) return tail;
  }
  return clipLeft(parts.at(-1), w);
}

// Status groups: words inside a group join with spaces, groups join with " · ".
const statText = groups => groups.map(g => g.map(([t]) => t).join(' ')).join(' · ');
const statPaint = groups => groups.map(g => g.map(([t, f]) => (f ?? c.dim)(t)).join(' ')).join(c.dim(' · '));
const INDENT = '  ', BODY = '    ', LABEL = 7;

function render(card, width = W) {
  const avail = width - INDENT.length;
  const prefixW = vis(card.icon) + 1 + LABEL + 1;
  const sW = vis(statText(card.stat));
  const full = card.host ? `${card.host}:${card.path}` : card.path;
  const base = card.path.split('/').pop();
  const hostW = card.host ? vis(card.host) + 1 : 0;
  const room = avail - prefixW - sW - 2;
  // Narrow terminals keep the file name and move the status below instead of dropping it.
  const inline = room >= Math.min(vis(full), hostW + vis(base) + 2);
  const pathRoom = inline ? room : avail - prefixW;
  const shown = card.host ? `${card.host}:${clipPath(card.path, pathRoom - vis(card.host) - 1)}` : clipPath(full, pathRoom);
  let head = INDENT + card.iconColor(card.icon) + ' ' + card.labelColor('write'.padEnd(LABEL)) + ' ' + shown;
  if (inline) head += ' '.repeat(Math.max(1, avail - prefixW - vis(shown) - sW)) + statPaint(card.stat);
  const out = [head];
  if (!inline) out.push(INDENT + BODY + statPaint(card.stat));
  for (const [text, f] of card.body ?? []) out.push(INDENT + BODY + (f ?? plain)(clipRight(text, avail - BODY.length)));
  return out;
}

const num = n => String(n).padStart(3);
const del = (n, t) => [`${num(n)} - ${t}`, c.red];
const add = (n, t) => [`${num(n)} + ${t}`, c.green];
const ctx = (n, t) => [`${num(n)}   ${t}`, c.dim];
const src = (n, t) => [`${num(n)}  ${t}`, plain];
const note = (t, f = c.dim) => [t, f];
const changed = { icon: '✎', iconColor: c.yellow, labelColor: c.yellow };
const same = { icon: '✓', iconColor: c.green, labelColor: c.cyan };
const busy = { icon: '…', iconColor: c.dim, labelColor: c.cyan };
const bad = { icon: '✗', iconColor: c.red, labelColor: c.red };
const unsure = { icon: '!', iconColor: c.yellow, labelColor: c.yellow };
const counts = (a, r, arrow = '▸') => [['+' + a, c.green], ['−' + r, c.red], [arrow]];

const scenarios = [
  {
    title: '参数生成中：显示正在生成的内容尾部，明确尚未写入',
    current: { ...busy, path: 'src/config.ts', stat: [[['running']]] },
    next: { ...busy, path: 'src/config.ts', stat: [[[T.drafting]], [[T.lines(4)]]],
      body: [note(`${num(2)}    theme: "dark",`), note(`${num(3)}    retries: 3,`), note(`${num(4)}    timeout: 50▍`)] },
  },
  {
    title: '新建文件：直接预览内容，不再满屏 + 号',
    current: { ...changed, path: 'src/config.ts', stat: [counts(5, 0)],
      body: [add(1, 'export const config = {'), add(2, '  theme: "dark",'), add(3, '  retries: 3,'), add(4, '  timeout: 5000,'), add(5, '};')] },
    next: { ...changed, path: 'src/config.ts', stat: [[[T.created, c.green]], [[T.lines(5)], ['▸']]],
      body: [src(1, 'export const config = {'), src(2, '  theme: "dark",'), src(3, '  retries: 3,'), note(T.more(2))] },
  },
  {
    title: '覆盖已有文件：状态词 + 变化计数，正文仍是差异',
    current: { ...changed, path: 'src/config.ts', stat: [counts(2, 1)],
      body: [del(3, 'timeout: 1000,'), add(3, 'timeout: 5000,'), add(4, 'retries: 3,')] },
    next: { ...changed, path: 'src/config.ts', stat: [[[T.updated, c.yellow]], counts(2, 1)],
      body: [del(3, 'timeout: 1000,'), add(3, 'timeout: 5000,'), add(4, 'retries: 3,')] },
  },
  {
    title: '内容未变化：✓ 图标，无展开箭头',
    current: { ...changed, path: 'src/config.ts', stat: [counts(0, 0)] },
    next: { ...same, path: 'src/config.ts', stat: [[[T.unchanged]]] },
  },
  {
    title: '新建空文件',
    current: { ...changed, path: 'notes.txt', stat: [counts(0, 0)] },
    next: { ...changed, path: 'notes.txt', stat: [[[T.created, c.green]], [[T.empty]]] },
  },
  {
    title: '无法生成差异：一行说明原因，附有限预览',
    current: { ...changed, path: 'data/export.json', stat: [[['50000 lines']]] },
    next: { ...changed, path: 'data/export.json', stat: [[[T.written, c.yellow]], [[T.lines('50,000')], ['▸']]],
      body: [note(T.noDiff, c.yellow), note(`${num(1)}  {`), note(`${num(2)}    "records": [`)] },
  },
  {
    title: 'SSH：路径带主机前缀（scp 风格）',
    current: { ...changed, path: 'app/settings.json', stat: [counts(1, 1)],
      body: [del(2, '"interval": 10'), add(2, '"interval": 30')] },
    next: { ...changed, host: 'raspi', path: 'app/settings.json', stat: [[[T.updated, c.yellow]], counts(1, 1)],
      body: [del(2, '"interval": 10'), add(2, '"interval": 30')] },
  },
  {
    title: '写入失败：原因直接放在状态位',
    current: { ...bad, path: '/etc/app/config.json', stat: [[['failed']]],
      body: [note("EACCES: permission denied, open '/etc/app/config.json'", c.red)] },
    next: { ...bad, path: '/etc/app/config.json', stat: [[[T.denied, c.red]]],
      body: [note("EACCES: permission denied, open '/etc/app/config.json'", c.dim)] },
  },
  {
    title: '结果不确定：与“失败”区分',
    current: { ...bad, path: 'app/settings.json', stat: [[['failed']]], body: [note('Error: connection lost', c.red)] },
    next: { ...unsure, host: 'raspi', path: 'app/settings.json', stat: [[[T.unverified, c.yellow]]], body: [note(T.lost, c.yellow)] },
  },
  {
    title: '仅末尾换行变化：不再显示两行一样的增删',
    current: { ...changed, path: '.env.example', stat: [counts(1, 1)], body: [del(1, 'PORT=3000'), add(1, 'PORT=3000')] },
    next: { ...changed, path: '.env.example', stat: [[[T.updated, c.yellow]], [[T.eof]]], body: [note(`  ⏎ + ${T.eofNote}`, c.green)] },
  },
];

const rule = s => console.log('\n' + c.bold(s) + ' ' + c.dim('─'.repeat(Math.max(0, Math.min(W, 72) - vis(s) - 1))));
const tag = s => console.log(c.dim(`  ${s}`));
const print = card => { for (const line of render(card)) console.log(line); };

console.log(c.bold('write 卡片方案 v2') + c.dim(` · ${W} 列 · 模拟数据，不执行写入`));
scenarios.forEach((s, i) => {
  rule(`${i + 1}. ${s.title}`);
  if (opt.compare) { tag('当前'); print(s.current); tag('方案'); }
  print(s.next);
});

rule(`${scenarios.length + 1}. 展开后（▾）：完整路径、大小变化与带上下文的差异`);
print({ ...changed, host: 'raspi', path: 'app/settings.json', stat: [[[T.updated, c.yellow]], counts(1, 1, '▾')],
  body: [note('raspi:/home/sydney-raspi/app/settings.json · 1.2 KB → 1.2 KB'), note('@@ -1,4 +1,4 @@'),
    ctx(1, '{'), del(2, '  "interval": 10,'), add(2, '  "interval": 30,'), ctx(3, '  "retries": 3'), ctx(4, '}')] });

rule(`${scenarios.length + 2}. 窄屏（40 列）：保留文件名，状态换到下一行`);
for (const card of [scenarios[2].next, scenarios[6].next]) for (const line of render({ ...card, path: 'packages/server/src/services/' + card.path.split('/').pop(), body: card.body?.slice(0, 1) }, 40)) console.log(line);

if (opt.animate) {
  rule(`${scenarios.length + 3}. 动态：生成中 → 写入中 → 新建`);
  if (!process.stdout.isTTY) console.log(c.dim('  (--animate 需要交互终端)'));
  else {
    const content = ['export const config = {', '  theme: "dark",', '  retries: 3,', '  timeout: 5000,', '};'];
    let previous = 0;
    const draw = card => {
      const lines = render(card);
      if (previous) process.stdout.write(`\x1b[${previous}A\x1b[J`);
      process.stdout.write(lines.join('\n') + '\n');
      previous = lines.length;
    };
    for (let n = 1; n <= content.length; n++) {
      const tail = content.slice(Math.max(0, n - 3), n).map((t, k, all) => note(`${num(n - all.length + k + 1)}  ${t}${k === all.length - 1 ? '▍' : ''}`));
      draw({ ...busy, path: 'src/config.ts', stat: [[[T.drafting]], [[T.lines(n)]]], body: tail });
      await delay(500);
    }
    draw({ ...busy, path: 'src/config.ts', stat: [[[T.writing]]] });
    await delay(600);
    draw({ ...changed, path: 'src/config.ts', stat: [[[T.created, c.green]], [[T.lines(5)], ['▸']]],
      body: [src(1, content[0]), src(2, content[1]), src(3, content[2]), note(T.more(2))] });
  }
}

console.log('\n' + c.dim('▸ ▾ 为视觉占位，不可交互。--compare 对照当前样式，--zh 切换中文状态词。'));
